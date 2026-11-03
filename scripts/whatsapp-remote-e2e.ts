// Links, unlinks and edits the WhatsApp allowlist of one host from a joined computer. The host is a real
// `TeamApiServer` with a real `MessagingService` whose WhatsApp socket is a fake; the joined computer is
// the real messaging IPC handlers of its main process with an empty messaging service of its own, so a
// call that reached the wrong computer would show. The owner links through the whatsapp-link-v1 routes
// and reads the QR code; a member who is not an admin is refused on every route and changes nothing; a
// client that does not send the capability gets 400.
// Run: `bun scripts/whatsapp-remote-e2e.ts`.
// Writes .openbot-build/whatsapp-remote-e2e/report.json.
// Not checked here: the real Baileys library, the WhatsApp servers, WebRTC, and the renderer.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  IPC_ENDPOINTS,
  isAddMessagingOrchestratorResult,
  isWhatsAppOverview,
  type WhatsAppOverview,
} from "@openbot/contracts/ipc";
import { TEAM_API_ROUTES } from "@openbot/contracts/team-api-routes";
import {
  TEAM_APP_VERSION_HEADER,
  TEAM_CAPABILITIES_HEADER,
  TEAM_PROTOCOL_VERSION_HEADER,
} from "@openbot/contracts/team-protocol";
import { teamCapabilitiesForProtocol } from "@openbot/contracts/team-protocol/current";
import { TEAM_PROTOCOL_V9 } from "@openbot/contracts/team-protocol/v9";
import { WHATSAPP_LINK_CAPABILITY, WHATSAPP_LINK_ROUTES } from "@openbot/contracts/team-protocol/whatsapp-link-v1";
import { sourceText } from "@openbot/i18n/source";
import { createOpenBotLogger } from "@openbot/logging";
import { plugin } from "bun";
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
import { WhatsAppPairing } from "../src/backend/messaging/whatsapp/whatsapp-transport";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { SidebarLayoutStore } from "../src/backend/sidebar-layout-store";
import type { TeamApiBrowser } from "../src/main/team-api/dependencies";
import { inertBrowserHost, memoryCredentials, record, text, unused, waitFor } from "./agent-service-support";

const OUT = resolve(import.meta.dirname, "../.openbot-build/whatsapp-remote-e2e");
const HOST_VERSION = "0.0.0-e2e";
const OWNER = { username: "owner-user", password: "owner-password-123" };
const MEMBER = { username: "member-user", password: "member-password-123" };
const SERVER_ID = "mini";
const STEP_DEADLINE_MS = 30_000;
const ALLOWED = "447700900002";
const ALLOWED_JID = `${ALLOWED}@s.whatsapp.net`;
const ALLOWED_GROUP = "120363000000000001@g.us";
const TRUSTED_FRAME = "openbot-app://app/index.html";

const ipcHandlers = new Map<string, (event: unknown, payload: unknown) => unknown>();

plugin({
  name: "whatsapp-remote-electron-boundary",
  setup(build) {
    class Inert {}
    build.module("electron", () => ({
      loader: "object",
      exports: {
        app: { getPath: () => tmpdir(), getVersion: () => HOST_VERSION, isPackaged: false, on: () => undefined },
        BrowserWindow: Object.assign(class extends Inert {}, { getAllWindows: () => [] }),
        MessageChannelMain: class extends Inert {},
        Notification: Object.assign(class extends Inert {}, { isSupported: () => false }),
        clipboard: {},
        dialog: {},
        ipcMain: {
          handle: (channel: string, run: (event: unknown, payload: unknown) => unknown) =>
            void ipcHandlers.set(channel, run),
          removeHandler: () => undefined,
          on: () => undefined,
        },
        nativeImage: {},
        net: {},
        powerMonitor: { on: () => undefined },
        safeStorage: { isEncryptionAvailable: () => false },
        screen: {},
        session: {},
        shell: { openExternal: async () => undefined },
        systemPreferences: {},
        webContents: { getAllWebContents: () => [] },
      },
    }));
  },
});

const { TeamApiServer } = await import("../src/main/team-api-server");
const { TeamStore } = await import("../src/main/team-store");
const { RemoteWorkflowError } = await import("../src/main/remote-service-effects");
const { messagingIpcHandlers } = await import("../src/main/ipc/messaging-handlers");
const { registerIpcGroup } = await import("../src/main/ipc/define-ipc-group");

interface Step {
  name: string;
  passed: boolean;
  detail?: unknown;
  error?: string;
}

const report: { passed: boolean; unverified: string[]; steps: Step[] } = {
  passed: false,
  unverified: [
    "The real Baileys library, the WhatsApp servers and a linked account: a fake socket stands in for them.",
    "WebRTC: the joined computer reaches the host over HTTP on loopback; the routes and their bodies are the same.",
    "The renderer page: its look and its polling are checked in the running app.",
  ],
  steps: [],
};

async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  process.stdout.write(`- ${name}\n`);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error(`No result within ${STEP_DEADLINE_MS} ms.`)), STEP_DEADLINE_MS);
      }),
    ]);
    report.steps.push({ name, passed: true, detail: value });
    return value;
  } catch (error) {
    report.steps.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

const teamBrowser: TeamApiBrowser = {
  listTabs: () => [],
  getControlState: () => ({ sessions: [] }),
  open: unused,
  activate: unused,
  navigate: unused,
  reload: unused,
  stop: unused,
  takeUserControl: unused,
  releaseUserControl: () => {},
  releaseUserControlHeldBy: () => {},
  close: unused,
  capturePreview: unused,
  setVisible: unused,
  getDisplayState: () => ({ tabs: [], activeTabId: null }),
  loadUrl: unused,
  isPrivate: () => false,
  startView: unused,
  dispatchViewInput: unused,
  copyViewSelection: unused,
  importSignIn: unused,
};

class FakeSocket implements WhatsAppSocket {
  readonly user = { id: "447700900001:7@s.whatsapp.net", lid: "100200300400:7@lid" };
  ended = false;
  loggedOut = false;
  readonly #handlers: { [E in keyof WhatsAppEvents]: Array<(payload: WhatsAppEvents[E]) => void> } = {
    "connection.update": [],
    "creds.update": [],
    "messages.upsert": [],
  };

  readonly ev: WhatsAppSocket["ev"] = {
    on: (event, handler) => {
      this.#handlers[event].push(handler);
    },
  };

  sendMessage = async (jid: string, _content: WhatsAppOutbound, _options?: { quoted?: WhatsAppMessage }) => ({
    key: { remoteJid: jid, id: "OUT1", fromMe: true },
  });
  groupMetadata = async () => ({ subject: "Group" });
  end = () => {
    this.ended = true;
  };
  logout = async () => {
    this.loggedOut = true;
  };

  update(update: WhatsAppConnectionUpdate): void {
    for (const handler of this.#handlers["connection.update"]) handler(update);
  }
}

const sockets: FakeSocket[] = [];
const connectCalls: string[] = [];
const liveSocket = (): FakeSocket => {
  const socket = sockets.at(-1);
  assert.ok(socket, "No socket was opened.");
  return socket;
};

interface Computer {
  database: OpenBotDatabase;
  agents: AgentService;
  messaging: MessagingService;
  root: string;
  team: InstanceType<typeof TeamStore>;
}

async function startComputer(label: string, drivers: ReturnType<typeof whatsappDriver>[]): Promise<Computer> {
  const root = await mkdtemp(join(tmpdir(), `openbot-whatsapp-remote-${label}-`));
  const userData = join(root, "user-data");
  const database = new OpenBotDatabase(userData);
  const store = new AgentStore(userData, join(root, "home"), database);
  const mailbox = new MailboxStore(userData, store.sharedRoot, database);
  const sidebar = new SidebarLayoutStore(join(userData, "sidebar-layout.json"));
  const team = new TeamStore(join(userData, "openbot-team-server-v2.json"));
  await runCauseEffect(sidebar.initialize());
  await runCauseEffect(store.initialize());
  await runCauseEffect(mailbox.initialize());
  await runCauseEffect(team.initialize());
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
    credentials: memoryCredentials(),
    drivers,
    downloadsRoot: join(userData, "messaging-downloads"),
    sidebar,
    whatsappPairing: pairing,
  });
  await runCauseEffect(messaging.start());
  return { database, agents, messaging, root, team };
}

async function stopComputer(computer: Computer): Promise<void> {
  await runCauseEffect(computer.messaging.stop()).catch(() => undefined);
  await runCauseEffect(computer.agents.stop()).catch(() => undefined);
  computer.database.close();
  await rm(computer.root, { recursive: true, force: true });
}

const pairing = new WhatsAppPairing();
const hostRoot = await mkdtemp(join(tmpdir(), "openbot-whatsapp-remote-auth-"));
const authDir = join(hostRoot, "whatsapp-auth");
const connect = async (dir: string): Promise<WhatsAppClient> => {
  connectCalls.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "creds.json"), "{}");
  const socket = new FakeSocket();
  sockets.push(socket);
  return { socket, downloadMedia: async () => new Uint8Array() };
};

const host = await startComputer("host", [
  whatsappDriver({
    connect,
    authDir,
    pairing,
    retryDelayMs: () => 0,
    logger: createOpenBotLogger("whatsapp-remote-e2e", () => {}),
  }),
]);
const joined = await startComputer("joined", []);
await runCauseEffect(host.team.configure("E2E Host", OWNER.username, OWNER.password));

const server = new TeamApiServer({
  store: host.team,
  agents: host.agents,
  mailbox: new MailboxStore(join(host.root, "team-mail"), join(host.root, "team-shared"), host.database),
  browser: teamBrowser,
  appVersion: HOST_VERSION,
  whatsappLink: host.messaging,
});
const port = await Effect.runPromise(server.start());

async function call(
  method: string,
  path: string,
  init: { token?: string; body?: unknown; capabilities?: readonly string[] } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    [TEAM_PROTOCOL_VERSION_HEADER]: String(TEAM_PROTOCOL_V9),
    [TEAM_APP_VERSION_HEADER]: HOST_VERSION,
    [TEAM_CAPABILITIES_HEADER]: (init.capabilities ?? teamCapabilitiesForProtocol(TEAM_PROTOCOL_V9)).join(","),
  };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
  const raw = await response.text();
  return { status: response.status, body: raw ? JSON.parse(raw) : null };
}

async function login(account: { username: string; password: string }): Promise<string> {
  const response = await call("POST", TEAM_API_ROUTES.auth.login, { body: account });
  assert.equal(response.status, 200, `Login returned ${response.status}.`);
  return text(record(response.body, "login").sessionToken, "token");
}

let token = "";
let hostCapabilities: readonly string[] = teamCapabilitiesForProtocol(TEAM_PROTOCOL_V9);

const remoteServers = {
  supportsCapability: (_serverId: string, capability: string) => hostCapabilities.includes(capability),
  request: <T>(
    _serverId: string,
    path: string,
    decoder: (value: unknown) => T,
    init: { method?: string; body?: unknown } = {},
  ) =>
    Effect.tryPromise({
      try: async () => {
        const response = await call(init.method ?? "GET", path, { token, body: init.body });
        if (response.status >= 400) {
          throw new Error(text(record(response.body, "error body").error, "error"));
        }
        return decoder(response.body);
      },
      catch: (cause) => new RemoteWorkflowError({ cause }),
    }),
};

registerIpcGroup(
  "messaging",
  messagingIpcHandlers({
    messaging: joined.messaging,
    remoteServers,
    relayedInstalls: { remember: unused },
    openExternal: async () => {},
  }).messaging,
);

function invoke(channel: string, serverId: string, payload: unknown): Promise<void>;
function invoke<T>(channel: string, serverId: string, payload: unknown, decode: (value: unknown) => T): Promise<T>;
async function invoke<T>(
  channel: string,
  serverId: string,
  payload: unknown,
  decode?: (value: unknown) => T,
): Promise<T | undefined> {
  const run = ipcHandlers.get(channel);
  assert.ok(run, `No handler for ${channel}.`);
  const result = await run({ senderFrame: { url: TRUSTED_FRAME } }, { serverId, payload });
  return decode?.(result);
}

const messagingChannels = IPC_ENDPOINTS.messaging;
function whatsAppOverview(value: unknown): WhatsAppOverview {
  assert.ok(isWhatsAppOverview(value), "The overview has the wrong shape.");
  return value;
}
const overview = () => invoke(messagingChannels.hostGetWhatsAppOverview.channel, SERVER_ID, null, whatsAppOverview);
const setChats = (chats: string[]) =>
  invoke(messagingChannels.hostSetWhatsAppAllowedChats.channel, SERVER_ID, { chats }, whatsAppOverview);
const WHATSAPP_ROUTES = Object.values(WHATSAPP_LINK_ROUTES);

try {
  mkdirSync(OUT, { recursive: true });
  const memberInvite = await runCauseEffect(host.team.createInvite("member"));
  const ownerToken = await login(OWNER);
  const joinedAs = await call("POST", TEAM_API_ROUTES.join.server, {
    body: { inviteToken: memberInvite.token, ...MEMBER },
  });
  assert.equal(joinedAs.status, 201, `Join returned ${joinedAs.status}.`);
  const memberToken = await login(MEMBER);

  await step("a member who is not an admin is refused on every route and nothing changes", async () => {
    const statuses: Record<string, number> = {};
    for (const path of WHATSAPP_ROUTES) {
      const body =
        path === WHATSAPP_LINK_ROUTES.enabled
          ? { enabled: true }
          : path === WHATSAPP_LINK_ROUTES.allowedChats
            ? { chats: [ALLOWED] }
            : {};
      statuses[path] = (await call("POST", path, { token: memberToken, body })).status;
    }
    assert.deepEqual(
      Object.values(statuses),
      WHATSAPP_ROUTES.map(() => 403),
      `A member got ${JSON.stringify(statuses)}.`,
    );
    assert.equal(connectCalls.length, 0, "A member started a link.");
    assert.deepEqual(host.messaging.whatsappOverview(), { connections: [], qr: null, allowedChats: [] });
    return statuses;
  });

  await step("a client that does not send whatsapp-link-v1 gets 400", async () => {
    const older = teamCapabilitiesForProtocol(TEAM_PROTOCOL_V9).filter((value) => value !== WHATSAPP_LINK_CAPABILITY);
    const refused = await call("POST", WHATSAPP_LINK_ROUTES.overview, {
      token: ownerToken,
      body: {},
      capabilities: older,
    });
    assert.equal(refused.status, 400);
    return { status: refused.status };
  });

  await step("a member who joined the server gets an error from the joined computer's call", async () => {
    token = memberToken;
    try {
      await assert.rejects(overview());
    } finally {
      token = ownerToken;
    }
    return { refused: true };
  });

  await step("the owner reads an unlinked host", async () => {
    const read = await overview();
    assert.deepEqual(read, { connections: [], qr: null, allowedChats: [] });
    return read;
  });

  await step("a host without the capability is refused before a request is sent", async () => {
    hostCapabilities = hostCapabilities.filter((value) => value !== WHATSAPP_LINK_CAPABILITY);
    try {
      await assert.rejects(overview());
    } finally {
      hostCapabilities = teamCapabilitiesForProtocol(TEAM_PROTOCOL_V9);
    }
    assert.equal(connectCalls.length, 0);
    return { requests: 0 };
  });

  await step(
    "connect on the joined server opens a socket on the host and shows the QR code from the host",
    async () => {
      await invoke(messagingChannels.hostConnect.channel, SERVER_ID, { platform: "whatsapp", place: null });
      await waitFor("the host socket", () => sockets.length > 0);
      liveSocket().update({ connection: "connecting" });
      liveSocket().update({ qr: "2@remote-pairing-code" });
      const read = await overview();
      assert.equal(read.qr, "2@remote-pairing-code");
      assert.notEqual(read.connections[0]?.state, "connected");
      assert.deepEqual(connectCalls, [authDir]);
      assert.deepEqual(joined.messaging.whatsappOverview(), { connections: [], qr: null, allowedChats: [] });
      return { qr: read.qr, state: read.connections[0]?.state };
    },
  );

  await step("the QR code clears when the phone links", async () => {
    liveSocket().update({ connection: "open" });
    await waitFor("the connected state", () => host.messaging.whatsappOverview().connections[0]?.state === "connected");
    const linked = await overview();
    assert.equal(linked.connections[0]?.state, "connected");
    assert.equal(linked.qr, null);
    return { state: linked.connections[0]?.state };
  });

  await step("the allowlist is edited on the host, a bad chat is refused, and the list stays", async () => {
    const saved = await setChats([ALLOWED, ALLOWED_GROUP]);
    assert.deepEqual(saved.allowedChats, [ALLOWED_JID, ALLOWED_GROUP]);
    assert.deepEqual(host.messaging.whatsappOverview().allowedChats, [ALLOWED_JID, ALLOWED_GROUP]);
    await assert.rejects(setChats(["not a chat"]), (error: Error) =>
      error.message.endsWith(sourceText("error.messaging.whatsappChatInvalid")),
    );
    assert.deepEqual((await overview()).allowedChats, [ALLOWED_JID, ALLOWED_GROUP]);
    assert.deepEqual(joined.messaging.whatsappOverview().allowedChats, []);
    return { allowedChats: saved.allowedChats };
  });

  await step(
    "add orchestrator makes one WhatsApp Orchestrator on the host and none on the joined computer",
    async () => {
      const added = await invoke(
        messagingChannels.hostAddOrchestrator.channel,
        SERVER_ID,
        { platform: "whatsapp", workspaceId: null },
        (value) => {
          assert.ok(isAddMessagingOrchestratorResult(value), "The orchestrator result has the wrong shape.");
          return value;
        },
      );
      assert.equal(host.agents.listAgents().find((agent) => agent.id === added.agentId)?.name, "WhatsApp Orchestrator");
      assert.equal(
        joined.agents.listAgents().some((agent) => agent.name === "WhatsApp Orchestrator"),
        false,
      );
      assert.equal((await overview()).connections[0]?.orchestratorAgentId, added.agentId);
      return { agentId: added.agentId };
    },
  );

  await step("a member cannot unlink, and the host keeps its login", async () => {
    token = memberToken;
    try {
      await assert.rejects(
        invoke(messagingChannels.hostDisconnect.channel, SERVER_ID, { platform: "whatsapp", workspaceId: "whatsapp" }),
      );
      await assert.rejects(setChats([]));
    } finally {
      token = ownerToken;
    }
    assert.equal(liveSocket().loggedOut, false);
    assert.ok(existsSync(authDir));
    assert.deepEqual(host.messaging.whatsappOverview().allowedChats, [ALLOWED_JID, ALLOWED_GROUP]);
    return { loggedOut: false };
  });

  await step("turn off and on stops and reopens the host socket", async () => {
    const before = sockets.length;
    await invoke(messagingChannels.hostSetEnabled.channel, SERVER_ID, {
      platform: "whatsapp",
      workspaceId: "whatsapp",
      enabled: false,
    });
    assert.equal((await overview()).connections[0]?.enabled, false);
    await invoke(messagingChannels.hostSetEnabled.channel, SERVER_ID, {
      platform: "whatsapp",
      workspaceId: "whatsapp",
      enabled: true,
    });
    await waitFor("a new socket", () => sockets.length > before);
    assert.equal((await overview()).connections[0]?.enabled, true);
    return { sockets: sockets.length - before };
  });

  await step("unlink logs the host account out, deletes its login and shows a new QR on the next link", async () => {
    const unlinked = liveSocket();
    await invoke(messagingChannels.hostDisconnect.channel, SERVER_ID, {
      platform: "whatsapp",
      workspaceId: "whatsapp",
    });
    assert.equal(unlinked.loggedOut, true, "The host account was not logged out of WhatsApp.");
    assert.equal(existsSync(authDir), false, "The login stayed on the host.");
    assert.deepEqual(await overview(), { connections: [], qr: null, allowedChats: [] });
    const before = sockets.length;
    await invoke(messagingChannels.hostConnect.channel, SERVER_ID, { platform: "whatsapp", place: null });
    await waitFor("a new socket", () => sockets.length > before);
    liveSocket().update({ qr: "2@second-code" });
    assert.equal((await overview()).qr, "2@second-code");
    return { relinked: true };
  });

  await step("the joined computer's own WhatsApp stayed empty through every step", async () => {
    assert.deepEqual(joined.messaging.whatsappOverview(), { connections: [], qr: null, allowedChats: [] });
    return { joined: "empty" };
  });

  report.passed = true;
} finally {
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await Effect.runPromise(server.stop()).catch(() => undefined);
  await stopComputer(host);
  await stopComputer(joined);
  await rm(hostRoot, { recursive: true, force: true });
}

process.stdout.write(`whatsapp-remote-e2e: ${report.steps.length} steps passed. Report: ${join(OUT, "report.json")}\n`);
