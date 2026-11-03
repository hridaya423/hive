import { FIRST_TOUCH_CAMPAIGN_FIELDS, type FirstTouch, parseFirstTouch } from "@openbot/contracts/first-touch";
import { isOneOf } from "@openbot/contracts/runtime-values";
import { Effect, Schema } from "effect";

/** The same OpenPanel project as the desktop app and the website. ANALYTICS.md is the contract. */
const OPENPANEL_API_URL = "https://analytics.openbot.run/api";
const ACCOUNT_ANALYTICS_SCHEMA_VERSION = 13;
const SEND_TIMEOUT_MS = 5_000;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

/** The client that verified the sign-in code that created the account. */
const ACCOUNT_SURFACES = ["desktop", "mobile", "web"] as const;
export type AccountSurface = (typeof ACCOUNT_SURFACES)[number];
/** Where the account service learned the first touch of an account. */
const ATTRIBUTION_SOURCES = ["sign_in"] as const;
export type AttributionSource = (typeof ATTRIBUTION_SOURCES)[number];

/** The kinds of email that the Worker sends through the shared SMTP mailbox. */
const EMAIL_KINDS = ["sign_in_code", "team_invite"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];
/** `unknown`: the server got the message but did not confirm it, so it can count against the quota. */
const EMAIL_RESULTS = ["accepted", "rate_limited", "unknown", "failed"] as const;
export type EmailResult = (typeof EMAIL_RESULTS)[number];

type AnalyticsProperties = Record<string, string | number | boolean>;

type AccountAnalyticsEvent =
  | { name: "account_created"; surface: AccountSurface; firstTouch: FirstTouch | null }
  | { name: "account_attributed"; via: AttributionSource; firstTouch: FirstTouch }
  | { name: "email_sent"; kind: EmailKind; result: EmailResult };

/** Account events that only the Worker sees: new accounts and email sends. */
export interface AccountAnalytics {
  /**
   * Never throws and never waits: a failed send loses the event, not the request. `null` is for an
   * event with no account, such as `email_sent`: it has no `profileId`.
   */
  track(accountId: string | null, event: AccountAnalyticsEvent): void;
}

export const NO_ACCOUNT_ANALYTICS: AccountAnalytics = { track: () => undefined };

export interface AccountAnalyticsOptions {
  /**
   * A server client of the OpenPanel project and its write-only secret. The desktop and website
   * client has no secret. Without both, no event is sent.
   */
  clientId: string | undefined;
  clientSecret: string | undefined;
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** Keeps the Worker alive until the send ends (`waitUntil`). */
  schedule: (send: Effect.Effect<void>) => void;
}

class AnalyticsDeliveryError extends Schema.TaggedError<AnalyticsDeliveryError>()("AnalyticsDeliveryError", {}) {}

type OpenPanelBody = {
  type: "track";
  payload: { name: string; profileId?: string; properties: AnalyticsProperties };
};

export function createAccountAnalytics(options: AccountAnalyticsOptions): AccountAnalytics {
  const clientId = options.clientId?.trim();
  const clientSecret = options.clientSecret?.trim();
  if (!clientId || !clientSecret) return NO_ACCOUNT_ANALYTICS;
  const post = Effect.fn("AccountAnalytics.post")(function* (body: OpenPanelBody) {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        options.fetch(`${OPENPANEL_API_URL}/track`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "openpanel-client-id": clientId,
            "openpanel-client-secret": clientSecret,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.any([signal, AbortSignal.timeout(SEND_TIMEOUT_MS)]),
        }),
      catch: () => new AnalyticsDeliveryError({}),
    });
    if (!response.ok) {
      console.warn("Account analytics send failed.", { status: response.status });
    }
  });
  return {
    track(accountId, event) {
      const properties = accountEventProperties(event);
      if (!properties || (accountId !== null && !ACCOUNT_ID_PATTERN.test(accountId))) return;
      const send = post({
        type: "track",
        payload: { name: event.name, ...(accountId === null ? {} : { profileId: accountId }), properties },
      }).pipe(Effect.catch(() => Effect.sync(() => console.warn("Account analytics send failed."))));
      options.schedule(send);
    },
  };
}

/**
 * The properties of one event, checked at runtime against the allowlists. A value that is not on a
 * list is dropped, and an unknown action drops the event.
 */
function accountEventProperties(event: AccountAnalyticsEvent): AnalyticsProperties | null {
  const properties: AnalyticsProperties = {
    surface: "account_api",
    environment: "production",
    event_schema_version: ACCOUNT_ANALYTICS_SCHEMA_VERSION,
  };
  if (event.name === "account_created") {
    if (!isOneOf(ACCOUNT_SURFACES, event.surface)) return null;
    return { ...properties, sign_in_surface: event.surface, ...firstTouchProperties(event.firstTouch) };
  }
  if (event.name === "account_attributed") {
    const touch = firstTouchProperties(event.firstTouch);
    if (!isOneOf(ATTRIBUTION_SOURCES, event.via) || !touch.first_touch_source) return null;
    return { ...properties, recorded_via: event.via, ...touch };
  }
  if (!isOneOf(EMAIL_KINDS, event.kind) || !isOneOf(EMAIL_RESULTS, event.result)) return null;
  return { ...properties, kind: event.kind, result: event.result };
}

const FIRST_TOUCH_CAMPAIGN_PROPERTIES = {
  utmSource: "first_touch_utm_source",
  utmMedium: "first_touch_utm_medium",
  utmCampaign: "first_touch_utm_campaign",
  utmContent: "first_touch_utm_content",
  utmTerm: "first_touch_utm_term",
} as const satisfies Record<(typeof FIRST_TOUCH_CAMPAIGN_FIELDS)[number], string>;

/** The event properties of a first touch, checked again; empty without a valid one. */
function firstTouchProperties(value: FirstTouch | null): Record<string, string> {
  const touch = parseFirstTouch(value);
  if (!touch) return {};
  const properties: Record<string, string> = {
    first_touch_source: touch.acquisitionSource,
    first_touch_platform: touch.sourcePlatform,
    first_touch_landing_page: touch.landingPage,
    first_touch_date: touch.firstVisitOn,
  };
  for (const field of FIRST_TOUCH_CAMPAIGN_FIELDS) {
    const campaign = touch[field];
    if (campaign) properties[FIRST_TOUCH_CAMPAIGN_PROPERTIES[field]] = campaign;
  }
  return properties;
}
