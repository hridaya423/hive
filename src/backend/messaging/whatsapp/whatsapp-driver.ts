import { readFile, stat, writeFile } from "node:fs/promises";
import { createOpenBotLogger, type Logger } from "@openbot/logging";
import { Effect, Result } from "effect";
import type { MessagingAnswerFile } from "../messaging-threads";
import {
  type ConnectionIdentity,
  type ContextEntry,
  type InboundFile,
  type MessageBody,
  type MessageTarget,
  type MessagingAdapter,
  MessagingAdapterError,
  type MessagingDriver,
  type MessagingPlace,
  type StatusReaction,
} from "../messaging-types";
import { whatsappChunks, whatsappText } from "./whatsapp-render";
import { jidUser, WhatsAppSession } from "./whatsapp-session";
import type { WhatsAppConnect, WhatsAppMessage, WhatsAppOutbound } from "./whatsapp-socket";
import { type WhatsAppPairing, WhatsAppTransport, whatsappRetryDelayMs } from "./whatsapp-transport";
import { whatsappChatIsGroup } from "./whatsapp-updates";

export const WHATSAPP_WORKSPACE_ID = "whatsapp";
const WHATSAPP_FILE_BYTES_LIMIT = 64 * 1024 * 1024;

const REACTIONS: Record<StatusReaction, string> = {
  received: "👀",
  done: "👌",
  failed: "💔",
  stopped: "🫡",
};

const fail = (reason: string) => new MessagingAdapterError({ cause: new Error(reason) });

class WhatsAppAdapter implements MessagingAdapter {
  readonly platform = "whatsapp" as const;
  readonly #session: WhatsAppSession;

  constructor(session: WhatsAppSession) {
    this.#session = session;
  }

  identify(): Effect.Effect<ConnectionIdentity, MessagingAdapterError> {
    return Effect.sync(() => ({
      workspaceId: WHATSAPP_WORKSPACE_ID,
      workspaceName: "WhatsApp",
      botUserId: this.#session.ownIds()[0] ?? "",
      appId: "whatsapp",
      missingScopes: [],
    }));
  }

  post(target: MessageTarget, body: MessageBody): Effect.Effect<string, MessagingAdapterError> {
    return this.#send(target.platformChannelId, { text: whatsappText(body.text) }, target.replyThreadId);
  }

  readonly edit = Effect.fnUntraced(function* (
    this: WhatsAppAdapter,
    target: MessageTarget,
    messageId: string,
    body: MessageBody,
  ) {
    const key = this.#session.message(messageId)?.key;
    if (!key) return yield* fail("unknown_message");
    yield* this.#send(target.platformChannelId, { text: whatsappText(body.text), edit: key }, null);
  });

  /** WhatsApp has no private reply in a group, so the text goes to the chat, as in Telegram. */
  postPrivate(target: MessageTarget, _userId: string, text: string): Effect.Effect<void, MessagingAdapterError> {
    return this.post(target, { text }).pipe(Effect.asVoid);
  }

  readonly react = Effect.fnUntraced(function* (
    this: WhatsAppAdapter,
    target: MessageTarget,
    messageId: string,
    reaction: StatusReaction,
    on: boolean,
  ) {
    const key = this.#session.message(messageId)?.key;
    if (!key) return yield* fail("unknown_message");
    yield* this.#send(target.platformChannelId, { react: { text: on ? REACTIONS[reaction] : "", key } }, null);
  });

  readonly postAnswer = Effect.fnUntraced(function* (
    this: WhatsAppAdapter,
    target: MessageTarget,
    markdown: string,
    replaceMessageId: string | null,
  ) {
    const [first = "", ...rest] = whatsappChunks(markdown);
    let firstId: string | null = null;
    if (replaceMessageId) {
      const edited = yield* Effect.result(this.edit(target, replaceMessageId, { text: first }));
      if (Result.isSuccess(edited)) firstId = replaceMessageId;
    }
    firstId ??= yield* this.post(target, { text: first });
    for (const chunk of rest) yield* this.post({ ...target, replyThreadId: null }, { text: chunk });
    return firstId;
  });

  readonly upload = Effect.fnUntraced(function* (
    this: WhatsAppAdapter,
    target: MessageTarget,
    files: MessagingAnswerFile[],
  ) {
    const skipped: string[] = [];
    for (const file of files) {
      const sent = yield* Effect.result(
        Effect.gen({ self: this }, function* () {
          const size = yield* Effect.tryPromise({
            try: () => stat(file.path).then((info) => info.size),
            catch: (cause) => new MessagingAdapterError({ cause }),
          });
          if (size === 0 || size > WHATSAPP_FILE_BYTES_LIMIT) return false;
          const bytes = yield* Effect.tryPromise({
            try: () => readFile(file.path),
            catch: (cause) => new MessagingAdapterError({ cause }),
          });
          const content: WhatsAppOutbound = file.mimeType.startsWith("image/")
            ? { image: bytes, mimetype: file.mimeType, caption: file.name }
            : { document: bytes, mimetype: file.mimeType || "application/octet-stream", fileName: file.name };
          yield* this.#send(target.platformChannelId, content, null);
          return true;
        }),
      );
      if (Result.isFailure(sent) || !sent.success) skipped.push(file.name);
    }
    return skipped;
  });

  history(
    platformChannelId: string,
    _threadKey: string,
    afterId: string | null,
    beforeId: string,
  ): Effect.Effect<ContextEntry[], MessagingAdapterError> {
    return Effect.sync(() => this.#session.history(platformChannelId, afterId, beforeId));
  }

  /** WhatsApp has no history API: this is what the host saw of the chat since it started. */
  recent(
    platformChannelId: string,
    _threadKey: string | null,
    limit: number,
  ): Effect.Effect<ContextEntry[], MessagingAdapterError> {
    return Effect.sync(() => this.#session.recent(platformChannelId, limit));
  }

  readonly download = Effect.fnUntraced(function* (
    this: WhatsAppAdapter,
    file: InboundFile,
    destination: string,
    maxBytes: number,
  ) {
    const message = this.#session.message(file.url);
    const client = this.#session.client;
    if (!message || !client) return yield* fail("unknown_message");
    if (file.size > maxBytes) return yield* fail("file_too_large");
    const bytes = yield* Effect.tryPromise({
      try: () => client.downloadMedia(message),
      catch: (cause) => new MessagingAdapterError({ cause }),
    });
    if (bytes.byteLength > maxBytes) return yield* fail("file_too_large");
    yield* Effect.tryPromise({
      try: () => writeFile(destination, bytes),
      catch: (cause) => new MessagingAdapterError({ cause }),
    });
  });

  authorName(userId: string): Effect.Effect<string, MessagingAdapterError> {
    return Effect.sync(() => this.#session.name(userId) ?? userId);
  }

  readonly placeName = Effect.fnUntraced(function* (this: WhatsAppAdapter, platformChannelId: string) {
    const known = this.#session.title(platformChannelId);
    if (known) return known;
    const client = this.#session.client;
    if (!whatsappChatIsGroup(platformChannelId) || !client) return jidUser(platformChannelId);
    const metadata = yield* Effect.result(
      Effect.tryPromise({
        try: () => client.socket.groupMetadata(platformChannelId),
        catch: (cause) => new MessagingAdapterError({ cause }),
      }),
    );
    if (Result.isFailure(metadata)) return jidUser(platformChannelId);
    this.#session.rememberTitle(platformChannelId, metadata.success.subject);
    return metadata.success.subject;
  });

  /** Only the chats of the allowlist are places: an agent cannot write to any other chat. */
  places(): Effect.Effect<MessagingPlace[], MessagingAdapterError> {
    return Effect.sync(() =>
      this.#session.allowedChats.map((chat) => ({
        id: chat,
        name: this.#session.title(chat) ?? jidUser(chat),
        kind: "chat" as const,
      })),
    );
  }

  mention(userId: string): string {
    return `@${userId}`;
  }

  #send(chat: string, content: WhatsAppOutbound, quoteId: string | null): Effect.Effect<string, MessagingAdapterError> {
    const session = this.#session;
    const client = session.client;
    if (!session.allows(chat)) return Effect.fail(fail("chat_not_allowed"));
    if (!client) return Effect.fail(fail("not_connected"));
    const quoted: WhatsAppMessage | undefined = quoteId ? (session.message(quoteId) ?? undefined) : undefined;
    return Effect.tryPromise({
      try: () => client.socket.sendMessage(chat, content, quoted ? { quoted } : undefined),
      catch: (cause) => new MessagingAdapterError({ cause }),
    }).pipe(
      Effect.flatMap((sent) => {
        const id = sent?.key.id;
        if (!sent || !id) return Effect.fail(fail("no_message_id"));
        session.rememberSent(id);
        session.rememberMessage(chat, sent, { id, authorName: "OpenBot", text: "", sentAt: new Date().toISOString() });
        return Effect.succeed(id);
      }),
    );
  }
}

export interface WhatsAppDriverOptions {
  connect: WhatsAppConnect;
  /** The folder of Baileys' multi-file login, in Hive's data folder and never in git. */
  authDir: string;
  pairing?: WhatsAppPairing;
  retryDelayMs?: (attempt: number) => number;
  logger?: Logger;
}

/**
 * The linked WhatsApp account, which this host talks to directly: no relay and no bot registration.
 * `credentials.allowedChats` lists the chats that can reach an agent, as phone numbers or jids,
 * separated by commas. Empty by default, so nothing reaches an agent until the user names a chat.
 */
export function whatsappDriver(options: WhatsAppDriverOptions): MessagingDriver {
  const logger = options.logger ?? createOpenBotLogger("whatsapp");
  let current: { allowed: string; session: WhatsAppSession } | null = null;
  const session = (credentials: Record<string, string>): WhatsAppSession => {
    const allowed = credentials.allowedChats ?? "";
    if (current?.allowed !== allowed) current = { allowed, session: new WhatsAppSession(allowed) };
    return current.session;
  };
  return {
    platform: "whatsapp",
    requiredCredential: "account",
    createAdapter: (credentials) => new WhatsAppAdapter(session(credentials)),
    createTransport: (credentials) =>
      new WhatsAppTransport({
        connect: options.connect,
        authDir: options.authDir,
        session: session(credentials),
        pairing: options.pairing ?? { qr: () => {} },
        retryDelayMs: options.retryDelayMs ?? whatsappRetryDelayMs,
        logger,
      }),
  };
}
