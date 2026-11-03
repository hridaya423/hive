// Headless token baseline. Starts the real backend `AgentService` on a fresh temporary profile with
// the real Codex CLI, creates N agents (the first one is `Probe`), sends `hi` to each, waits for the
// turns to end, and reads the model requests from `agent_usage_records` in the temporary database.
// It also counts the `codex app-server` processes, and breaks the first rollout down by component.
// `bun tools/token-baseline/measure.ts [--agents N] [--turns T] [--gap-ms MS] [--label NAME]`
// Writes .openbot-build/token-baseline/<label>-<time>.json. It never reads or writes Application Support.
// The Codex home is a copy of ~/.codex (config, AGENTS.md, rules, skills, auth.json); ~/.codex stays unchanged.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { AGENT_PROVIDERS, COMPUTER_USE_MCP_SERVER_ID, COMPUTER_USE_MCP_SERVER_NAME } from "@openbot/contracts/ipc";
import { inertBrowserHost, waitFor } from "../../scripts/agent-service-support";

const { values: options } = parseArgs({
  options: {
    agents: { type: "string", default: "1" },
    turns: { type: "string", default: "1" },
    "gap-ms": { type: "string", default: "0" },
    label: { type: "string", default: "run" },
    message: { type: "string", default: "hi" },
    "no-breakdown": { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
    "no-computer-use-server": { type: "boolean", default: false },
    "computer-use": { type: "string", default: "default" },
    access: { type: "string", default: "default" },
    "add-skill-before-turn": { type: "string" },
    "cua-driver": { type: "string", default: join(homedir(), ".local/bin/cua-driver") },
  },
});
const AGENT_COUNT = Number(options.agents);
const TURN_COUNT = Number(options.turns);
const GAP_MS = Number(options["gap-ms"]);
const TURN_DEADLINE_MS = 180_000;
const OUT = resolve(import.meta.dirname, "../../.openbot-build/token-baseline");
const REAL_CODEX_HOME = join(homedir(), ".codex");
const root = await mkdtemp(join(homedir(), ".hive-measure-"));
const userData = join(root, "user-data");
const codexHome = join(root, "codex-home");
mkdirSync(userData, { recursive: true });
mkdirSync(codexHome, { recursive: true });
for (const entry of ["config.toml", "AGENTS.md", "auth.json", "rules", "skills"]) {
  const source = join(REAL_CODEX_HOME, entry);
  if (existsSync(source)) cpSync(source, join(codexHome, entry), { recursive: true });
}
process.env.CODEX_HOME = codexHome;

const cuaSocket = join(root, "cua.sock");
const cuaDaemon = options["no-computer-use-server"]
  ? null
  : spawn(String(options["cua-driver"]), ["serve", "--socket", cuaSocket, "--no-overlay"], {
      env: {
        ...process.env,
        CUA_DRIVER_EMBEDDED: "1",
        CUA_DRIVER_RS_TELEMETRY_ENABLED: "0",
        CUA_DRIVER_RS_UPDATE_CHECK: "0",
      },
      stdio: "ignore",
    });
if (cuaDaemon) await waitFor("the Computer Use daemon socket", () => existsSync(cuaSocket), 15_000);

const { AgentService } = await import("../../src/backend/agent-service");
const { AgentStore } = await import("../../src/backend/agent-store");
const { runCauseEffect } = await import("../../src/backend/effect-boundary");
const { MailboxStore } = await import("../../src/backend/mailbox-store");
const { OpenBotDatabase } = await import("../../src/backend/openbot-database");

interface Request {
  turn: number;
  uncachedInput: number;
  cachedInput: number;
  cacheCreation: number;
  output: number;
}
interface AgentReport {
  name: string;
  agentId: string;
  externalSessionId?: string;
  startedAt: string;
  requests: Request[];
  rollout?: string;
  breakdown?: string;
  breakdownError?: string;
  developerMessages?: Array<{ index: number; chars: number; skills: boolean }>;
  toolNamespaces?: Record<string, number>;
  messages?: Array<{ index: number; role: string; chars: number; head: string }>;
}
const report: {
  passed: boolean;
  label: string;
  options: { agents: number; turns: number; gapMs: number; message: string; computerUse: string; access: string };
  codexVersion?: string;
  model?: string;
  agents: AgentReport[];
  firstRequests?: Array<{ agent: string; uncached: number; cached: number }>;
  turnTwoFirstRequests?: Array<{ agent: string; uncached: number; cached: number }>;
  processes?: {
    codexAppServers: number;
    codexRss: number;
    byCommand: Record<string, { count: number; rssKb: number }>;
  };
  error?: string;
} = {
  passed: false,
  label: String(options.label),
  options: {
    agents: AGENT_COUNT,
    turns: TURN_COUNT,
    gapMs: GAP_MS,
    message: String(options.message),
    computerUse: String(options["computer-use"]),
  },
  agents: [],
};

function descendantProcesses() {
  const table = spawnSync("ps", ["-axo", "pid=,ppid=,rss=,command="], { encoding: "utf8" }).stdout.split("\n");
  const rows = table.flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return match
      ? [{ pid: Number(match[1]), ppid: Number(match[2]), rssKb: Number(match[3]), command: match[4] ?? "" }]
      : [];
  });
  const mine = new Set([process.pid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (mine.has(row.ppid) && !mine.has(row.pid)) {
        mine.add(row.pid);
        grew = true;
      }
    }
  }
  return rows.filter((row) => mine.has(row.pid) && row.pid !== process.pid);
}

function rolloutFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? rolloutFiles(path) : entry.name.startsWith("rollout-") ? [path] : [];
  });
}

function toolNamespaces(rollout: string) {
  const found: Record<string, number> = {};
  for (const line of readFileSync(rollout, "utf8").split("\n").filter(Boolean)) {
    const payload = JSON.parse(line).payload;
    if (payload?.type !== "additional_tools") continue;
    for (const namespace of payload.tools ?? []) found[namespace.name] = (namespace.tools ?? []).length;
  }
  return found;
}

function rolloutMessages(rollout: string) {
  const lines = readFileSync(rollout, "utf8").split("\n").filter(Boolean);
  const found: Array<{ index: number; role: string; chars: number; head: string; skills: boolean }> = [];
  for (const [index, line] of lines.entries()) {
    const item = JSON.parse(line);
    const payload = item.payload;
    if (item.type !== "response_item" || payload?.type !== "message") continue;
    const text = (payload.content ?? []).map((part: { text?: string }) => part.text ?? "").join("");
    found.push({
      index,
      role: payload.role,
      chars: text.length,
      head: text.slice(0, 100),
      skills: text.includes("<skills_instructions>"),
    });
  }
  return found;
}

const database = new OpenBotDatabase(userData);
const store = new AgentStore(userData, homedir(), database, undefined, join(root, "OpenBot"));
const mailbox = new MailboxStore(userData, store.sharedRoot, store.database);
const agents = new AgentService({
  store,
  mailbox,
  browser: inertBrowserHost,
  preferredProvider: "codex",
  offProviders: AGENT_PROVIDERS.filter((provider) => provider !== "codex"),
  computerUseMcpServer: () =>
    cuaDaemon && {
      id: COMPUTER_USE_MCP_SERVER_ID,
      name: COMPUTER_USE_MCP_SERVER_NAME,
      transport: "stdio",
      enabled: true,
      command: String(options["cua-driver"]),
      args: ["mcp", "--socket", cuaSocket],
      env: [
        { key: "CUA_DRIVER_EMBEDDED", value: "1" },
        { key: "CUA_DRIVER_RS_TELEMETRY_ENABLED", value: "0" },
        { key: "CUA_DRIVER_RS_UPDATE_CHECK", value: "0" },
      ],
      envPassthrough: ["HOME", "USER", "TMPDIR"],
      workingDirectory: "",
      url: "",
      headers: [],
    },
});
const sqlite = new DatabaseSync(database.path);

function requestsOf(agentId: string): Request[] {
  const turnOrder = new Map<string, number>();
  return sqlite
    .prepare("SELECT turn_id, tokens_json FROM agent_usage_records WHERE agent_id = ? ORDER BY occurred_at, rowid")
    .all(agentId)
    .map((row) => {
      const turnId = String(row.turn_id);
      if (!turnOrder.has(turnId)) turnOrder.set(turnId, turnOrder.size + 1);
      const tokens = JSON.parse(String(row.tokens_json));
      return {
        turn: turnOrder.get(turnId) ?? 0,
        uncachedInput: tokens.uncachedInput ?? 0,
        cachedInput: tokens.cachedInput ?? 0,
        cacheCreation: tokens.cacheCreation ?? 0,
        output: tokens.output ?? 0,
      };
    });
}

const idle = (agentId: string) =>
  agents
    .listQueue(agentId)
    .deliveries.every((delivery) => !["queued", "starting", "running"].includes(delivery.status));

async function turnEnded(agentId: string, turn: number) {
  await waitFor(
    `turn ${turn} of ${agentId}`,
    () => requestsOf(agentId).some((request) => request.turn === turn) && idle(agentId),
    TURN_DEADLINE_MS,
  );
}

try {
  await runCauseEffect(agents.initialize());
  for (let index = 0; index < AGENT_COUNT; index++) {
    if (index > 0 && GAP_MS > 0) await new Promise((done) => setTimeout(done, GAP_MS));
    const name = index === 0 ? "Probe" : `Probe ${index + 1}`;
    const agent = await runCauseEffect(
      agents.createAgent(
        {
          name,
          description: "Measures the first request.",
          avatarSeed: `probe-${index}`,
          avatarHue: null,
          initialMessage: String(options.message),
        },
        options["computer-use"] === "default"
          ? undefined
          : (created) => agents.updateAgent({ agentId: created.id, computerUse: options["computer-use"] === "on" }),
      ),
    );
    report.model ??= agent.model;
    report.agents.push({ name, agentId: agent.id, startedAt: new Date().toISOString(), requests: [] });
  }
  for (const entry of report.agents) await turnEnded(entry.agentId, 1);
  for (let turn = 2; turn <= TURN_COUNT; turn++) {
    if (Number(options["add-skill-before-turn"]) === turn) {
      mkdirSync(join(codexHome, "skills", "probe-skill"), { recursive: true });
      writeFileSync(
        join(codexHome, "skills", "probe-skill", "SKILL.md"),
        "---\nname: probe-skill\ndescription: A skill that the probe adds between two turns.\n---\nNothing.\n",
      );
    }
    for (const entry of report.agents) {
      await runCauseEffect(
        agents.sendMessage({
          agentId: entry.agentId,
          text: `${options.message} again (${turn})`,
          attachmentDraftIds: [],
        }),
      );
      await turnEnded(entry.agentId, turn);
    }
  }

  const live = descendantProcesses();
  const byCommand: Record<string, { count: number; rssKb: number }> = {};
  for (const row of live) {
    const key = row.command.split(" ").slice(0, 2).join(" ").replace(homedir(), "~").slice(0, 100);
    const slot = byCommand[key] ?? { count: 0, rssKb: 0 };
    byCommand[key] = { count: slot.count + 1, rssKb: slot.rssKb + row.rssKb };
  }
  const appServers = live.filter((row) => /codex\b.*\bapp-server\b/.test(row.command));
  report.processes = {
    codexAppServers: appServers.length,
    codexRss: appServers.reduce((sum, row) => sum + row.rssKb, 0),
    byCommand,
  };

  const files = rolloutFiles(join(codexHome, "sessions"));
  for (const entry of report.agents) {
    entry.requests = requestsOf(entry.agentId);
    const owned = sqlite
      .prepare(
        "SELECT DISTINCT s.external_session_id AS id FROM agent_usage_records r JOIN projection_provider_sessions s ON s.id = r.session_id WHERE r.agent_id = ?",
      )
      .get(entry.agentId);
    entry.externalSessionId = owned ? String(owned.id) : undefined;
    const rollout = files.find((file) => entry.externalSessionId && file.includes(entry.externalSessionId));
    if (!rollout) continue;
    entry.rollout = rollout;
    const messages = rolloutMessages(rollout);
    entry.messages = messages.map(({ index, role, chars, head }) => ({ index, role, chars, head }));
    entry.developerMessages = messages
      .filter((message) => message.role === "developer")
      .map(({ index, chars, skills }) => ({ index, chars, skills }));
    entry.toolNamespaces = toolNamespaces(rollout);
    if (options["no-breakdown"] || entry !== report.agents[0]) continue;
    const result = spawnSync(
      "uv",
      ["run", "--quiet", "--with", "tiktoken", "python3", "-I", resolve(import.meta.dirname, "breakdown.py"), rollout],
      { encoding: "utf8" },
    );
    if (result.status === 0) entry.breakdown = result.stdout;
    else entry.breakdownError = result.stderr.split("\n").slice(-6).join("\n");
  }
  const first = (turn: number) =>
    report.agents.flatMap((entry) => {
      const request = entry.requests.find((candidate) => candidate.turn === turn);
      return request ? [{ agent: entry.name, uncached: request.uncachedInput, cached: request.cachedInput }] : [];
    });
  report.firstRequests = first(1);
  if (TURN_COUNT >= 2) report.turnTwoFirstRequests = first(2);
  report.passed = report.firstRequests.length === AGENT_COUNT;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.exitCode = 1;
} finally {
  await runCauseEffect(agents.stop()).catch(() => {});
  cuaDaemon?.kill();
  sqlite.close();
  database.close();
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `${report.label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  if (!options.keep) await rm(root, { recursive: true, force: true });
  process.stdout.write(`${report.passed ? "PASS" : "FAIL"} ${file}\n`);
  process.stdout.write(`first requests: ${JSON.stringify(report.firstRequests)}\n`);
  if (report.error) process.stdout.write(`${report.error}\n`);
}
