import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { chmod, cp, lstat, mkdir, mkdtemp, readdir, readlink, rm, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { APP_FOLDER_NAME } from "@openbot/contracts/app-url-scheme";
import type { InstanceTransferResult } from "@openbot/contracts/ipc";
import { Effect } from "effect";
import { AgentService } from "../src/backend/agent-service";
import { AgentStore } from "../src/backend/agent-store";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { SidebarLayoutStore } from "../src/backend/sidebar-layout-store";
import { InstanceTransferService } from "../src/main/instance-transfer-service";
import { inertBrowserHost, unused } from "./agent-service-support";

const HELP = `Usage: bun scripts/import-openbot-setup.ts [options]

  --agents "A,B"          Agents to carry, by name. Default: all agents.
  --target-user-data DIR  Hive user data folder to import into. Needed unless --dry-run or --export-only.
  --target-home DIR       Home folder of the target. Agent files go to DIR/${APP_FOLDER_NAME}/Agents. Default: this home.
  --paused NAME           Routines of this agent stay paused. Repeat or use a comma list.
  --run-once ROUTINE      Set "run once when missed" on the routines with this name. Repeat or use a comma list.
  --dry-run               Only list what would move. Writes nothing but the report.
  --export-only           Write the archive and stop. Needs --archive-out.
  --archive-out FILE      Keep the archive here.
  --archive-in FILE       Import this archive. No snapshot, no export.
  --skip-settings         Do not carry MCP servers and sidebar sections.
  --source-user-data DIR  Default: ~/Library/Application Support/OpenBot (read only).
  --source-root DIR       Default: ~/OpenBot (read only).
  --keep-snapshot         Keep the temp snapshot folder.
  --report FILE           Default: .openbot-build/import-openbot-setup/report.json
`;

const SIDEBAR_FILE = "openbot-sidebar-layout-v1.json";

const { values: options } = parseArgs({
  options: {
    agents: { type: "string" },
    "target-user-data": { type: "string" },
    "target-home": { type: "string" },
    paused: { type: "string", multiple: true },
    "run-once": { type: "string", multiple: true },
    "dry-run": { type: "boolean" },
    "export-only": { type: "boolean" },
    "archive-out": { type: "string" },
    "archive-in": { type: "string" },
    "skip-settings": { type: "boolean" },
    "source-user-data": { type: "string" },
    "source-root": { type: "string" },
    "keep-snapshot": { type: "boolean" },
    report: { type: "string" },
    help: { type: "boolean" },
  },
});

if (options.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const names = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value : [value ?? ""])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
const wanted = names(options.agents);
const paused = names(options.paused).map((name) => name.toLowerCase());
const runOnce = names(options["run-once"]).map((name) => name.toLowerCase());
const sourceUserData = resolve(options["source-user-data"] ?? join(homedir(), "Library/Application Support/OpenBot"));
const sourceRoot = resolve(options["source-root"] ?? join(homedir(), "OpenBot"));
const archiveIn = options["archive-in"] ? resolve(options["archive-in"]) : null;
const archiveOut = options["archive-out"] ? resolve(options["archive-out"]) : null;
const targetUserData = options["target-user-data"] ? resolve(options["target-user-data"]) : null;
const targetHome = resolve(options["target-home"] ?? homedir());
const reportPath = resolve(
  options.report ?? join(import.meta.dirname, "../.openbot-build/import-openbot-setup/report.json"),
);
const dryRun = options["dry-run"] === true;
const exportOnly = options["export-only"] === true;

function usage(message: string): never {
  process.stderr.write(`${message}\n\n${HELP}`);
  process.exit(2);
}

if (archiveIn && dryRun) usage("--dry-run reads the source profile. It does not take --archive-in.");
if (archiveIn && exportOnly) usage("--export-only and --archive-in exclude each other.");
if (exportOnly && !archiveOut) usage("--export-only needs --archive-out.");
if (!dryRun && !exportOnly && !targetUserData) usage("--target-user-data is required.");
function canonical(path: string): string {
  let existing = resolve(path);
  const rest: string[] = [];
  while (!existsSync(existing)) {
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(realpathSync(existing), ...rest).toLowerCase();
}
const inside = (path: string, parent: string) => {
  const [child, root] = [canonical(path), canonical(parent)];
  return child === root || child.startsWith(`${root}/`);
};
const writes = [targetUserData && join(targetHome, APP_FOLDER_NAME), targetUserData, archiveOut, reportPath].filter(
  (path): path is string => path !== null && path !== undefined,
);
if (writes.some((path) => inside(path, sourceUserData) || inside(path, sourceRoot)))
  usage("An output path is inside the source. This tool never writes to the source.");

interface RoutineReport {
  name: string;
  active: boolean;
  timezone: string;
  schedule: unknown;
  missedPolicy: string | undefined;
  nextRunAt: string | null;
}

interface AgentReport {
  id: string;
  name: string;
  provider: string;
  model: string;
  reasoningEffort: string;
  providerAccountId: string | null;
  access: string | null;
  computerUse: boolean | null;
  workspacePath: string;
  files: number;
  bytes: number;
  skills: number;
  memories: number;
  routines: RoutineReport[];
}

interface Profile {
  userData: string;
  database: OpenBotDatabase;
  store: AgentStore;
  agents: AgentService;
  transfer: InstanceTransferService;
  sidebar: SidebarLayoutStore;
}

const noSkills = {
  list: () => Effect.succeed([]),
  create: unused,
  revise: unused,
  withdraw: unused,
};

async function openProfile(
  userData: string,
  home: string,
  openbotRoot = join(home, APP_FOLDER_NAME),
): Promise<Profile> {
  const database = new OpenBotDatabase(userData);
  const store = new AgentStore(userData, home, database, undefined, openbotRoot);
  const mailbox = new MailboxStore(userData, store.sharedRoot, database);
  const sidebar = new SidebarLayoutStore(join(userData, SIDEBAR_FILE));
  await runCauseEffect(sidebar.initialize());
  await runCauseEffect(store.initialize());
  await runCauseEffect(mailbox.initialize());
  const agents = new AgentService({ store, mailbox, browser: inertBrowserHost, sidebarLayout: sidebar });
  const unsupported = (what: string) => Effect.fail(new Error(`${what} do not move with this tool.`));
  const transfer = new InstanceTransferService({
    agents,
    skills: { library: () => noSkills, installLocal: unused },
    sharedRoot: store.sharedRoot,
    appVersion: "import-openbot-setup",
    uploadDirectory: join(userData, "instance-transfer-uploads"),
    settings: {
      mcpServers: () => agents.listMcpServers(),
      saveMcpServer: (config) => agents.saveMcpServer({ config }),
      customProviders: () => [],
      saveCustomProvider: () => unsupported("Custom providers"),
      customAgents: () => Effect.succeed([]),
      providersOff: () => [],
      sidebar: () => sidebar.getSnapshot(),
      mutateSidebar: (action) => sidebar.mutate(action, agents.sidebarChatIds()),
      routineFlowLinks: () => Effect.succeed([]),
      connectRoutineFlow: () => unsupported("Routine flows"),
      signedInProviders: () => [],
    },
  });
  return { userData, database, store, agents, transfer, sidebar };
}

async function closeProfile(profile: Profile): Promise<void> {
  await runCauseEffect(profile.agents.stop()).catch(() => undefined);
  profile.database.close();
}

function uri(path: string, mode: string): string {
  return `file:${path.replaceAll("%", "%25").replaceAll(" ", "%20").replaceAll("?", "%3f").replaceAll("#", "%23")}?${mode}`;
}

function backupDatabase(source: string, destination: string): string {
  const wal = `${source}-wal`;
  const liveWriter = existsSync(wal) && statSync(wal).size > 0;
  const modes = liveWriter ? ["mode=ro"] : ["mode=ro", "immutable=1"];
  const failures: string[] = [];
  for (const mode of modes) {
    const run = spawnSync("sqlite3", [uri(source, mode), `.backup "${destination}"`], { encoding: "utf8" });
    if (run.status === 0 && existsSync(destination)) return mode;
    failures.push(`${mode}: ${run.stderr.trim() || run.error?.message || `exit ${run.status}`}`);
    rmSync(destination, { force: true });
  }
  throw new Error(`The online backup failed (${failures.join("; ")}).`);
}

interface Snapshot {
  directory: string;
  userData: string;
  root: string;
  backupMode: string;
  links: Array<{ agent: string; path: string; target: string }>;
}

async function removeLinks(
  workspace: string,
  directory: string,
  agent: string,
  links: Snapshot["links"],
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      links.push({ agent, path: relative(workspace, path), target: await readlink(path) });
      await unlink(path);
    } else if (entry.isDirectory()) {
      await removeLinks(workspace, path, agent, links);
    }
  }
}

async function snapshot(): Promise<Snapshot> {
  const directory = await mkdtemp(join(tmpdir(), "import-openbot-snapshot-"));
  await chmod(directory, 0o700);
  const userData = join(directory, "user-data");
  const root = join(directory, "root");
  await mkdir(userData, { recursive: true });
  await mkdir(join(root, "Agents"), { recursive: true });
  const source = join(sourceUserData, "openbot.db");
  if (!existsSync(source)) throw new Error(`No database at ${source}.`);
  const backupMode = backupDatabase(source, join(userData, "openbot.db"));
  const check = new Database(join(userData, "openbot.db"));
  const integrity = check.query<{ integrity_check: string }, []>("pragma integrity_check").get();
  check.close();
  if (integrity?.integrity_check !== "ok")
    throw new Error(`The snapshot failed integrity_check: ${integrity?.integrity_check}.`);

  for (const name of [SIDEBAR_FILE]) {
    if (existsSync(join(sourceUserData, name))) await cp(join(sourceUserData, name), join(userData, name));
  }
  if (existsSync(join(sourceUserData, "avatars")))
    await cp(join(sourceUserData, "avatars"), join(userData, "avatars"), { recursive: true, verbatimSymlinks: true });
  if (existsSync(join(sourceRoot, "Shared")))
    await cp(join(sourceRoot, "Shared"), join(root, "Shared"), {
      recursive: true,
      verbatimSymlinks: true,
      filter: (path) => !/\/Shared\/Data(\/|$)/u.test(path),
    });

  const db = new Database(join(userData, "openbot.db"));
  const links: Snapshot["links"] = [];
  const rows = db
    .query<{ id: string; path: string }, []>(
      "select json_extract(agent_json,'$.id') as id, json_extract(agent_json,'$.workspacePath') as path from projection_agents",
    )
    .all();
  for (const { id, path } of rows) {
    const copy = join(root, "Agents", id);
    if (existsSync(path)) {
      await cp(path, copy, { recursive: true, verbatimSymlinks: true });
      await removeLinks(copy, copy, id, links);
    } else {
      await mkdir(copy, { recursive: true });
    }
    db.query(
      "update projection_agents set agent_json = json_set(agent_json,'$.workspacePath', ?1) where json_extract(agent_json,'$.id') = ?2",
    ).run(copy, id);
  }
  db.close();
  return { directory, userData, root, backupMode, links };
}

interface AgentFacts {
  providerAccountId: string | null;
  access: string | null;
  computerUse: boolean | null;
}

interface ChannelConnection {
  connection_id: string;
  platform: string;
  workspace_name: string;
  enabled: number;
}

interface SourceFacts {
  agentFacts: Map<string, AgentFacts>;
  channelConnections: ChannelConnection[];
  routineFlowLinks: number;
  workflowNodes: number;
}

function readFacts(path: string): SourceFacts {
  const db = new Database(path);
  const agentFacts = new Map<string, AgentFacts>();
  const rows = db
    .query<{ id: string; account: string | null; access: string | null; computerUse: number | null }, []>(
      "select json_extract(agent_json,'$.id') as id, json_extract(agent_json,'$.providerAccountId') as account, json_extract(agent_json,'$.access') as access, json_extract(agent_json,'$.computerUse') as computerUse from projection_agents",
    )
    .all();
  for (const row of rows)
    agentFacts.set(row.id, {
      providerAccountId: row.account,
      access: row.access,
      computerUse: row.computerUse === null ? null : Boolean(row.computerUse),
    });
  const count = (table: string) => db.query<{ n: number }, []>(`select count(*) as n from ${table}`).get()?.n ?? 0;
  const facts: SourceFacts = {
    agentFacts,
    channelConnections: db
      .query<ChannelConnection, []>(
        "select connection_id, platform, workspace_name, enabled from projection_messaging_connections",
      )
      .all(),
    routineFlowLinks: count("routine_flow_links"),
    workflowNodes: count("workflow_nodes"),
  };
  db.close();
  return facts;
}

async function describeAgents(profile: Profile, facts: Map<string, AgentFacts>): Promise<AgentReport[]> {
  const summary = await Effect.runPromise(profile.transfer.summary());
  return profile.agents.listAgents().map((agent) => {
    const counts = summary.agents.find((entry) => entry.id === agent.id);
    const fact = facts.get(agent.id);
    return {
      id: agent.id,
      name: agent.name,
      provider: agent.provider,
      model: agent.model,
      reasoningEffort: agent.reasoningEffort,
      providerAccountId: fact?.providerAccountId ?? null,
      access: fact?.access ?? null,
      computerUse: fact?.computerUse ?? null,
      workspacePath: agent.workspacePath,
      files: counts?.fileCount ?? 0,
      bytes: counts?.fileBytes ?? 0,
      skills: counts?.skillCount ?? 0,
      memories: counts?.memoryCount ?? 0,
      routines: profile.agents.listRoutines(agent.id).map((routine) => ({
        name: routine.name,
        active: routine.active,
        timezone: routine.timezone,
        schedule: routine.trigger.schedule,
        missedPolicy: routine.missedPolicy,
        nextRunAt: routine.trigger.nextRunAt ?? null,
      })),
    };
  });
}

function pick(all: AgentReport[], requested: string[]): AgentReport[] {
  if (requested.length === 0) return all;
  return requested.map((name) => {
    const found = all.find((agent) => agent.name.toLowerCase() === name.toLowerCase());
    if (!found) throw new Error(`No agent named "${name}". Available: ${all.map((agent) => agent.name).join(", ")}.`);
    return found;
  });
}

function withoutCredentials(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

function holdsDatabase(userData: string): boolean {
  const path = join(userData, "openbot.db");
  if (!existsSync(path)) return false;
  const run = spawnSync("lsof", ["-t", path, `${path}-wal`], { encoding: "utf8" });
  return run.stdout.trim().length > 0;
}

function describeError(error: unknown): string {
  const parts: string[] = [];
  for (
    let current = error;
    current !== undefined && parts.length < 5;
    current = current instanceof Error ? current.cause : undefined
  )
    parts.push(current instanceof Error ? `${current.name}: ${current.message}` : String(current));
  return parts.join(" <- ");
}

interface Report {
  startedAt: string;
  finishedAt?: string;
  status?: "ok" | "failed";
  error?: string;
  snapshot?: unknown;
  snapshotDirectory?: string;
  source?: unknown;
  doesNotMove?: unknown;
  export?: unknown;
  target?: unknown;
}

const report: Report = { startedAt: new Date().toISOString() };

async function writeReport(): Promise<void> {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function printAgents(title: string, agents: AgentReport[]): void {
  process.stdout.write(`\n${title}\n`);
  for (const agent of agents) {
    process.stdout.write(
      `- ${agent.name}: ${agent.provider}/${agent.model} (${agent.reasoningEffort}), account ${agent.providerAccountId ?? "default"}, ` +
        `${agent.files} files / ${agent.bytes} bytes, ${agent.memories} memories, ${agent.skills} skills\n`,
    );
    for (const routine of agent.routines)
      process.stdout.write(
        `    routine "${routine.name}" ${routine.active ? "active" : "paused"} ${JSON.stringify(routine.schedule)} ${routine.timezone}\n`,
      );
  }
}

async function runSource(archive: string): Promise<void> {
  const snap = await snapshot();
  report.snapshot = { backupMode: snap.backupMode, linksNotCarried: snap.links };
  try {
    const facts = readFacts(join(snap.userData, "openbot.db"));
    const accountsFile = join(sourceUserData, "openbot-provider-accounts-v1.json");
    const profile = await openProfile(snap.userData, snap.directory, snap.root);
    try {
      const all = await describeAgents(profile, facts.agentFacts);
      const selected = pick(all, wanted);
      printAgents("Upstream agents", all);
      const withSkills = selected.filter((agent) => agent.skills > 0);
      if (withSkills.length > 0)
        throw new Error(
          `Installed skills do not move with this tool. ${withSkills.map((agent) => agent.name).join(", ")} have some.`,
        );
      const mcpServers = profile.agents.listMcpServers().map((server) => ({
        name: server.name,
        transport: server.transport,
        enabled: server.enabled,
        url: withoutCredentials(server.url),
        command: server.command,
        envNames: server.env.map(({ key }) => key),
        headerNames: server.headers.map(({ key }) => key),
      }));
      report.source = { agents: all, selected: selected.map((agent) => agent.name), mcpServers };
      report.doesNotMove = doesNotMove(all, selected, facts, accountsFile, mcpServers, snap.links);
      process.stdout.write(
        `\nMCP servers: ${mcpServers.map((server) => `${server.name} (${server.enabled ? "on" : "off"})`).join(", ") || "none"}\n`,
      );
      if (dryRun) return;

      const exported = await Effect.runPromise(
        profile.transfer.exportTo(archive, {
          agentIds: selected.map((agent) => agent.id),
          includeFiles: true,
          includeSettings: options["skip-settings"] !== true,
        }),
      );
      await chmod(archive, 0o600);
      report.export = { archive, warnings: exported.warnings };
      process.stdout.write(`\nArchive: ${archive}\n`);
    } finally {
      await closeProfile(profile);
    }
  } finally {
    if (options["keep-snapshot"]) report.snapshotDirectory = snap.directory;
    else await rm(snap.directory, { recursive: true, force: true });
  }
}

function doesNotMove(
  all: AgentReport[],
  selected: AgentReport[],
  facts: SourceFacts,
  accountsFile: string,
  mcpServers: Array<{ name: string; envNames: string[]; headerNames: string[] }>,
  links: Snapshot["links"],
) {
  const accounts = existsSync(accountsFile) ? JSON.parse(readFileSync(accountsFile, "utf8")) : null;
  return {
    providerSignIns: {
      note: "Sign in each provider again in Hive. Account ids are new in Hive.",
      upstreamAccounts: accounts?.accounts ?? [],
      agentsOnAccount: selected.map((agent) => ({
        agent: agent.name,
        provider: agent.provider,
        providerAccountId: agent.providerAccountId,
        nonDefaultAccount: agent.providerAccountId !== null,
      })),
    },
    agentAccessAndComputerUse: selected.map((agent) => ({
      agent: agent.name,
      access: agent.access,
      computerUse: agent.computerUse,
    })),
    mcp: {
      note: "Imported MCP servers start off, with empty values. Turn each on and sign in again.",
      oauthTokensFile: existsSync(join(sourceUserData, "openbot-mcp-oauth-v1.json")),
      servers: mcpServers,
    },
    secrets: "No secret travels: provider keys, MCP values and headers, connector tokens stay upstream.",
    channelConnections: facts.channelConnections,
    routineFlowLinks: facts.routineFlowLinks,
    workflowNodes: facts.workflowNodes,
    chatHistory: "Conversations, threads and usage records do not move.",
    linksNotCarried: links.map((link) => ({
      ...link,
      agent: all.find((agent) => agent.id === link.agent)?.name ?? link.agent,
    })),
    unselectedAgents: all.filter((agent) => !selected.includes(agent)).map((agent) => agent.name),
  };
}

async function runTarget(archive: string): Promise<void> {
  if (!targetUserData) throw new Error("--target-user-data is required.");
  if (holdsDatabase(targetUserData))
    throw new Error(`A process has ${join(targetUserData, "openbot.db")} open. Quit Hive first.`);
  await mkdir(targetUserData, { recursive: true });
  const profile = await openProfile(targetUserData, targetHome);
  try {
    const before = profile.agents.listAgents().map((agent) => agent.name.toLowerCase());
    const preview = await Effect.runPromise(profile.transfer.stage(archive));
    const available = preview.agents.map((agent) => agent.name);
    const requested = wanted.length > 0 ? wanted : available;
    const keys = requested.map((name) => {
      const found = preview.agents.find((agent) => agent.name.toLowerCase() === name.toLowerCase());
      if (!found) throw new Error(`The archive has no agent named "${name}". It has: ${available.join(", ")}.`);
      return found;
    });
    const unknownPaused = paused.filter((name) => !keys.some((agent) => agent.name.toLowerCase() === name));
    if (unknownPaused.length > 0) throw new Error(`--paused names no selected agent: ${unknownPaused.join(", ")}.`);
    const already = keys.filter((agent) => before.includes(agent.name.toLowerCase())).map((agent) => agent.name);
    const fresh = keys.filter((agent) => !already.includes(agent.name));
    let result: InstanceTransferResult = { agents: [], skipped: [], signIn: [], warnings: [] };
    if (fresh.length > 0)
      result = await Effect.runPromise(
        profile.transfer.apply({
          token: preview.token,
          keys: fresh.map((agent) => agent.key),
          includeSettings: options["skip-settings"] !== true,
        }),
      );
    else await Effect.runPromise(profile.transfer.discard(preview.token));
    for (const agent of result.agents) {
      for (const routine of profile.agents.listRoutines(agent.id)) {
        const pause = paused.includes(agent.name.toLowerCase()) && routine.active;
        const once = runOnce.includes(routine.name.toLowerCase()) && routine.missedPolicy !== "run-once";
        if (pause || once)
          profile.agents.updateRoutine({
            agentId: agent.id,
            routineId: routine.id,
            ...(pause ? { active: false } : {}),
            ...(once ? { missedPolicy: "run-once" as const } : {}),
          });
      }
    }
    const imported = await describeAgents(profile, readFacts(join(targetUserData, "openbot.db")).agentFacts);
    printAgents(`Hive agents in ${targetUserData}`, imported);
    report.target = {
      userData: targetUserData,
      home: targetHome,
      requested,
      alreadyThere: already,
      imported: result.agents.map((agent) => agent.name),
      skipped: result.skipped,
      signIn: result.signIn,
      warnings: result.warnings,
      agents: imported,
    };
    process.stdout.write(`\nImported: ${result.agents.map((agent) => agent.name).join(", ") || "none"}\n`);
    if (already.length > 0) process.stdout.write(`Already in Hive, left alone: ${already.join(", ")}\n`);
    for (const skipped of result.skipped) process.stdout.write(`Skipped ${skipped.name}: ${skipped.reason}\n`);
    for (const warning of result.warnings) process.stdout.write(`Warning: ${warning}\n`);
  } finally {
    await closeProfile(profile);
    const database = new Database(join(targetUserData, "openbot.db"));
    database.run("pragma wal_checkpoint(truncate)");
    database.close();
  }
}

try {
  if (archiveIn) {
    if (!existsSync(archiveIn) || !(await lstat(archiveIn)).isFile()) throw new Error(`No archive at ${archiveIn}.`);
    await runTarget(archiveIn);
  } else {
    const scratch = archiveOut ? null : await mkdtemp(join(tmpdir(), "import-openbot-archive-"));
    const archive = archiveOut ?? join(scratch ?? "", "openbot-setup.zip");
    try {
      await runSource(archive);
      if (!dryRun && !exportOnly) await runTarget(archive);
    } finally {
      if (scratch) await rm(scratch, { recursive: true, force: true });
    }
  }
  report.finishedAt = new Date().toISOString();
  report.status = "ok";
  await writeReport();
  process.stdout.write(`\nReport: ${reportPath}\n`);
  process.exit(0);
} catch (error) {
  report.status = "failed";
  report.error = describeError(error);
  await writeReport();
  process.stderr.write(`\nFailed: ${report.error}\n`);
  process.exit(1);
}
