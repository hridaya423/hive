import makeWASocket, { downloadMediaMessage, fetchLatestBaileysVersion, useMultiFileAuthState } from "baileys";
import type { WhatsAppConnect } from "./whatsapp-socket";

const silentLogger = {
  level: "silent",
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export const baileysConnect: WhatsAppConnect = async (authDir) => {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({
    auth: state,
    version,
    logger: silentLogger,
    browser: ["Hive", "Desktop", "1.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  let writing: Promise<void> = Promise.resolve();
  let stopped = false;
  socket.ev.on("creds.update", () => {
    if (!stopped) writing = writing.then(() => saveCreds()).catch(() => undefined);
  });
  return {
    socket,
    downloadMedia: (message) => downloadMediaMessage(message, "buffer", {}),
    stopCreds: async () => {
      stopped = true;
      await writing;
    },
  };
};
