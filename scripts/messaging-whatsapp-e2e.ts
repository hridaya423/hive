// Checks the WhatsApp channel against a fake Baileys socket: the real driver, adapter and transport run
// inside the real messaging service on a temporary profile. A message from an allowed chat reaches the
// bound agent and the answer goes back to the same chat; a message from any other chat is dropped and
// logged as a count only; the connection reconnects with a backoff, shows its QR code, and stops
// after the phone unlinks it. `bun scripts/messaging-whatsapp-e2e.ts`.
// Writes .openbot-build/messaging-whatsapp-e2e/report.json.
// Not checked here: the real Baileys library, the WhatsApp servers and a linked account.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createOpenBotLogger } from "@openbot/logging";
import { Effect } from "effect";
import { AgentService } from "../src/backend/agent-service";
import { AgentStore } from "../src/backend/agent-store";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { MailboxStore } from "../src/backend/mailbox-store";
import { MessagingService } from "../src/backend/messaging/messaging-service";
import { MessagingThreads } from "../src/backend/messaging/messaging-threads";
import { whatsappDriver } from "../src/backend/messaging/whatsapp/whatsapp-driver";
import type {
  WhatsAppClient,
  WhatsAppConnectionUpdate,
  WhatsAppEvents,
  WhatsAppMessage,
  WhatsAppOutbound,
  WhatsAppSocket,
} from "../src/backend/messaging/whatsapp/whatsapp-socket";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { SidebarLayoutStore } from "../src/backend/sidebar-layout-store";
import { inertBrowserHost, memoryCredentials, unused, waitFor } from "./agent-service-support";

const OUT = resolve(import.meta.dirname, "../.openbot-build/messaging-whatsapp-e2e");
const REPORT = join(OUT, "report.json");
const root = await mkdtemp(join(tmpdir(), "openbot-messaging-whatsapp-"));
const userData = join(root, "user-data");
const home = join(root, "home");
const authDir = join(root, "whatsapp-auth");

const ME = "447700900001@s.whatsapp.net";
const ME_LID = "100200300400@lid";
const ALLOWED = "447700900002@s.whatsapp.net";
const ALLOWED_GROUP = "120363000000000001@g.us";
const STRANGER = "447700900099@s.whatsapp.net";
const STRANGER_TEXT = "secret stranger text 7731";

interface Step {
  name: string;
  passed: boolean;
  detail?: unknown;
  error?: string;
}

const report: { steps: Step[]; passed: boolean; unverified: string[] } = {
  steps: [],
  passed: false,
  unverified: [
    "The real Baileys library, the WhatsApp servers and a linked account: a fake socket stands in for them.",
    "Reconnect after a mini restart, images, voice notes, reactions and group messages from real WhatsApp.",
  ],
};

async function step(name: string, run: () => Promise<unknown>): Promise<void> {
  const entry: Step = { name, passed: false };
  report.steps.push(entry);
  try {
    entry.detail = await run();
    entry.passed = true;
  } catch (error) {
    entry.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

interface Sent {
  jid: string;
  content: WhatsAppOutbound;
  quoted?: WhatsAppMessage | undefined;
}

class FakeSocket implements WhatsAppSocket {
  readonly user = { id: `${ME.split("@")[0]}:7@s.whatsapp.net`, lid: `${ME_LID.split("@")[0]}:7@lid` };
  readonly sent: Sent[] = [];
  ended = false;
  readonly #handlers: { [E in keyof WhatsAppEvents]: Array<(payload: WhatsAppEvents[E]) => void> } = {
    "connection.update": [],
    "creds.update": [],
    "messages.upsert": [],
  };
  #counter = 0;

  readonly ev: WhatsAppSocket["ev"] = {
    on: (event, handler) => {
      this.#handlers[event].push(handler);
    },
  };

  sendMessage = async (jid: string, content: WhatsAppOutbound, options?: { quoted?: WhatsAppMessage }) => {
    this.sent.push({ jid, content, quoted: options?.quoted });
    this.#counter += 1;
    return { key: { remoteJid: jid, id: `OUT${this.#counter}`, fromMe: true } };
  };

  groupMetadata = async (jid: string) => ({ subject: jid === ALLOWED_GROUP ? "Launch crew" : "Other" });

  end = () => {
    this.ended = true;
  };

  update(update: WhatsAppConnectionUpdate): void {
    for (const handler of this.#handlers["connection.update"]) handler(update);
  }

  receive(...messages: WhatsAppMessage[]): void {
    for (const handler of this.#handlers["messages.upsert"]) handler({ messages, type: "notify" });
  }
}

const sockets: FakeSocket[] = [];
const connectCalls: string[] = [];
let connectFailures = 0;
const qrCodes: Array<string | null> = [];
const logLines: string[] = [];
const MEDIA = new Uint8Array([1, 2, 3, 4]);

const connect = async (dir: string): Promise<WhatsAppClient> => {
  connectCalls.push(dir);
  if (connectFailures > 0) {
    connectFailures -= 1;
    throw new Error("network down");
  }
  const socket = new FakeSocket();
  sockets.push(socket);
  return { socket, downloadMedia: async () => MEDIA };
};
const liveSocket = (): FakeSocket => {
  const socket = sockets.at(-1);
  assert.ok(socket, "No socket was opened.");
  return socket;
};

let counter = 0;
const nextId = () => {
  counter += 1;
  return `WAMSG${counter}`;
};

function text(chat: string, body: string, options: { id?: string; from?: string; mention?: boolean } = {}) {
  const id = options.id ?? nextId();
  const message: WhatsAppMessage = {
    key: { remoteJid: chat, id, fromMe: false, ...(options.from ? { participant: options.from } : {}) },
    message: options.mention
      ? {
          extendedTextMessage: {
            text: `@${ME.split("@")[0]} ${body}`,
            contextInfo: { mentionedJid: [ME] },
          },
        }
      : { conversation: body },
    messageTimestamp: 1_793_000_000,
    pushName: "Hridya",
  };
  return { id, message };
}

const credentials = memoryCredentials();

interface Booted {
  messaging: MessagingService;
  threads: MessagingThreads;
  connectionId: string;
  agentId: string;
}

async function boot<T>(use: (services: Booted) => Promise<T>): Promise<T> {
  const database = new OpenBotDatabase(userData);
  const store = new AgentStore(userData, home, database);
  const mailbox = new MailboxStore(userData, store.sharedRoot, store.database);
  const sidebar = new SidebarLayoutStore(join(userData, "sidebar-layout.json"));
  await runCauseEffect(sidebar.initialize());
  await runCauseEffect(store.initialize());
  await runCauseEffect(mailbox.initialize());
  const agents = new AgentService({ store, mailbox, browser: inertBrowserHost, sidebarLayout: sidebar });
  const threads = new MessagingThreads(store.database, mailbox, {
    schedule: () => {},
    queueChanged: () => {},
    busy: () => false,
    interrupt: unused,
    forgetThread: () => Effect.void,
    ownChat: () => false,
    contextSession: () => null,
  });
  const messaging = new MessagingService({
    threads,
    agents: {
      listAgents: () => agents.listAgents(),
      respondToApproval: (input) => agents.respondToApproval(input),
      onEvent: () => () => {},
      createAgentProfile: (input) => agents.createAgentProfile(input),
      createMemory: (input) => agents.createMemory(input),
      ensureDeletable: (agentId) => agents.ensureAgentDeletable(agentId),
      deleteAgent: (agentId) => agents.deleteAgent(agentId),
      sidebarChatIds: () => agents.sidebarChatIds(),
    },
    credentials,
    drivers: [
      whatsappDriver({
        connect,
        authDir,
        pairing: { qr: (code) => qrCodes.push(code) },
        retryDelayMs: () => 0,
        logger: createOpenBotLogger("whatsapp-e2e", (line) => logLines.push(line)),
      }),
    ],
    downloadsRoot: join(userData, "messaging-downloads"),
    sidebar,
  });
  const agent = await runCauseEffect(
    agents.createAgentProfile({
      name: "Chief of Staff",
      title: "Runs the crew",
      description: "Answers WhatsApp.",
      avatarSeed: "chief",
      avatarHue: 280,
    }),
  );
  const record = threads.store.ensureConnection("whatsapp", "whatsapp", "WhatsApp");
  await runCauseEffect(
    credentials.set(record.connectionId, {
      account: "whatsapp",
      allowedChats: `447700900002,${ALLOWED_GROUP}`,
    }),
  );
  threads.store.updateConnection(record.connectionId, { enabled: true, orchestratorAgentId: agent.id });
  await runCauseEffect(messaging.start());
  try {
    return await use({ messaging, threads, connectionId: record.connectionId, agentId: agent.id });
  } finally {
    await runCauseEffect(messaging.stop());
    await runCauseEffect(agents.stop());
    database.close();
  }
}

const key = (connectionId: string, chat: string, id: string) => `messaging:${connectionId}:${chat}:${id}`;

try {
  mkdirSync(OUT, { recursive: true });
  await boot(async ({ messaging, threads, connectionId }) => {
    await step("the connection shows a QR code while no account is linked, then connects", async () => {
      await waitFor("the first socket", () => sockets.length > 0);
      liveSocket().update({ connection: "connecting" });
      liveSocket().update({ qr: "2@pairing-code" });
      assert.deepEqual(qrCodes, ["2@pairing-code"]);
      assert.notEqual(messaging.whatsappOverview().connections[0]?.state, "connected");
      liveSocket().update({ connection: "open" });
      await waitFor("the connected state", () => messaging.whatsappOverview().connections[0]?.state === "connected");
      assert.equal(qrCodes.at(-1), null, "The QR code stayed after the link.");
      assert.deepEqual(connectCalls, [authDir]);
      return { qrCodes, authDir: "whatsapp-auth" };
    });

    await step("a text from an allowed chat reaches the bound agent, and the reply goes to the same chat", async () => {
      const { id, message } = text(ALLOWED, "what is on today?");
      liveSocket().receive(message);
      await waitFor("the message in the mailbox", () => threads.received(key(connectionId, ALLOWED, id)));
      await waitFor("the received reaction", () =>
        liveSocket().sent.some(
          (sent) => sent.jid === ALLOWED && "react" in sent.content && sent.content.react.text === "👀",
        ),
      );
      const place = threads.store.links(threads.store.connection(connectionId)?.orchestratorAgentId ?? "")[0];
      assert.equal(place?.platformChannelId, ALLOWED);
      const answer = await runCauseEffect(
        threads.outboundTool("messaging_post", {
          connection: connectionId,
          place: ALLOWED,
          text: "Two meetings: **stand-up** at 9 and the review at 14.",
        }),
      );
      assert.equal(answer.success, true, "The post failed.");
      const reply = liveSocket().sent.find((sent) => sent.jid === ALLOWED && "text" in sent.content);
      assert.ok(reply && "text" in reply.content);
      assert.equal(reply.content.text, "Two meetings: *stand-up* at 9 and the review at 14.");
      return { reply: reply.content.text };
    });

    await step("a message from a chat that is not allowed is dropped and logged as a count only", async () => {
      const { id, message } = text(STRANGER, STRANGER_TEXT);
      const before = liveSocket().sent.length;
      liveSocket().receive(message);
      await new Promise((done) => setTimeout(done, 100));
      assert.equal(threads.received(key(connectionId, STRANGER, id)), false);
      assert.equal(liveSocket().sent.length, before, "The stranger got a reaction or an answer.");
      const dropLines = logLines.filter((line) => line.includes("dropped"));
      assert.ok(dropLines.length >= 1, "The drop was not logged.");
      for (const line of logLines) {
        assert.ok(!line.includes(STRANGER_TEXT), "The log holds message text.");
        assert.ok(!line.includes("447700900099"), "The log holds a chat id.");
      }
      assert.match(dropLines[0] ?? "", /"count":1/u);
      return { dropped: dropLines.length };
    });

    await step("the agent cannot post to a chat that is not allowed", async () => {
      const before = liveSocket().sent.length;
      const answer = await runCauseEffect(
        threads.outboundTool("messaging_post", { connection: connectionId, place: STRANGER, text: "hello" }),
      );
      assert.equal(answer.success, false, "A post to a stranger went out.");
      assert.equal(liveSocket().sent.length, before);
      return { refused: true };
    });

    await step("a group message needs a mention, and it removes the mention from the text", async () => {
      const plain = text(ALLOWED_GROUP, "chatter between people", { from: "447700900003@s.whatsapp.net" });
      liveSocket().receive(plain.message);
      const mention = text(ALLOWED_GROUP, "summarise the launch", {
        from: "447700900003@s.whatsapp.net",
        mention: true,
      });
      liveSocket().receive(mention.message);
      await waitFor("the group mention", () => threads.received(key(connectionId, ALLOWED_GROUP, mention.id)));
      assert.equal(threads.received(key(connectionId, ALLOWED_GROUP, plain.id)), false);
      return { received: true };
    });

    await step("our own sent messages in the self chat do not loop back", async () => {
      const own = liveSocket().sent.length;
      const echo: WhatsAppMessage = {
        key: { remoteJid: ME, id: "OUT1", fromMe: true },
        message: { conversation: "echo" },
        messageTimestamp: 1_793_000_100,
      };
      liveSocket().receive(echo);
      await new Promise((done) => setTimeout(done, 50));
      assert.equal(threads.received(key(connectionId, ME, "OUT1")), false);
      assert.equal(liveSocket().sent.length, own);
      return { ignored: true };
    });

    await step("a lost connection reconnects with backoff and keeps the same auth folder", async () => {
      const first = sockets.length;
      connectFailures = 2;
      liveSocket().update({ connection: "close", lastDisconnect: { error: { output: { statusCode: 408 } } } });
      await waitFor("a new socket after two failed attempts", () => sockets.length > first);
      liveSocket().update({ connection: "open" });
      await waitFor("connected again", () => messaging.whatsappOverview().connections[0]?.state === "connected");
      assert.equal(connectCalls.length, first + 3, "The backoff did not try three times.");
      assert.ok(connectCalls.every((dir) => dir === authDir));
      return { attempts: connectCalls.length };
    });

    await step("a restart request after pairing reconnects at once", async () => {
      const before = sockets.length;
      liveSocket().update({ connection: "close", lastDisconnect: { error: { output: { statusCode: 515 } } } });
      await waitFor("the restart socket", () => sockets.length > before);
      liveSocket().update({ connection: "open" });
      return { restarted: true };
    });

    await step("the phone unlinks the account: the connection stops and the auth folder is cleared", async () => {
      mkdirSync(authDir, { recursive: true });
      writeFileSync(join(authDir, "creds.json"), "{}");
      const before = sockets.length;
      liveSocket().update({ connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } } });
      await waitFor("the stopped state", () => messaging.whatsappOverview().connections[0]?.state === "invalid_token");
      await new Promise((done) => setTimeout(done, 50));
      assert.equal(sockets.length, before, "It reconnected after the unlink.");
      assert.equal(existsSync(join(authDir, "creds.json")), false);
      return { state: "invalid_token" };
    });
  });

  await boot(async ({ messaging, threads, connectionId }) => {
    await step("an empty allowlist lets nothing through", async () => {
      await runCauseEffect(credentials.set(connectionId, { account: "whatsapp" }));
      await runCauseEffect(messaging.setEnabled("whatsapp", "whatsapp", false));
      await runCauseEffect(messaging.setEnabled("whatsapp", "whatsapp", true));
      await waitFor("a socket", () => sockets.length > 0);
      liveSocket().update({ connection: "open" });
      const { id, message } = text(ALLOWED, "hello");
      liveSocket().receive(message);
      await new Promise((done) => setTimeout(done, 100));
      assert.equal(threads.received(key(connectionId, ALLOWED, id)), false);
      return { dropped: true };
    });
  });

  report.passed = true;
} finally {
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
}

const written = readFileSync(REPORT, "utf8");
assert.ok(!written.includes(STRANGER_TEXT), "The report holds message text.");
process.stdout.write(`messaging-whatsapp-e2e: ${report.steps.length} steps passed. Report: ${REPORT}
`);
