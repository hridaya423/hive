// Moves an agent with one routine between two hosts, each a real `AgentService`, SQLite database and
// `TeamApiServer` on its own temporary profile and loopback port. The first move goes from host A,
// reached as this computer's own server, to host B, reached as a joined server over the Team API. The
// second goes back. After each move the routine must be on the target, absent from the source, armed
// on the target only, and run there. The source agent stays as a hidden, read-only archive.
// A refused import must leave the source untouched. No provider CLI starts: a routine run queues its
// delivery and the check cancels it.
// Run: `bun scripts/agent-move-e2e.ts`.
// Writes .openbot-build/agent-move-e2e/report.json.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type AgentSummary,
  DEFAULT_AGENT_DEFAULTS,
  DEFAULT_BUSY_MESSAGE_MODE,
  decodeRemoteInstanceTransferPreview,
  type Routine,
} from "@openbot/contracts/ipc";
import { TEAM_API_ROUTES } from "@openbot/contracts/team-api-routes";
import {
  TEAM_APP_VERSION_HEADER,
  TEAM_CAPABILITIES_HEADER,
  TEAM_PROTOCOL_VERSION_HEADER,
} from "@openbot/contracts/team-protocol";
import { AGENT_HIDDEN_ROUTES } from "@openbot/contracts/team-protocol/agent-hidden-v1";
import { teamCapabilitiesForProtocol } from "@openbot/contracts/team-protocol/current";
import { decodeTeamProtocolV1CurrentHttpResponse } from "@openbot/contracts/team-protocol/v1-adapter";
import { TEAM_PROTOCOL_V7 } from "@openbot/contracts/team-protocol/v7";
import { plugin } from "bun";
import { Effect } from "effect";
import { AgentService } from "../src/backend/agent-service";
import { AgentStore } from "../src/backend/agent-store";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { SidebarLayoutStore } from "../src/backend/sidebar-layout-store";
import type { TeamApiBrowser } from "../src/main/team-api/dependencies";
import { inertBrowserHost, record, text, unused } from "./agent-service-support";

const OUT = resolve(import.meta.dirname, "../.openbot-build/agent-move-e2e");
const HOST_VERSION = "0.0.0-e2e";
const OWNER = { username: "owner-user", password: "owner-password-123" };
const STEP_DEADLINE_MS = 60_000;
const NOTES = "Park behind the court.\n";

plugin({
  name: "agent-move-electron-boundary",
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
        ipcMain: { handle: () => undefined, removeHandler: () => undefined, on: () => undefined },
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
const { AGENT_ACCESS_FILE, AgentAccessStore } = await import("../src/main/agent-access-store");
const { TeamStore } = await import("../src/main/team-store");
const { InstanceTransferService } = await import("../src/main/instance-transfer-service");
const { createAgentHostSettings } = await import("../src/main/agent-host-settings");
const { RemoteWorkflowError } = await import("../src/main/remote-service-effects");
const { localMoveHost, moveAgent, remoteMoveHost } = await import("../src/main/agent-move");

interface Step {
  name: string;
  passed: boolean;
  detail?: unknown;
  error?: string;
}

const report: { passed: boolean; unverified: string[]; steps: Step[] } = {
  passed: false,
  unverified: [
    "A real provider turn: no provider CLI starts, so a routine run is shown by its queued delivery.",
    "WebRTC: the joined host is reached over HTTP on loopback; the Team API routes and their bodies are the same.",
    "Provider sign-ins and models: neither host lists a model, so backup models are checked as a warning, not copied.",
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

interface Host {
  label: string;
  root: string;
  database: OpenBotDatabase;
  store: AgentStore;
  mailbox: MailboxStore;
  sidebar: SidebarLayoutStore;
  agents: AgentService;
  instanceTransfer: InstanceType<typeof InstanceTransferService>;
  hostSettings: ReturnType<typeof createAgentHostSettings>;
  server: InstanceType<typeof TeamApiServer>;
  team: InstanceType<typeof TeamStore>;
  port: number;
  token: string;
}

const emptySkills = {
  list: () => Effect.succeed([]),
  create: unused,
  revise: unused,
  withdraw: unused,
};

async function startHost(label: string): Promise<Host> {
  const root = await mkdtemp(join(tmpdir(), `openbot-agent-move-${label}-`));
  const userData = join(root, "user-data");
  const home = join(root, "home");
  const database = new OpenBotDatabase(userData);
  const store = new AgentStore(userData, home, database);
  const mailbox = new MailboxStore(userData, store.sharedRoot, database);
  const sidebar = new SidebarLayoutStore(join(userData, "sidebar-layout.json"));
  const team = new TeamStore(join(userData, "openbot-team-server-v2.json"));
  const access = new AgentAccessStore(join(userData, AGENT_ACCESS_FILE));
  await runCauseEffect(sidebar.initialize());
  await runCauseEffect(store.initialize());
  await runCauseEffect(mailbox.initialize());
  await runCauseEffect(team.initialize());
  assert.equal(await runCauseEffect(access.load()), true, "The roles file did not load.");
  await runCauseEffect(team.configure(`E2E Host ${label}`, OWNER.username, OWNER.password));
  const agents = new AgentService({ store, mailbox, browser: inertBrowserHost, sidebarLayout: sidebar });
  const instanceTransfer = new InstanceTransferService({
    agents,
    skills: { library: () => emptySkills, installLocal: unused },
    sharedRoot: store.sharedRoot,
    appVersion: HOST_VERSION,
    uploadDirectory: join(userData, "instance-transfer-uploads"),
    timezone: () => "UTC",
    settings: {
      mcpServers: () => [],
      saveMcpServer: unused,
      customProviders: () => [],
      saveCustomProvider: unused,
      customAgents: () => Effect.succeed([]),
      providersOff: () => [],
      sidebar: () => sidebar.getSnapshot(),
      mutateSidebar: unused,
      routineFlowLinks: () => Effect.succeed([]),
      connectRoutineFlow: unused,
      signedInProviders: () => [],
    },
  });
  const hostSettings = createAgentHostSettings({
    agents,
    busyMessageMode: { get: () => ({ mode: DEFAULT_BUSY_MESSAGE_MODE }) },
    agentDefaults: { get: () => DEFAULT_AGENT_DEFAULTS },
  });
  const server = new TeamApiServer({
    store: team,
    agents,
    mailbox,
    browser: teamBrowser,
    sidebarLayout: sidebar,
    appVersion: HOST_VERSION,
    hiddenAgents: agents,
    agentAccess: access,
    instanceTransfer,
    admin: { agentHost: hostSettings },
  });
  const port = await Effect.runPromise(server.start());
  const host: Host = {
    label,
    root,
    database,
    store,
    mailbox,
    sidebar,
    agents,
    instanceTransfer,
    hostSettings,
    server,
    team,
    port,
    token: "",
  };
  host.token = text(
    record((await call(host, "POST", TEAM_API_ROUTES.auth.login, { body: OWNER })).body, "login").sessionToken,
    "token",
  );
  return host;
}

async function stopHost(host: Host): Promise<void> {
  await Effect.runPromise(host.server.stop()).catch(() => undefined);
  await runCauseEffect(host.agents.stop()).catch(() => undefined);
  host.database.close();
  await rm(host.root, { recursive: true, force: true });
}

interface CallInit {
  body?: unknown;
  raw?: Uint8Array;
  token?: string;
}

async function call(
  host: Host,
  method: string,
  path: string,
  init: CallInit = {},
): Promise<{ status: number; body: unknown; bytes: Uint8Array }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    [TEAM_PROTOCOL_VERSION_HEADER]: String(TEAM_PROTOCOL_V7),
    [TEAM_APP_VERSION_HEADER]: HOST_VERSION,
    [TEAM_CAPABILITIES_HEADER]: teamCapabilitiesForProtocol(TEAM_PROTOCOL_V7).join(","),
  };
  const token = init.token ?? host.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | null = null;
  if (init.raw) {
    headers["Content-Type"] = "application/zip";
    body = Buffer.from(init.raw);
  } else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const response = await fetch(`http://127.0.0.1:${host.port}${path}`, { method, headers, body });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const raw = Buffer.from(bytes).toString("utf8");
  const type = response.headers.get("content-type") ?? "";
  return { status: response.status, body: type.includes("json") && raw ? JSON.parse(raw) : null, bytes };
}

const hosts = new Map<string, Host>();
const failures = new Set<string>();
const blockedDeletes = new Set<string>();

function hostFor(serverId: string): Host {
  const host = hosts.get(serverId);
  assert.ok(host, `No host for ${serverId}.`);
  return host;
}

function fail(path: string, status: number, body: unknown): never {
  throw new Error(`${path} returned ${status}: ${JSON.stringify(body)}`);
}

const transport = {
  supportsCapability: () => true,
  request: <T>(
    serverId: string,
    path: string,
    decoder: (value: unknown) => T,
    init: { method?: string; body?: unknown } = {},
  ) =>
    Effect.tryPromise({
      try: async () => {
        if (failures.has(`${serverId}:${path}`)) throw new Error(`The ${serverId} host refused ${path}.`);
        if (init.method === "DELETE" && blockedDeletes.has(serverId))
          throw new Error(`The ${serverId} host refused ${path}.`);
        const response = await call(hostFor(serverId), init.method ?? "GET", path, { body: init.body });
        if (response.status >= 400) fail(path, response.status, response.body);
        const [route] = path.split("?");
        const released = route?.startsWith("/v1/agents/") === true;
        return decoder(
          released
            ? decodeTeamProtocolV1CurrentHttpResponse(
                init.method ?? "GET",
                route ?? path,
                response.status,
                response.body,
              )
            : response.body,
        );
      },
      catch: (cause) => new RemoteWorkflowError({ cause }),
    }),
  stageInstanceTransfer: (serverId: string, bytes: Uint8Array) =>
    Effect.tryPromise({
      try: async () => {
        const path = "/v1/instance-transfer/stage";
        if (failures.has(`${serverId}:${path}`)) throw new Error(`The ${serverId} host refused ${path}.`);
        const response = await call(hostFor(serverId), "POST", path, { raw: bytes });
        if (response.status >= 400) fail(path, response.status, response.body);
        return decodeRemoteInstanceTransferPreview(response.body);
      },
      catch: (cause) => new RemoteWorkflowError({ cause }),
    }),
  downloadInstanceTransfer: (serverId: string, input: unknown) =>
    Effect.tryPromise({
      try: async () => {
        const path = "/v1/instance-transfer/export";
        const response = await call(hostFor(serverId), "POST", path, { body: input });
        if (response.status >= 400) fail(path, response.status, response.body);
        return response.bytes;
      },
      catch: (cause) => new RemoteWorkflowError({ cause }),
    }),
};

function localHost(host: Host) {
  return localMoveHost({
    name: host.label,
    agents: host.agents,
    hostSettings: host.hostSettings,
    instanceTransfer: host.instanceTransfer,
    sidebarLayout: host.sidebar,
  });
}

function remoteHost(serverId: string) {
  return remoteMoveHost(transport, serverId, serverId, { uploadTimeoutMs: STEP_DEADLINE_MS, timezone: "UTC" });
}

function agentsOf(host: Host): AgentSummary[] {
  return host.agents.listAgents();
}

function visibleAgentsOf(host: Host): AgentSummary[] {
  return agentsOf(host).filter((agent) => agent.hiddenAt === undefined);
}

function routinesOf(host: Host, agentId: string): Routine[] {
  return host.agents.listRoutines(agentId);
}

async function cancelQueued(host: Host, agentId: string): Promise<void> {
  const mailbox = host.mailbox;
  for (const deliveryId of mailbox.queuedDeliveryIds(agentId))
    await runCauseEffect(mailbox.cancel(agentId, deliveryId));
}

async function runRoutineOnce(host: Host, agentId: string, routineId: string): Promise<number> {
  const run = await runCauseEffect(host.agents.testRoutine({ agentId, routineId }));
  assert.equal(run.routineId, routineId);
  const queued = host.mailbox.queuedDeliveryIds(agentId).length;
  await cancelQueued(host, agentId);
  return queued;
}

mkdirSync(OUT, { recursive: true });
const mini = await startHost("mini");
const macbook = await startHost("macbook");
hosts.set("mini", mini);
hosts.set("macbook", macbook);

try {
  const created = await step(
    "Host A holds one agent with one routine, a workspace file and a second agent",
    async () => {
      const agent = await runCauseEffect(
        mini.agents.createAgentProfile({
          name: "Badminton Booker",
          description: "Books the court every week.",
          avatarSeed: "badminton",
          avatarHue: null,
          title: "Court booker",
        }),
      );
      await runCauseEffect(
        mini.agents.createAgentProfile({
          name: "Stays Put",
          description: "Not moved.",
          avatarSeed: "stays",
          avatarHue: null,
        }),
      );
      await writeFile(join(agent.workspacePath, "notes.txt"), NOTES);
      const routine = mini.agents.createRoutine({
        agentId: agent.id,
        name: "Book court",
        instruction: "Book the 7pm court.",
        active: true,
        timezone: "UTC",
        schedule: { kind: "daily", time: "07:00" },
        missedPolicy: "run-once",
      });
      assert.equal(routinesOf(mini, agent.id).length, 1);
      assert.notEqual(mini.agents.nextRoutineDueAt(), null, "The routine is not armed on host A.");
      assert.equal(macbook.agents.nextRoutineDueAt(), null);
      return { agentId: agent.id, routineId: routine.id };
    },
  );

  const first = await step("Move A to B: this computer's server to a joined server", async () => {
    const result = await runCauseEffect(
      moveAgent({ source: localHost(mini), target: remoteHost("macbook"), agentId: created.agentId }),
    );
    assert.equal(result.name, "Badminton Booker");
    return result;
  });

  await step("The routine is on B, gone from A, armed on B only", async () => {
    const moved = agentsOf(macbook).find((agent) => agent.id === first.agentId);
    assert.ok(moved, "Host B has no moved agent.");
    assert.equal(moved.name, "Badminton Booker");
    assert.equal(moved.title, "Court booker");
    const routines = routinesOf(macbook, first.agentId);
    assert.equal(routines.length, 1);
    assert.equal(routines[0]?.name, "Book court");
    assert.equal(routines[0]?.missedPolicy, "run-once");
    assert.deepEqual(routinesOf(mini, created.agentId), []);
    assert.notEqual(macbook.agents.nextRoutineDueAt(), null, "The routine is not armed on host B.");
    assert.equal(mini.agents.nextRoutineDueAt(), null, "The routine is still armed on host A.");
    assert.equal(await readFile(join(moved.workspacePath, "notes.txt"), "utf8"), NOTES);
    return { routines: routines.length };
  });

  await step("The routine fires on B and cannot fire on A", async () => {
    const queued = await runRoutineOnce(macbook, first.agentId, routinesOf(macbook, first.agentId)[0]?.id ?? "");
    assert.equal(queued, 1, "The run did not queue a delivery on host B.");
    await assert.rejects(
      runCauseEffect(mini.agents.testRoutine({ agentId: created.agentId, routineId: created.routineId })),
    );
    return { deliveriesOnB: queued };
  });

  await step("The source agent stays as a hidden archive and the other agent stays visible", async () => {
    const archived = agentsOf(mini).find((agent) => agent.id === created.agentId);
    assert.ok(archived, "Host A lost the source agent.");
    assert.notEqual(archived.hiddenAt, undefined, "The source agent is not hidden.");
    assert.deepEqual(
      visibleAgentsOf(mini).map((agent) => agent.name),
      ["Stays Put"],
    );
    assert.deepEqual(
      visibleAgentsOf(macbook).map((agent) => agent.name),
      ["Badminton Booker"],
    );
  });

  await step("A refused import leaves the source untouched", async () => {
    failures.add("mini:/v1/instance-transfer/stage");
    const before = routinesOf(macbook, first.agentId).length;
    await assert.rejects(
      runCauseEffect(moveAgent({ source: remoteHost("macbook"), target: remoteHost("mini"), agentId: first.agentId })),
    );
    failures.delete("mini:/v1/instance-transfer/stage");
    const source = agentsOf(macbook).find((agent) => agent.id === first.agentId);
    assert.ok(source && source.hiddenAt === undefined, "The source agent was hidden after a refused import.");
    assert.equal(routinesOf(macbook, first.agentId).length, before);
    assert.equal(visibleAgentsOf(mini).length, 1);
  });

  const back = await step("Move B back to A: a joined server to this computer's server", async () => {
    const back = await runCauseEffect(
      moveAgent({ source: remoteHost("macbook"), target: localHost(mini), agentId: first.agentId }),
    );
    const restored = agentsOf(mini).find((agent) => agent.id === back.agentId);
    assert.ok(restored && restored.hiddenAt === undefined);
    assert.equal(routinesOf(mini, back.agentId).length, 1);
    assert.deepEqual(routinesOf(macbook, first.agentId), []);
    assert.equal(macbook.agents.nextRoutineDueAt(), null, "The routine is still armed on host B.");
    const queued = await runRoutineOnce(mini, back.agentId, routinesOf(mini, back.agentId)[0]?.id ?? "");
    assert.equal(queued, 1);
    const archived = agentsOf(macbook).find((agent) => agent.id === first.agentId);
    assert.notEqual(archived?.hiddenAt, undefined);
    return { agentId: back.agentId };
  });

  await step("A source that cannot hide the agent leaves no copy on the target", async () => {
    failures.add(`mini:${AGENT_HIDDEN_ROUTES.set}`);
    await assert.rejects(
      runCauseEffect(moveAgent({ source: remoteHost("mini"), target: remoteHost("macbook"), agentId: back.agentId })),
    );
    failures.delete(`mini:${AGENT_HIDDEN_ROUTES.set}`);
    assert.deepEqual(visibleAgentsOf(macbook), []);
    const source = agentsOf(mini).find((agent) => agent.id === back.agentId);
    assert.ok(source && source.hiddenAt === undefined, "The source agent was hidden.");
    assert.equal(routinesOf(mini, back.agentId).length, 1);
  });

  await step("A copy that cannot be removed from the target is reported", async () => {
    failures.add(`mini:${AGENT_HIDDEN_ROUTES.set}`);
    blockedDeletes.add("macbook");
    const refused = await runCauseEffect(
      moveAgent({ source: remoteHost("mini"), target: remoteHost("macbook"), agentId: back.agentId }),
    ).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    failures.delete(`mini:${AGENT_HIDDEN_ROUTES.set}`);
    blockedDeletes.delete("macbook");
    assert.ok(refused?.includes("kept a copy of the agent"), `The failure did not name the copy: ${refused}`);
    assert.equal(visibleAgentsOf(macbook).length, 1, "The leftover copy is not on the target.");
    return { refused };
  });

  report.passed = true;
} finally {
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await stopHost(mini);
  await stopHost(macbook);
}
process.stdout.write(`PASS ${report.steps.length} steps. Report: ${join(OUT, "report.json")}\n`);
