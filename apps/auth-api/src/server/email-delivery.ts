import { Effect, Result, Schema } from "effect";
import {
  AMBIGUOUS_DELIVERY_ERRORS,
  AUTOMATED_EMAIL_HEADERS,
  EMAIL_CODE_DELIVERY_BUDGET_MS,
  type PreparedEmailMessage,
  prepareEmailCode,
  prepareTeamInvite,
  RATE_LIMITED_DELIVERY_ERROR,
  type SmtpEmailConfig,
  type SmtpFailure,
  sendPrivateEmail,
} from "./smtp-email-delivery";
import type { EmailCodeDelivery, TeamInviteEmailDelivery, WorkerBindings } from "./types";

export class EmailDeliveryError extends Schema.TaggedError<EmailDeliveryError>()("EmailDeliveryError", {
  message: Schema.String,
}) {}

export type EmailDeliveryBindings = Pick<
  WorkerBindings,
  | "EMAIL_SMTP_HOST"
  | "EMAIL_SMTP_PORT"
  | "EMAIL_SMTP_USERNAME"
  | "EMAIL_SMTP_PASSWORD"
  | "EMAIL_FROM"
  | "EMAIL_RELAY"
  | "EMAIL_FALLBACK"
  | "EMAIL_DELIVERY_WEBHOOK_URL"
  | "EMAIL_DELIVERY_WEBHOOK_SECRET"
>;

/** The SMTP mailbox, and the Cloudflare Email Service binding that sends when the mailbox cannot. */
interface EmailSenders {
  smtp: SmtpEmailConfig;
  fallback: SendEmail | null;
}

export function createEmailCodeDelivery(bindings: EmailDeliveryBindings): EmailCodeDelivery | null {
  const senders = readEmailSenders(bindings);
  if (senders) {
    return { send: (message) => deliver(senders, prepareEmailCode(message)) };
  }

  const webhookUrl = bindings.EMAIL_DELIVERY_WEBHOOK_URL?.trim();
  if (!webhookUrl) return null;
  const url = new URL(webhookUrl);
  if (url.protocol !== "https:") {
    throw new Error("EMAIL_DELIVERY_WEBHOOK_URL must use HTTPS.");
  }
  const secret = bindings.EMAIL_DELIVERY_WEBHOOK_SECRET?.trim();
  const send = Effect.fn("EmailDelivery.sendCode")(function* (message: Parameters<EmailCodeDelivery["send"]>[0]) {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
          body: JSON.stringify(message),
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        }),
      catch: () => new EmailDeliveryError({ message: "email_delivery_unknown" }),
    });
    if (response.status === 429) return yield* new EmailDeliveryError({ message: RATE_LIMITED_DELIVERY_ERROR });
    if (!response.ok) return yield* new EmailDeliveryError({ message: "email_delivery_webhook_failed" });
  });
  return { send };
}

export function createTeamInviteEmailDelivery(bindings: EmailDeliveryBindings): TeamInviteEmailDelivery | null {
  const senders = readEmailSenders(bindings);
  return senders ? { send: (message) => deliver(senders, prepareTeamInvite(message)) } : null;
}

/**
 * Sends through the SMTP mailbox, and through Cloudflare when SMTP surely did not send the message.
 * When both fail, the SMTP failure is the answer, so a sender limit keeps its countdown, unless the
 * Cloudflare send may have reached the recipient.
 *
 * The fallback uses only the time left in `EMAIL_CODE_DELIVERY_BUDGET_MS`: after it, a replay of the
 * sign-in request takes a code that is still pending as sent.
 */
const deliver = Effect.fn("EmailDelivery.deliver")(function* (
  senders: EmailSenders,
  prepare: Effect.Effect<PreparedEmailMessage, SmtpFailure>,
): Effect.fn.Return<void, SmtpFailure | EmailDeliveryError> {
  const prepared = yield* Effect.result(prepare);
  if (Result.isFailure(prepared)) return yield* prepared.failure;
  const message = prepared.success;
  const startedAt = Date.now();
  const smtp = yield* Effect.result(sendPrivateEmail(senders.smtp, message));
  if (Result.isSuccess(smtp)) return;
  if (!senders.fallback || !canFallBack(smtp.failure.message)) return yield* smtp.failure;
  const remainingMs = EMAIL_CODE_DELIVERY_BUDGET_MS - (Date.now() - startedAt);
  if (remainingMs < CLOUDFLARE_MIN_SEND_MS) return yield* smtp.failure;
  console.warn("Email delivery falls back to Cloudflare:", { reason: smtp.failure.message });
  const fallback = yield* Effect.result(
    sendThroughCloudflare(
      senders.fallback,
      senders.smtp.from,
      message,
      Math.min(CLOUDFLARE_SEND_TIMEOUT_MS, remainingMs),
    ),
  );
  if (Result.isSuccess(fallback)) return;
  return yield* AMBIGUOUS_DELIVERY_ERRORS.has(fallback.failure.message) ? fallback.failure : smtp.failure;
});

// After these SMTP failures the message surely did not leave: a sender limit, a refusal of the
// sender or the message, or a connection that stopped before `DATA`. An unknown result may have
// reached the recipient, so a second send could deliver it twice. Invalid input or a refused
// recipient fails on any sender, and a configuration error must show in the logs, not hide behind
// the fallback.
function canFallBack(message: string): boolean {
  return (
    !AMBIGUOUS_DELIVERY_ERRORS.has(message) &&
    !message.startsWith("smtp_invalid_") &&
    message !== "smtp_port_must_be_465" &&
    message !== "smtp_recipient_failed"
  );
}

// The binding has no cancel signal. A send that passes this deadline may still reach the recipient.
const CLOUDFLARE_SEND_TIMEOUT_MS = 10_000;
// Below this, a send would end as unknown more often than it would succeed.
const CLOUDFLARE_MIN_SEND_MS = 2_000;

const sendThroughCloudflare = Effect.fn("EmailDelivery.cloudflare")(function* (
  binding: SendEmail,
  from: string,
  message: PreparedEmailMessage,
  timeoutMs: number,
): Effect.fn.Return<void, EmailDeliveryError> {
  const { subject, text, html } = message.content;
  yield* Effect.tryPromise({
    try: () =>
      binding.send({
        from: { name: "Hive", email: from },
        to: message.email,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        subject,
        text,
        html,
        headers: { ...AUTOMATED_EMAIL_HEADERS },
      }),
    catch: (error) => {
      console.warn("Cloudflare email delivery failed:", cloudflareErrorCode(error));
      return new EmailDeliveryError({ message: "email_delivery_fallback_failed" });
    },
  }).pipe(
    Effect.timeoutOrElse({
      duration: timeoutMs,
      orElse: () => Effect.fail(new EmailDeliveryError({ message: "email_delivery_unknown" })),
    }),
  );
});

// Only an error code goes to the log: the error text can hold the address of the recipient.
function cloudflareErrorCode(error: unknown): string {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  if (typeof code === "string" && /^[A-Za-z0-9_.-]{1,64}$/u.test(code)) return code;
  return error instanceof Error ? error.name : typeof error;
}

function readEmailSenders(bindings: EmailDeliveryBindings): EmailSenders | null {
  const smtp = readSmtpConfig(bindings);
  return smtp ? { smtp, fallback: bindings.EMAIL_FALLBACK ?? null } : null;
}

function readSmtpConfig(bindings: EmailDeliveryBindings): SmtpEmailConfig | null {
  const values = {
    host: bindings.EMAIL_SMTP_HOST?.trim(),
    port: bindings.EMAIL_SMTP_PORT?.trim(),
    username: bindings.EMAIL_SMTP_USERNAME?.trim(),
    password: bindings.EMAIL_SMTP_PASSWORD,
    from: bindings.EMAIL_FROM?.trim(),
  };
  const configuredCount = Object.values(values).filter((value) => value !== undefined && value !== "").length;
  if (configuredCount === 0) return null;
  if (
    configuredCount !== Object.keys(values).length ||
    !values.host ||
    !values.port ||
    !values.username ||
    !values.password ||
    !values.from
  ) {
    throw new Error("SMTP email delivery configuration is incomplete.");
  }
  return {
    host: values.host,
    port: Number(values.port),
    username: values.username,
    password: values.password,
    from: values.from,
    ...(bindings.EMAIL_RELAY ? { relay: bindings.EMAIL_RELAY } : {}),
  };
}
