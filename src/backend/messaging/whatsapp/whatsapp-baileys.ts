import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import type { WhatsAppConnect, WhatsAppMessage, WhatsAppSocket } from "./whatsapp-socket";

export const BAILEYS_VERSION = "7.0.0-rc14";

interface BaileysConfig {
  auth: unknown;
  version: number[];
  logger: SilentLogger;
  browser: string[];
  syncFullHistory: boolean;
  markOnlineOnConnect: boolean;
}

interface BaileysModule {
  default: (config: BaileysConfig) => WhatsAppSocket;
  useMultiFileAuthState: (folder: string) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;
  fetchLatestBaileysVersion: () => Promise<{ version: number[] }>;
  downloadMediaMessage: (
    message: WhatsAppMessage,
    type: "buffer",
    options: { reuploadRequest?: never },
  ) => Promise<Uint8Array>;
}

function isBaileysModule(value: unknown): value is BaileysModule {
  return (
    isDynamicRecord(value) &&
    typeof value.default === "function" &&
    typeof value.useMultiFileAuthState === "function" &&
    typeof value.fetchLatestBaileysVersion === "function" &&
    typeof value.downloadMediaMessage === "function"
  );
}

interface SilentLogger {
  level: string;
  child: () => SilentLogger;
  trace: () => void;
  debug: () => void;
  info: () => void;
  warn: () => void;
  error: () => void;
}

const silentLogger: SilentLogger = {
  level: "silent",
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Baileys, loaded from `<runtimeDir>/node_modules/baileys`, a separate install that
 * `scripts/install-whatsapp-runtime.ts` makes. Baileys requires `libsignal`, which is GPL-3.0, so this
 * repository does not depend on it. It works under Node 20 and later and under Bun. Its login lives
 * in `authDir`, as one JSON file per key.
 */
export function baileysConnect(runtimeDir: string): WhatsAppConnect {
  return async (authDir) => {
    const loaded = await import(pathToFileURL(join(runtimeDir, "node_modules/baileys/lib/index.js")).href);
    if (!isBaileysModule(loaded)) throw new Error("The WhatsApp runtime is missing or has an unknown version.");
    const { state, saveCreds } = await loaded.useMultiFileAuthState(authDir);
    const { version } = await loaded.fetchLatestBaileysVersion();
    const socket = loaded.default({
      auth: state,
      version,
      logger: silentLogger,
      browser: ["Hive", "Desktop", "1.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    socket.ev.on("creds.update", saveCreds);
    return { socket, downloadMedia: (message) => loaded.downloadMediaMessage(message, "buffer", {}) };
  };
}
