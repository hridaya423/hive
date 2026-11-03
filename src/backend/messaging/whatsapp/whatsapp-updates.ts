import type { InboundFile, InboundMessage } from "../messaging-types";
import { jidUser, type WhatsAppSession } from "./whatsapp-session";
import type { WhatsAppContent, WhatsAppContextInfo, WhatsAppMedia, WhatsAppMessage } from "./whatsapp-socket";

const GROUP_SERVER = "@g.us";
const WHATSAPP_THREAD = "chat";

const MEDIA_KINDS = [
  ["imageMessage", "photo.jpg", "image/jpeg"],
  ["videoMessage", "video.mp4", "video/mp4"],
  ["audioMessage", "audio.ogg", "audio/ogg"],
  ["documentMessage", "document", "application/octet-stream"],
  ["stickerMessage", "sticker.webp", "image/webp"],
] as const;

export function whatsappChatIsGroup(chat: string): boolean {
  return chat.endsWith(GROUP_SERVER);
}

export function whatsappChatOf(message: WhatsAppMessage): string | null {
  const chat = message.key.remoteJid;
  if (!chat || chat === "status@broadcast" || chat.endsWith("@newsletter") || chat.endsWith("@broadcast")) return null;
  return chat;
}

/**
 * One message as an inbound message for OpenBot, or null when it does not address OpenBot.
 *
 * - A direct chat is one conversation, and every message in it addresses OpenBot.
 * - In a group, a message that mentions the linked account, or replies to one of its messages, starts
 *   or continues the conversation. Other group messages count only in a conversation that an agent
 *   already answers (`requiresLink`).
 * - The account's own messages count only in its chat with itself, and not the ones that OpenBot sent.
 */
export function whatsappInbound(
  message: WhatsAppMessage,
  chat: string,
  session: WhatsAppSession,
): InboundMessage | null {
  const id = message.key.id;
  const content = message.message;
  if (!id || !content) return null;
  const fromMe = message.key.fromMe === true;
  if (fromMe && (!session.isOwn(chat) || session.wasSent(id))) return null;
  const isDirect = !whatsappChatIsGroup(chat);
  const own = session.ownIds();
  const authorId = fromMe ? (own[0] ?? jidUser(chat)) : jidUser(message.key.participant ?? chat);
  if (message.pushName && !fromMe) session.rememberName(authorId, message.pushName);

  const info = contextOf(content);
  const mentioned = info?.mentionedJid?.map(jidUser) ?? [];
  const quotedOwn = info?.participant != null && own.includes(jidUser(info.participant));
  const addressed = own.some((user) => mentioned.includes(user)) || quotedOwn;
  const rawText = textOf(content);
  const text = withoutOwnMentions(rawText, own);
  const file = inboundFile(content, id);
  if (!text && !file) return null;

  session.rememberMessage(chat, message, {
    id,
    authorName: session.name(authorId) ?? authorId,
    text: text || (file ? file.name : ""),
    sentAt: sentAt(message.messageTimestamp),
    ...(file ? { files: [file] } : {}),
  });

  const quote = quotedMessage(info, session);
  return {
    dedupKey: `${chat}:${id}`,
    platformChannelId: chat,
    threadKey: WHATSAPP_THREAD,
    target: { platformChannelId: chat, replyThreadId: id },
    platformMessageId: id,
    isDirect,
    requiresLink: !isDirect && !addressed,
    authorId,
    text,
    mentionedUserIds: mentioned.filter((user) => !own.includes(user)),
    files: file ? [file] : [],
    ...(quote ? { replyTo: quote } : {}),
  };
}

function contextOf(content: WhatsAppContent): WhatsAppContextInfo | null {
  if (content.extendedTextMessage?.contextInfo) return content.extendedTextMessage.contextInfo;
  for (const [kind] of MEDIA_KINDS) {
    const info = content[kind]?.contextInfo;
    if (info) return info;
  }
  return null;
}

function textOf(content: WhatsAppContent): string {
  if (content.conversation) return content.conversation;
  if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
  for (const [kind] of MEDIA_KINDS) {
    const caption = content[kind]?.caption;
    if (caption) return caption;
  }
  return "";
}

function withoutOwnMentions(text: string, own: string[]): string {
  let result = text;
  for (const user of own) result = result.replaceAll(`@${user}`, "");
  return result.trim();
}

function inboundFile(content: WhatsAppContent, id: string): InboundFile | null {
  for (const [kind, fallbackName, fallbackType] of MEDIA_KINDS) {
    const media = content[kind];
    if (!media) continue;
    const voice = kind === "audioMessage" && media.ptt === true ? "voice.ogg" : null;
    return {
      id,
      name: media.fileName || voice || fallbackName,
      mimeType: media.mimetype || fallbackType,
      size: fileSize(media),
      url: id,
    };
  }
  return null;
}

function fileSize(media: WhatsAppMedia): number {
  const length = media.fileLength;
  if (typeof length === "number") return length;
  return length ? length.toNumber() : 0;
}

function quotedMessage(info: WhatsAppContextInfo | null, session: WhatsAppSession): InboundMessage["replyTo"] {
  const quoted = info?.quotedMessage;
  if (!info || !quoted || (info.participant != null && session.isOwn(info.participant))) return null;
  const author = info.participant ? jidUser(info.participant) : "";
  return {
    authorName: session.name(author) ?? author,
    text: textOf(quoted),
    mentionedUserIds: [],
    sentAt: new Date().toISOString(),
  };
}

function sentAt(timestamp: WhatsAppMessage["messageTimestamp"]): string {
  const seconds = typeof timestamp === "number" ? timestamp : timestamp ? timestamp.toNumber() : Date.now() / 1_000;
  return new Date(seconds * 1_000).toISOString();
}
