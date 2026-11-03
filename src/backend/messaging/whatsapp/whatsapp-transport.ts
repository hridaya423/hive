import { rm } from "node:fs/promises";
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

export function whatsappRetryDelayMs(attempt: number): number {
  return Math.min(WHATSAPP_RETRY_CAP_MS, 1_000 * 2 ** attempt);
}

function closeStatus(error: Error | undefined): number | undefined {
  const output = isDynamicRecord(error) ? error.output : undefined;
  const status = isDynamicRecord(output) ? output.statusCode : undefined;
  return isNumber(status) ? status : undefined;
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
    Effect.promise(async () => {
      const client = this.#detach();
      this.#options.pairing.qr(null);
      await client?.socket.logout().catch(() => undefined);
      client?.socket.end(undefined);
      await rm(this.#options.authDir, { recursive: true, force: true });
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

  #dropClient(): void {
    const client = this.#options.session.client;
    this.#options.session.client = null;
    client?.socket.end(undefined);
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
    this.#dropClient();
    if (status === WHATSAPP_CLOSE.loggedOut) {
      this.#halted = true;
      this.#generation += 1;
      this.#options.pairing.qr(null);
      void rm(this.#options.authDir, { recursive: true, force: true }).finally(() => sink.state("invalid_token"));
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
