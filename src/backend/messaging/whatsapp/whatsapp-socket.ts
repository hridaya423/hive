/**
 * The part of a Baileys socket that Hive uses, written as plain types. Baileys depends on a GPL-3.0
 * library, so it is never a dependency of this repository: `whatsapp-baileys.ts` loads it at run time
 * from a separate install, and a fake that has these types stands in for it in tests.
 */

export interface WhatsAppMessageKey {
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  fromMe?: boolean | null;
  id?: string | null;
  participant?: string | null;
}

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

export interface WhatsAppMessage {
  key: WhatsAppMessageKey;
  message?: WhatsAppContent | null;
  messageTimestamp?: number | { toNumber(): number } | null;
  pushName?: string | null;
}

export type WhatsAppOutbound =
  | { text: string; edit?: WhatsAppMessageKey }
  | { react: { text: string; key: WhatsAppMessageKey } }
  | { image: Uint8Array; caption?: string; mimetype?: string }
  | { document: Uint8Array; mimetype: string; fileName: string };

export interface WhatsAppConnectionUpdate {
  connection?: "connecting" | "open" | "close";
  qr?: string;
  lastDisconnect?: { error?: { output?: { statusCode?: number } } };
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
  end(error: Error | undefined): void;
}

export interface WhatsAppClient {
  socket: WhatsAppSocket;
  downloadMedia(message: WhatsAppMessage): Promise<Uint8Array>;
}

/** Opens a socket whose login is kept in `authDir`. The caller listens to it and ends it. */
export type WhatsAppConnect = (authDir: string) => Promise<WhatsAppClient>;

export const WHATSAPP_CLOSE = { loggedOut: 401, replaced: 440, restartRequired: 515 } as const;
