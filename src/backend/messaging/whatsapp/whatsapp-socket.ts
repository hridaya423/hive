import type { WAMessage, WAMessageKey } from "baileys";

/** The part of a Baileys socket that Hive uses, so the e2e test can stand in a fake socket. */

export interface WhatsAppContextInfo {
  stanzaId?: string | null;
  participant?: string | null;
  quotedMessage?: WhatsAppContent | null;
  mentionedJid?: string[] | null;
}

export interface WhatsAppMedia {
  caption?: string | null;
  mimetype?: string | null;
  fileLength?: number | { toNumber(): number } | null;
  fileName?: string | null;
  ptt?: boolean | null;
  contextInfo?: WhatsAppContextInfo | null;
}

export interface WhatsAppContent {
  conversation?: string | null;
  extendedTextMessage?: { text?: string | null; contextInfo?: WhatsAppContextInfo | null } | null;
  imageMessage?: WhatsAppMedia | null;
  videoMessage?: WhatsAppMedia | null;
  audioMessage?: WhatsAppMedia | null;
  documentMessage?: WhatsAppMedia | null;
  stickerMessage?: WhatsAppMedia | null;
}

export type WhatsAppMessage = WAMessage;

export type WhatsAppOutbound =
  | { text: string; edit?: WAMessageKey }
  | { react: { text: string; key: WAMessageKey } }
  | { image: Buffer; caption?: string; mimetype?: string }
  | { document: Buffer; mimetype: string; fileName: string };

export interface WhatsAppConnectionUpdate {
  connection?: "connecting" | "open" | "close";
  qr?: string;
  lastDisconnect?: { error?: Error };
}

export interface WhatsAppEvents {
  "connection.update": WhatsAppConnectionUpdate;
  "creds.update": { me?: { id: string } };
  "messages.upsert": { messages: WhatsAppMessage[]; type: string };
}

export interface WhatsAppSocket {
  readonly user?: { id: string; lid?: string; name?: string };
  readonly ev: {
    on<E extends keyof WhatsAppEvents>(event: E, handler: (payload: WhatsAppEvents[E]) => void): void;
  };
  sendMessage(
    jid: string,
    content: WhatsAppOutbound,
    options?: { quoted?: WhatsAppMessage },
  ): Promise<WhatsAppMessage | undefined>;
  groupMetadata(jid: string): Promise<{ subject: string }>;
  logout(message?: string): Promise<void>;
  end(error: Error | undefined): void;
}

export interface WhatsAppClient {
  socket: WhatsAppSocket;
  downloadMedia(message: WhatsAppMessage): Promise<Uint8Array>;
}

/** Opens a socket whose login is kept in `authDir`. The caller listens to it and ends it. */
export type WhatsAppConnect = (authDir: string) => Promise<WhatsAppClient>;

export const WHATSAPP_CLOSE = { loggedOut: 401, forbidden: 403, replaced: 440, restartRequired: 515 } as const;
