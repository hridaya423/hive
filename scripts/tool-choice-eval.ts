// Tool choice eval. Starts the real backend `AgentService` on a temporary profile with the real Codex
// CLI, sends each prompt to a fresh agent, and reads from the Codex rollout which tool the agent calls first.
// First tool: the first `function_call` of the rollout that is not discovery (`tool_search`, `tool_describe`)
// and not in the `skip` list of the prompt (a read that a correct agent makes before its action).
// A `tool_call` counts as the tool named in its `name` argument. A turn ends as soon as its first tool
// is known. The temporary profile and workspace take any effect that lands before the interrupt.
// A prompt passes when its first tool is in `expect`; `prefix.*` accepts every tool of a namespace.
// `bun scripts/tool-choice-eval.ts [--runs N] [--ids 1,2] [--label NAME] [--computer-use on]`
// Writes .openbot-build/tool-choice-eval/<label>-<time>.json. It never reads or writes Application Support.
// The Codex home is a copy of ~/.codex (config, AGENTS.md, rules, skills, auth.json); ~/.codex stays unchanged.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { AGENT_PROVIDERS } from "@openbot/contracts/ipc";
import { inertBrowserHost, waitFor } from "./agent-service-support";

interface EvalPrompt {
  id: number;
  family: string;
  prompt: string;
  expect: string[];
  skip?: string[];
}

const BROWSER = ["openbot_browser.*"];
const PROMPTS: EvalPrompt[] = [
  {
    id: 1,
    family: "routines",
    prompt: "Remind me every morning at 9 to review my calendar.",
    expect: ["openbot.create_routine"],
    skip: ["openbot.list_routines"],
  },
  {
    id: 2,
    family: "routines",
    prompt:
      "Create a webhook routine named invoice-events. It accepts every event type with no filters, and each time it runs it summarizes the request body. Do not ask me anything else.",
    expect: ["openbot.create_webhook_routine"],
  },
  {
    id: 3,
    family: "routines",
    prompt: "Which routines do I have set up right now?",
    expect: ["openbot.list_routines"],
  },
  {
    id: 4,
    family: "routines",
    prompt: "The deploy is running. Wait until it finishes, then tell me whether it worked.",
    expect: ["openbot.await_event"],
  },
  {
    id: 5,
    family: "agents",
    prompt: "Which teammates do I have, and what is each one good at?",
    expect: ["openbot.list_agents"],
  },
  {
    id: 6,
    family: "agents",
    prompt:
      "Create a new agent named Scout, title Research Scout, description: finds research papers. Its first task: list three recent papers on diffusion models. Use the default settings and do not ask me anything else.",
    expect: ["openbot.create_agent"],
    skip: ["openbot.list_agents"],
  },
  {
    id: 7,
    family: "agents",
    prompt: "Add a new sidebar section called Science for my agents.",
    expect: ["openbot.create_section"],
    skip: ["openbot.list_sections"],
  },
  {
    id: 8,
    family: "agents",
    prompt: "Change your own title to Chief of Staff and your description to: keeps my week in order.",
    expect: ["openbot.update_profile"],
    skip: ["openbot.read_agent"],
  },
  {
    id: 9,
    family: "memory",
    prompt: "Remember that I prefer metric units and a 24-hour clock.",
    expect: ["openbot.remember"],
  },
  {
    id: 10,
    family: "memory",
    prompt: "What do you know about my dietary preferences?",
    expect: ["openbot.search_memories"],
  },
  { id: 11, family: "memory", prompt: "Forget the memory with the id mem-1234.", expect: ["openbot.forget_memory"] },
  {
    id: 12,
    family: "tables",
    prompt: "Which tables do I have in the shared database?",
    expect: ["openbot.list_tables"],
  },
  {
    id: 13,
    family: "tables",
    prompt: "Run this read-only query on the shared database: SELECT count(*) FROM expenses",
    expect: ["openbot.query_data"],
  },
  {
    id: 14,
    family: "tables",
    prompt: "Run this statement on the shared database: CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)",
    expect: ["openbot.execute_data"],
    skip: ["openbot.list_tables"],
  },
  {
    id: 15,
    family: "browser",
    prompt: "Check my Gmail inbox and tell me if anything is unread.",
    expect: BROWSER,
    skip: ["openbot.list_agents"],
  },
  {
    id: 16,
    family: "browser",
    prompt: "Find the cheapest flight from Berlin to Lisbon next Friday on Google Flights.",
    expect: BROWSER,
    skip: ["openbot.list_agents"],
  },
  {
    id: 17,
    family: "capture",
    prompt: "Capture display 1 of this computer and show me the image.",
    expect: ["openbot.capture_screen"],
    skip: ["openbot.list_capture_sources", "openbot.list_agents"],
  },
  {
    id: 18,
    family: "ask",
    prompt: "Should the new project use Postgres or SQLite? I want to pick. Ask me, with those two options.",
    expect: ["openbot.ask_user"],
  },
  {
    id: 19,
    family: "ask",
    prompt:
      "Before you email the letter to Ann, show me a confirm card with a Send button and a Cancel button, and wait for my click.",
    expect: ["openbot.ask_ui"],
  },
  {
    id: 20,
    family: "keys",
    prompt: "I want you to call the OpenAI API for me. I have the API key. How do I give it to you?",
    expect: ["openbot.request_api_key"],
    skip: ["openbot.list_api_keys"],
  },
  { id: 21, family: "keys", prompt: "Which API keys have I stored for you?", expect: ["openbot.list_api_keys"] },
  {
    id: 22,
    family: "history",
    prompt: "Earlier in this conversation we picked a name for the project. What was it?",
    expect: ["openbot.history_search"],
  },
  {
    id: 23,
    family: "channels",
    prompt: "Which channels exist, and who is in them?",
    expect: ["openbot.list_channels"],
  },
  {
    id: 24,
    family: "channels",
    prompt: "Post this to the launch channel: the beta ships on Monday.",
    expect: ["openbot.send_to_channel", "openbot.list_channels"],
  },
  { id: 25, family: "sites", prompt: "Which sites have I published?", expect: ["openbot.list_sites"] },
  {
    id: 26,
    family: "files",
    prompt: "Attach the file /etc/hosts to your reply.",
    expect: ["openbot.attach_files_to_response"],
  },
  {
    id: 27,
    family: "mcp",
    prompt: "Add the MCP server at https://example.com/mcp under the name Example.",
    expect: ["openbot.save_mcp_server"],
    skip: ["openbot.list_mcp_servers"],
  },
  {
    id: 28,
    family: "mcp",
    prompt: "I want to connect Notion so that you can read my pages. Is there an app for that?",
    expect: ["openbot.suggest_marketplace_app"],
  },
  {
    id: 29,
    family: "files",
    prompt: "Render this HTML as a page for me: <h1>Hello</h1><p>It works.</p>",
    expect: ["openbot.html_render", "openbot.html_preview"],
  },
  {
    id: 30,
    family: "chat",
    prompt: "This chat has grown long. Start a new chat with a clean context.",
    expect: ["openbot.start_new_chat"],
  },
];

const DISCOVERY = new Set(["openbot.tool_search", "openbot.tool_describe"]);
const TURN_DEADLINE_MS = 120_000;
const SETTLE_DEADLINE_MS = 30_000;

const { values: options } = parseArgs({
  options: {
    runs: { type: "string", default: "3" },
    ids: { type: "string" },
    label: { type: "string", default: "run" },
    "computer-use": { type: "string", default: "off" },
    keep: { type: "boolean", default: false },
  },
});
const RUNS = Number(options.runs);
const selected = options.ids ? new Set(options.ids.split(",").map(Number)) : null;
const prompts = PROMPTS.filter((entry) => !selected || selected.has(entry.id));
const OUT = resolve(import.meta.dirname, "../.openbot-build/tool-choice-eval");
const REAL_CODEX_HOME = join(homedir(), ".codex");
const root = await mkdtemp(join(homedir(), ".hive-tool-eval-"));
const userData = join(root, "user-data");
const codexHome = join(root, "codex-home");
mkdirSync(userData, { recursive: true });
mkdirSync(codexHome, { recursive: true });
for (const entry of ["config.toml", "AGENTS.md", "auth.json", "rules", "skills"]) {
  const source = join(REAL_CODEX_HOME, entry);
  if (existsSync(source)) cpSync(source, join(codexHome, entry), { recursive: true });
}
process.env.CODEX_HOME = codexHome;

const { AgentService } = await import("../src/backend/agent-service");
const { AgentStore } = await import("../src/backend/agent-store");
const { runCauseEffect } = await import("../src/backend/effect-boundary");
const { MailboxStore } = await import("../src/backend/mailbox-store");
const { OpenBotDatabase } = await import("../src/backend/openbot-database");

interface RunResult {
  run: number;
  firstTool: string | null;
  passed: boolean;
  calls: string[];
  endedBy: "first-tool" | "turn-end" | "deadline";
  seconds: number;
  error?: string;
}
interface PromptResult {
  id: number;
  family: string;
  prompt: string;
  expect: string[];
  runs: RunResult[];
  passes: number;
  majorityPassed: boolean;
}
const report: {
  passed: boolean;
  label: string;
  runsPerPrompt: number;
  codexVersion: string;
  model?: string;
  prompts: PromptResult[];
  runsPassed: number;
  runsTotal: number;
  passRate: number;
  majorityPassed: number;
  error?: string;
} = {
  passed: false,
  label: String(options.label),
  runsPerPrompt: RUNS,
  codexVersion: "0.166.0",
  prompts: [],
  runsPassed: 0,
  runsTotal: 0,
  passRate: 0,
  majorityPassed: 0,
};

function rolloutFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? rolloutFiles(path) : entry.name.startsWith("rollout-") ? [path] : [];
  });
}

/** The tools that the agent called, in order. A `tool_call` is named by the tool that it calls. */
function toolCalls(rollout: string): string[] {
  const found: string[] = [];
  for (const line of readFileSync(rollout, "utf8").split("\n").filter(Boolean)) {
    let item: { type?: string; payload?: { type?: string; name?: string; namespace?: string; arguments?: string } };
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = item.payload;
    if (item.type !== "response_item" || payload?.type !== "function_call" || !payload.name) continue;
    const name = payload.namespace ? `${payload.namespace}.${payload.name}` : payload.name;
    if (name !== "openbot.tool_call") {
      found.push(name);
      continue;
    }
    let target: unknown;
    try {
      target = JSON.parse(payload.arguments ?? "{}").name;
    } catch {
      target = undefined;
    }
    found.push(typeof target === "string" ? target : name);
  }
  return found;
}

const firstTool = (calls: string[], skip: string[] = []) =>
  calls.find((name) => !DISCOVERY.has(name) && !skip.includes(name)) ?? null;
const accepts = (expect: string[], tool: string | null) =>
  tool !== null &&
  expect.some((entry) => (entry.endsWith(".*") ? tool.startsWith(entry.slice(0, -1)) : tool === entry));

const database = new OpenBotDatabase(userData);
const store = new AgentStore(userData, homedir(), database, undefined, join(root, "OpenBot"));
const mailbox = new MailboxStore(userData, store.sharedRoot, store.database);
const agents = new AgentService({
  store,
  mailbox,
  browser: inertBrowserHost,
  preferredProvider: "codex",
  offProviders: AGENT_PROVIDERS.filter((provider) => provider !== "codex"),
  computerUseMcpServer: () => null,
});
const sqlite = new DatabaseSync(database.path);

const idle = (agentId: string) =>
  agents
    .listQueue(agentId)
    .deliveries.every((delivery) => !["queued", "starting", "running"].includes(delivery.status));

function rolloutOf(agentId: string): string | undefined {
  const owned = sqlite
    .prepare(
      "SELECT s.external_session_id AS id FROM projection_provider_sessions s JOIN projection_threads t ON t.thread_id = s.thread_id WHERE t.agent_id = ? ORDER BY s.rowid DESC",
    )
    .get(agentId);
  const id = owned ? String(owned.id) : undefined;
  return id ? rolloutFiles(join(codexHome, "sessions")).find((file) => file.includes(id)) : undefined;
}

function activeTurnOf(agentId: string): string | null {
  const row = sqlite.prepare("SELECT active_turn_id AS id FROM projection_threads WHERE agent_id = ?").get(agentId);
  return row?.id ? String(row.id) : null;
}

async function runPrompt(entry: EvalPrompt, run: number): Promise<RunResult> {
  const started = Date.now();
  const agent = await runCauseEffect(
    agents.createAgent(
      {
        name: `Eval ${entry.id}.${run}`,
        description: "Answers one eval prompt.",
        avatarSeed: `eval-${entry.id}-${run}`,
        avatarHue: null,
        initialMessage: entry.prompt,
      },
      options["computer-use"] === "on"
        ? undefined
        : (created) => agents.updateAgent({ agentId: created.id, computerUse: false }),
    ),
  );
  report.model ??= agent.model;
  let calls: string[] = [];
  let endedBy: RunResult["endedBy"] = "deadline";
  let turnStarted = false;
  const deadline = started + TURN_DEADLINE_MS;
  while (Date.now() < deadline) {
    const rollout = rolloutOf(agent.id);
    if (rollout) calls = toolCalls(rollout);
    if (firstTool(calls, entry.skip)) {
      endedBy = "first-tool";
      break;
    }
    const active = activeTurnOf(agent.id);
    if (active) turnStarted = true;
    if (turnStarted && !active && idle(agent.id)) {
      endedBy = "turn-end";
      break;
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  const turnId = activeTurnOf(agent.id);
  if (turnId) await runCauseEffect(agents.interrupt(agent.id, turnId)).catch(() => {});
  await waitFor(`${agent.name} to settle`, () => idle(agent.id), SETTLE_DEADLINE_MS).catch(() => {});
  const rollout = rolloutOf(agent.id);
  if (rollout) calls = toolCalls(rollout);
  await runCauseEffect(agents.deleteAgent(agent.id)).catch(() => {});
  const tool = firstTool(calls, entry.skip);
  return {
    run,
    firstTool: tool,
    passed: accepts(entry.expect, tool),
    calls,
    endedBy,
    seconds: Math.round((Date.now() - started) / 100) / 10,
  };
}

try {
  await runCauseEffect(agents.initialize());
  for (const entry of prompts) {
    const result: PromptResult = { ...entry, runs: [], passes: 0, majorityPassed: false };
    for (let run = 1; run <= RUNS; run++) {
      const outcome = await runPrompt(entry, run).catch(
        (error): RunResult => ({
          run,
          firstTool: null,
          passed: false,
          calls: [],
          endedBy: "deadline",
          seconds: 0,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      result.runs.push(outcome);
      process.stdout.write(
        `${outcome.passed ? "ok  " : "FAIL"} #${entry.id}.${run} ${outcome.firstTool ?? "none"} (want ${entry.expect.join("|")})\n`,
      );
    }
    result.passes = result.runs.filter((outcome) => outcome.passed).length;
    result.majorityPassed = result.passes * 2 > RUNS;
    report.prompts.push(result);
  }
  report.runsTotal = report.prompts.reduce((sum, entry) => sum + entry.runs.length, 0);
  report.runsPassed = report.prompts.reduce((sum, entry) => sum + entry.passes, 0);
  report.passRate = report.runsTotal === 0 ? 0 : Math.round((report.runsPassed / report.runsTotal) * 1000) / 1000;
  report.majorityPassed = report.prompts.filter((entry) => entry.majorityPassed).length;
  report.passed =
    report.runsTotal > 0 && report.prompts.every((entry) => entry.runs.every((outcome) => !outcome.error));
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.exitCode = 1;
} finally {
  await runCauseEffect(agents.stop()).catch(() => {});
  sqlite.close();
  database.close();
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `${report.label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  if (!options.keep) await rm(root, { recursive: true, force: true });
  else process.stdout.write(`kept ${root}\n`);
  process.stdout.write(
    `${report.passed ? "DONE" : "FAIL"} ${file}\nruns ${report.runsPassed}/${report.runsTotal} (${report.passRate}); prompts by majority ${report.majorityPassed}/${report.prompts.length}\n`,
  );
  if (report.error) process.stdout.write(`${report.error}\n`);
}
