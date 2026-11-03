import type { ContextEntry } from "../messaging-types";
import type { WhatsAppClient, WhatsAppMessage } from "./whatsapp-socket";

const STORED_MESSAGES = 500;
const SENT_IDS = 500;

interface StoredMessage {
  chat: string;
  message: WhatsAppMessage;
  entry: ContextEntry;
}

export const WHATSAPP_WORKSPACE_ID = "whatsapp";

/** The user part of a jid, without the device: `4477:7@s.whatsapp.net` gives `4477`. */
export function jidUser(jid: string): string {
  return jid.split("@")[0]?.split(":")[0] ?? "";
}

/** A jid without its device, or a phone number as a jid. Null for a value that names no chat. */
export function normalizeChat(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes("@")) {
    const [user = "", server = ""] = trimmed.split("@");
    return `${user.split(":")[0]}@${server}`;
  }
  const digits = trimmed.replace(/[\s+()-]/gu, "");
  return /^[0-9]{5,20}$/u.test(digits) ? `${digits}@s.whatsapp.net` : null;
}

/** The distinct chats of a comma or line separated list, as jids. A value that names no chat is left out. */
export function allowedChatList(value: string): string[] {
  const chats = value
    .split(/[,\n]/u)
    .map(normalizeChat)
    .filter((chat): chat is string => chat !== null);
  return [...new Set(chats)];
}

/**
 * What the host knows of the WhatsApp account: the chats that may reach an agent, the live socket,
 * the people it saw, and the recent messages, in memory only. WhatsApp has no history API, so a
 * restart forgets the history that the agent's history tool reads. The adapter and the transport of
 * the connection share it.
 */
export class WhatsAppSession {
  client: WhatsAppClient | null = null;
  dropped = 0;
  readonly #allowed: ReadonlySet<string>;
  readonly #names = new Map<string, string>();
  readonly #titles = new Map<string, string>();
  readonly #messages = new Map<string, StoredMessage>();
  readonly #sent = new Set<string>();

  constructor(allowedChats: string) {
    this.#allowed = new Set(allowedChatList(allowedChats));
  }

  get allowedChats(): readonly string[] {
    return [...this.#allowed];
  }

  allows(...chats: Array<string | null | undefined>): boolean {
    return chats.some((chat) => chat != null && this.#allowed.has(normalizeChat(chat) ?? ""));
  }

  /** The jids of the linked account: the chat with itself is a place that only its owner writes in. */
  ownIds(): string[] {
    const user = this.client?.socket.user;
    return user ? [user.id, user.lid].filter((id): id is string => id !== undefined).map(jidUser) : [];
  }

  isOwn(jid: string | null | undefined): boolean {
    return jid != null && this.ownIds().includes(jidUser(jid));
  }

  name(userId: string): string | null {
    return this.#names.get(userId) ?? null;
  }

  rememberName(userId: string, name: string): void {
    if (name) this.#names.set(userId, name);
  }

  title(chat: string): string | null {
    return this.#titles.get(chat) ?? null;
  }

  rememberTitle(chat: string, title: string): void {
    this.#titles.set(chat, title);
  }

  rememberSent(id: string): void {
    this.#sent.add(id);
    if (this.#sent.size > SENT_IDS) {
      const oldest = this.#sent.values().next().value;
      if (oldest !== undefined) this.#sent.delete(oldest);
    }
  }

  wasSent(id: string): boolean {
    return this.#sent.has(id);
  }

  message(id: string): WhatsAppMessage | null {
    return this.#messages.get(id)?.message ?? null;
  }

  rememberMessage(chat: string, message: WhatsAppMessage, entry: ContextEntry): void {
    this.#messages.delete(entry.id);
    this.#messages.set(entry.id, { chat, message, entry });
    if (this.#messages.size > STORED_MESSAGES) {
      const oldest = this.#messages.keys().next().value;
      if (oldest !== undefined) this.#messages.delete(oldest);
    }
  }

  /** The messages of one chat after `afterId` and before `beforeId`, oldest first. */
  history(chat: string, afterId: string | null, beforeId: string): ContextEntry[] {
    const entries = this.#chatEntries(chat);
    const before = entries.findIndex((entry) => entry.id === beforeId);
    const after = afterId === null ? -1 : entries.findIndex((entry) => entry.id === afterId);
    return entries.slice(after + 1, before === -1 ? undefined : before);
  }

  recent(chat: string, limit: number): ContextEntry[] {
    return this.#chatEntries(chat).slice(-limit);
  }

  #chatEntries(chat: string): ContextEntry[] {
    return [...this.#messages.values()].filter((stored) => stored.chat === chat).map((stored) => stored.entry);
  }
}
