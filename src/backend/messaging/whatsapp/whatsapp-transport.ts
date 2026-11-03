import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import type { Logger } from "@openbot/logging";
import { Effect } from "effect";
import type { MessagingTransport, TransportSink } from "../messaging-types";
import type { WhatsAppSession } from "./whatsapp-session";
import {
  WHATSAPP_CLOSE,
  type WhatsAppClient,
  type WhatsAppConnect,
  type WhatsAppConnectionUpdate,
  type WhatsAppMessage,
} from "./whatsapp-socket";
import { whatsappChatOf, whatsappInbound } from "./whatsapp-updates";

const WHATSAPP_RETRY_CAP_MS = 30_000;
export const WHATSAPP_LOGOUT_TIMEOUT_MS = 10_000;

export function whatsappRetryDelayMs(attempt: number): number {
  return Math.min(WHATSAPP_RETRY_CAP_MS, 1_000 * 2 ** attempt);
}

function closeStatus(error: Error | undefined): number | undefined {
  const output = isDynamicRecord(error) ? error.output : undefined;
  const status = isDynamicRecord(output) ? output.statusCode : undefined;
  return isNumber(status) ? status : undefined;
}

async function endClient(client: WhatsAppClient): Promise<void> {
  client.socket.end(undefined);
  await client.stopCreds();
}

function openedOrGone(socket: WhatsAppClient["socket"]): Promise<"open" | "gone"> {
  return new Promise((resolve, reject) => {
    socket.ev.on("connection.update", (update) => {
      if (update.connection === "open") {
        resolve("open");
      } else if (update.connection === "close") {
        if (closeStatus(update.lastDisconnect?.error) === WHATSAPP_CLOSE.loggedOut) resolve("gone");
        else reject(update.lastDisconnect?.error);
      }
    });
  });
}

export interface WhatsAppUnlinkOptions {
  connect: WhatsAppConnect;
  authDir: string;
  logger: Logger;
  timeoutMs: number;
}

/**
 * Logs the device out of WhatsApp, so the phone drops it, and deletes the login. A connection that
 * is paused or stopped has no socket, so a short-lived one opens from the saved login. When the logout
 * does not finish in time, the login is deleted anyway and the log says that the phone may keep the device.
 */
export async function unlinkWhatsApp(options: WhatsAppUnlinkOptions, live: WhatsAppClient | null): Promise<void> {
  const { connect, authDir, logger, timeoutMs } = options;
  let client = live;
  let expired = false;
  const logout = async (): Promise<boolean> => {
    if (!client) {
      const linked = await access(join(authDir, "creds.json")).then(
        () => true,
        () => false,
      );
      if (!linked) return true;
      const opened = await connect(authDir);
      if (expired) {
        await endClient(opened);
        return false;
      }
      client = opened;
      if ((await openedOrGone(opened.socket)) === "gone") return true;
    }
    await client.socket.logout();
    return true;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const loggedOut = await Promise.race([
    logout().catch(() => false),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  expired = true;
  if (client) await endClient(client);
  await rm(authDir, { recursive: true, force: true });
  if (!loggedOut)
    logger.warn("WhatsApp did not log this device out, so the phone may still list it as a linked device.");
}

/** The pairing QR code that the settings page shows. It is null once the phone has scanned it. */
export class WhatsAppPairing {
  #code: string | null = null;

  qr(code: string | null): void {
    this.#code = code;
  }

  code(): string | null {
    return this.#code;
  }
}

export interface WhatsAppTransportOptions {
  connect: WhatsAppConnect;
  authDir: string;
  session: WhatsAppSession;
  pairing: WhatsAppPairing;
  retryDelayMs: (attempt: number) => number;
  logoutTimeoutMs: number;
  logger: Logger;
}

/**
 * The inbound half of the linked account: the socket to WhatsApp, which this host opens itself. It
 * reconnects with a backoff, shows the pairing QR code while no account is linked, and stops when the
 * phone unlinks the account or WhatsApp restricts the number. A message from a chat outside the allowlist is dropped before anything
 * reads it, and only the number of drops is logged.
 */
export class WhatsAppTransport implements MessagingTransport {
  readonly #options: WhatsAppTransportOptions;
  #sink: TransportSink | null = null;
  #attempt = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #generation = 0;
  #halted = false;

  constructor(options: WhatsAppTransportOptions) {
    this.#options = options;
  }

  start(sink: TransportSink): void {
    this.#sink = sink;
    sink.state("connecting");
    void this.#open();
  }

  reconnect(): void {
    if (!this.#sink || this.#halted || this.#options.session.client) return;
    this.#clearTimer();
    void this.#open();
  }

  readonly stop = Effect.fn("WhatsAppTransport.stop")(() => Effect.sync(() => this.#close()));

  /** Logs the account out of WhatsApp, so the phone drops this device, and deletes the login. */
  readonly unlink = Effect.fn("WhatsAppTransport.unlink")(() =>
    Effect.promise(() => {
      const client = this.#detach();
      this.#options.pairing.qr(null);
      const { connect, authDir, logger, logoutTimeoutMs } = this.#options;
      return unlinkWhatsApp({ connect, authDir, logger, timeoutMs: logoutTimeoutMs }, client);
    }),
  );

  #close(): void {
    this.#options.pairing.qr(null);
    this.#detach()?.socket.end(undefined);
  }

  #detach(): WhatsAppClient | null {
    this.#sink = null;
    this.#generation += 1;
    this.#clearTimer();
    const client = this.#options.session.client;
    this.#options.session.client = null;
    return client;
  }

  #dropClient(): WhatsAppClient | null {
    const client = this.#options.session.client;
    this.#options.session.client = null;
    client?.socket.end(undefined);
    return client;
  }

  #clearTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  async #open(): Promise<void> {
    const generation = ++this.#generation;
    const { session, connect, authDir, logger } = this.#options;
    try {
      const client = await connect(authDir);
      if (generation !== this.#generation) {
        client.socket.end(undefined);
        return;
      }
      session.client = client;
      client.socket.ev.on("connection.update", (update) => {
        if (generation === this.#generation) this.#connectionUpdate(update);
      });
      client.socket.ev.on("messages.upsert", ({ messages, type }) => {
        if (generation === this.#generation && type === "notify")
          for (const message of messages) this.#message(message);
      });
    } catch (error) {
      if (generation !== this.#generation) return;
      logger.warn("WhatsApp could not open its connection.", {
        error: error instanceof Error ? error.message : "unknown",
      });
      this.#retry();
    }
  }

  #connectionUpdate(update: WhatsAppConnectionUpdate): void {
    const sink = this.#sink;
    if (!sink) return;
    if (update.qr) {
      this.#options.pairing.qr(update.qr);
      sink.state("connecting");
    }
    if (update.connection === "open") {
      this.#attempt = 0;
      this.#options.pairing.qr(null);
      sink.state("connected");
    }
    if (update.connection !== "close") return;
    const status = closeStatus(update.lastDisconnect?.error);
    const dropped = this.#dropClient();
    if (status === WHATSAPP_CLOSE.loggedOut) {
      this.#halted = true;
      this.#generation += 1;
      this.#options.pairing.qr(null);
      void (async () => {
        await dropped?.stopCreds();
        await rm(this.#options.authDir, { recursive: true, force: true });
      })().finally(() => sink.state("invalid_token"));
    } else if (status === WHATSAPP_CLOSE.replaced || status === WHATSAPP_CLOSE.forbidden) {
      this.#halted = true;
      this.#generation += 1;
      if (status === WHATSAPP_CLOSE.forbidden)
        this.#options.logger.warn("WhatsApp restricted or banned this number, so Hive stopped trying to connect.");
      sink.state("error");
    } else if (status === WHATSAPP_CLOSE.restartRequired) {
      void this.#open();
    } else {
      this.#retry();
    }
  }

  #retry(): void {
    const sink = this.#sink;
    if (!sink) return;
    sink.state("reconnecting");
    const delay = this.#options.retryDelayMs(this.#attempt);
    this.#attempt += 1;
    this.#clearTimer();
    this.#timer = setTimeout(() => void this.#open(), delay);
    this.#timer.unref?.();
  }

  #message(message: WhatsAppMessage): void {
    const sink = this.#sink;
    const { session, logger } = this.#options;
    const named = whatsappChatOf(message);
    if (!sink || !named) return;
    const chat = session.allowedChat(named, message.key.remoteJidAlt);
    if (!chat) {
      session.dropped += 1;
      logger.warn("WhatsApp dropped a message from a chat that is not allowed.", { count: session.dropped });
      return;
    }
    const inbound = whatsappInbound(message, chat, session);
    if (inbound) sink.message(inbound);
  }
}
