import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AgentService } from "../src/backend/agent-service";
import { AgentStore } from "../src/backend/agent-store";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { SidebarLayoutStore } from "../src/backend/sidebar-layout-store";
import { inertBrowserHost } from "./agent-service-support";

const OUT = resolve(import.meta.dirname, "../.openbot-build/import-openbot-setup-e2e");
const root = await mkdtemp(join(tmpdir(), "import-openbot-e2e-"));
const sourceUserData = join(root, "source-user-data");
const sourceRoot = join(root, "source-root");
const targetHome = join(root, "target-home");
const targetUserData = join(targetHome, "Library/Application Support/Hive");
const outside = join(root, "outside-instructions.md");
const steps: Array<{ name: string; detail: unknown }> = [];

function note(name: string, detail: unknown): void {
  steps.push({ name, detail });
  process.stdout.write(`- ${name}\n`);
}

function fingerprint(directory: string): string {
  const hash = createHash("sha256");
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name);
      if (entry.name.endsWith("-shm")) continue;
      if (entry.isDirectory()) visit(child);
      else if (entry.isSymbolicLink()) hash.update(`${child}->link`);
      else hash.update(`${child}:${readFileSync(child).toString("hex")}`);
    }
  };
  visit(directory);
  return hash.digest("hex");
}

async function buildSource(): Promise<void> {
  const database = new OpenBotDatabase(sourceUserData);
  const store = new AgentStore(sourceUserData, root, database, undefined, sourceRoot);
  const mailbox = new MailboxStore(sourceUserData, store.sharedRoot, database);
  const sidebar = new SidebarLayoutStore(join(sourceUserData, "openbot-sidebar-layout-v1.json"));
  await runCauseEffect(sidebar.initialize());
  await runCauseEffect(store.initialize());
  await runCauseEffect(mailbox.initialize());
  const agents = new AgentService({ store, mailbox, browser: inertBrowserHost, sidebarLayout: sidebar });
  const created = new Map<string, string>();
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    const agent = await runCauseEffect(
      agents.createAgentProfile({
        name,
        description: `${name} job.`,
        avatarSeed: `e2e:avatar:0:${name.length}`,
        avatarHue: null,
      }),
    );
    created.set(name, agent.id);
    await writeFile(join(agent.workspacePath, "notes.md"), `Notes of ${name}.\n`);
    agents.createRoutine({
      agentId: agent.id,
      name: `${name} routine`,
      instruction: `Run ${name}.`,
      active: true,
      timezone: "Europe/London",
      schedule: { kind: "daily", time: "07:30" },
      missedPolicy: "skip",
    });
  }
  const alpha = created.get("Alpha") ?? "";
  agents.createMemory({ agentId: alpha, text: "Alpha remembers the court number." });
  await writeFile(outside, "Linked instructions.\n");
  const workspace = agents.listAgents().find((agent) => agent.id === alpha)?.workspacePath ?? "";
  await symlink(outside, join(workspace, "AGENTS.md"));
  await runCauseEffect(agents.stop());
  database.close();
}

function runTool(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync("bun", [join(import.meta.dirname, "import-openbot-setup.ts"), ...args], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function targetRows<T>(sql: string): T[] {
  const database = new Database(join(targetUserData, "openbot.db"));
  try {
    return database.query<T, []>(sql).all();
  } finally {
    database.close();
  }
}

await mkdir(OUT, { recursive: true });
try {
  await buildSource();
  const before = fingerprint(sourceUserData) + fingerprint(sourceRoot);
  const sourceArgs = ["--source-user-data", sourceUserData, "--source-root", sourceRoot];
  const reportFile = join(OUT, "tool-report.json");
  const common = [...sourceArgs, "--report", reportFile];

  const dry = runTool([...common, "--dry-run"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(!existsSync(targetUserData), "A dry run wrote the target.");
  assert.match(dry.stdout, /Alpha: codex\//u);
  note("dry run lists the agents and writes no target", { stdout: dry.stdout.split("\n").slice(0, 8) });

  const importArgs = [
    ...common,
    "--agents",
    "Alpha,Bravo,Charlie",
    "--paused",
    "Charlie",
    "--run-once",
    "Bravo routine",
    "--target-home",
    targetHome,
    "--target-user-data",
    targetUserData,
  ];
  const imported = runTool(importArgs);
  assert.equal(imported.status, 0, imported.stderr + imported.stdout);
  const agents = targetRows<{ id: string; name: string; workspace: string }>(
    "select json_extract(agent_json,'$.id') as id, json_extract(agent_json,'$.name') as name, json_extract(agent_json,'$.workspacePath') as workspace from projection_agents order by name",
  );
  assert.deepEqual(
    agents.map((agent) => agent.name),
    ["Alpha", "Bravo", "Charlie"],
  );
  const routines = targetRows<{ name: string; active: number; missed_policy: string }>(
    "select name, active, missed_policy from projection_agent_routines order by name",
  );
  assert.deepEqual(routines, [
    { name: "Alpha routine", active: 1, missed_policy: "skip" },
    { name: "Bravo routine", active: 1, missed_policy: "run-once" },
    { name: "Charlie routine", active: 0, missed_policy: "skip" },
  ]);
  note("agents, routines, pause and run-once arrived", { agents: agents.map((agent) => agent.name), routines });

  const memories = targetRows<{ text: string }>("select text from projection_agent_memories");
  assert.deepEqual(memories, [{ text: "Alpha remembers the court number." }]);
  const alpha = agents.find((agent) => agent.name === "Alpha");
  assert.ok(alpha);
  assert.ok(alpha.workspace.startsWith(join(targetHome, "Hive", "Agents")), alpha.workspace);
  assert.equal(readFileSync(join(alpha.workspace, "notes.md"), "utf8"), "Notes of Alpha.\n");
  assert.ok(!existsSync(join(alpha.workspace, "AGENTS.md")), "A link was carried.");
  for (const agent of agents) assert.ok(!lstatSync(agent.workspace).isSymbolicLink());
  note("memories and workspace files arrived inside the Hive folder, links were left out", { memories });

  const unarmed = targetRows<{ runs: number; deliveries: number }>(
    "select (select count(*) from projection_routine_runs) as runs, (select count(*) from projection_deliveries) as deliveries",
  );
  assert.deepEqual(unarmed, [{ runs: 0, deliveries: 0 }]);
  note("no routine ran and nothing is queued", unarmed);

  const toolReport = JSON.parse(readFileSync(reportFile, "utf8"));
  assert.equal(toolReport.status, "ok");
  assert.ok(
    toolReport.snapshot.linksNotCarried.some((link: { path: string }) => link.path.endsWith("AGENTS.md")),
    "The report lacks the link that was left out.",
  );
  assert.deepEqual(toolReport.doesNotMove.unselectedAgents, ["Delta"]);

  const again = runTool(importArgs);
  assert.equal(again.status, 0, again.stderr);
  const second = JSON.parse(readFileSync(reportFile, "utf8"));
  assert.deepEqual([...second.target.alreadyThere].sort(), ["Alpha", "Bravo", "Charlie"]);
  assert.equal(targetRows("select 1 from projection_agents").length, 3);
  note("a second run adds nothing", { alreadyThere: second.target.alreadyThere });

  const refused = runTool([...common, "--target-user-data", sourceUserData]);
  assert.equal(refused.status, 2);
  note("a target equal to the source is refused", { stderr: refused.stderr.split("\n")[0] });

  assert.equal(fingerprint(sourceUserData) + fingerprint(sourceRoot), before, "The source changed.");
  note("the source profile is byte for byte unchanged", { fingerprint: before });
  await writeFile(join(OUT, "report.json"), `${JSON.stringify({ passed: true, steps }, null, 2)}\n`);
  process.stdout.write(`PASS ${join(OUT, "report.json")}\n`);
} catch (error) {
  await writeFile(
    join(OUT, "report.json"),
    `${JSON.stringify({ passed: false, error: error instanceof Error ? error.message : String(error), steps }, null, 2)}\n`,
  );
  throw error;
} finally {
  await rm(root, { recursive: true, force: true });
}
