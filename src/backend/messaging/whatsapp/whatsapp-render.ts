import { slackChunks } from "../slack/slack-render";

const WHATSAPP_CHUNK_CHARACTERS = 4_000;
const FENCE = "```";
const BOLD_MARK = "";

/** Markdown as WhatsApp text: `*bold*`, `_italic_`, `~strike~` and the code marks that WhatsApp reads. */
export function whatsappText(markdown: string): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (line.trimStart().startsWith(FENCE)) {
        inFence = !inFence;
        return FENCE;
      }
      if (inFence) return line;
      const heading = /^#{1,6}\s+(.*)$/u.exec(line);
      if (heading) return `*${inline(heading[1] ?? "")}*`;
      const bullet = /^(\s*)[-*+]\s+(.*)$/u.exec(line);
      if (bullet) return `${bullet[1]}• ${inline(bullet[2] ?? "")}`;
      return inline(line);
    })
    .join("\n");
}

export function whatsappChunks(markdown: string): string[] {
  return slackChunks(markdown, WHATSAPP_CHUNK_CHARACTERS);
}

function inline(line: string): string {
  return line
    .split(/(`[^`]+`)/u)
    .map((part) => (part.length > 2 && part.startsWith("`") && part.endsWith("`") ? part : marks(part)))
    .join("");
}

function marks(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gu, "$1 ($2)")
    .replace(
      /\*\*(.+?)\*\*|__(.+?)__/gu,
      (_match, a: string | undefined, b: string | undefined) => `${BOLD_MARK}${a ?? b}${BOLD_MARK}`,
    )
    .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/gu, "_$1_")
    .replace(/~~(.+?)~~/gu, "~$1~")
    .replaceAll(BOLD_MARK, "*");
}
