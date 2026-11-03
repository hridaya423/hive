// `bun scripts/copilot-static-context-e2e.ts`. Writes .openbot-build/copilot-static-context-e2e/report.json.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sourceText } from "@openbot/i18n/source";
import type { AgentClient } from "../src/backend/agent-client";
import { NO_PROVIDER_CREDENTIALS, requireProviderDriver } from "../src/backend/provider-drivers";
import { installFakeAgent, readJsonl, runTurn, startThread, stopClients } from "./provider-fakes/host";

const OUT = resolve(import.meta.dirname, "../.openbot-build/copilot-static-context-e2e");
const root = await mkdtemp(join(tmpdir(), "openbot-copilot-static-context-e2e-"));
const report: { checks: string[]; passed: boolean; error?: string } = { checks: [], passed: false };
const savedHome = process.env.COPILOT_HOME;
const clients: AgentClient[] = [];

try {
  const home = join(root, "copilot-home");
  await mkdir(home, { recursive: true });
  await writeFile(
    join(home, "mcp-config.json"),
    JSON.stringify({ mcpServers: { cua: { command: "cua" }, "user tools": { url: "https://example.com/mcp" } } }),
  );
  process.env.COPILOT_HOME = home;
  const log = join(root, "copilot.jsonl");
  const modeFile = join(root, "mode");
  await writeFile(modeFile, "ok");
  const executable = join(root, "bin", "copilot");
  await installFakeAgent(executable, "conformance", { FAKE_COPILOT: "1", FAKE_LOG: log, FAKE_MODE_FILE: modeFile });

  const client = requireProviderDriver("copilot").createClient(
    { executable, version: "1.0.105", source: "system" },
    20_000,
    NO_PROVIDER_CREDENTIALS,
  );
  clients.push(client);
  client.start();
  const thread = await startThread(client, { cwd: join(root, "workspace"), model: "fake-alpha" });

  const starts = (await readJsonl<{ event: string; argv?: string[] }>(log)).filter(
    (entry) => entry.event === "start" && entry.argv?.[0] === "--acp",
  );
  assert.equal(starts.length, 1, "Copilot did not start once in ACP mode.");
  assert.deepEqual(
    starts[0]?.argv,
    ["--acp", "--disable-builtin-mcps", "--disable-mcp-server", "cua", "--disable-mcp-server", "user tools"],
    "Copilot started with MCP servers that OpenBot did not give the agent.",
  );
  report.checks.push("Copilot starts with only OpenBot's MCP servers");

  const answered = await runTurn(client, thread, { model: "fake-alpha" });
  assert.equal(answered.status, "completed", "A turn before the limit did not complete.");
  report.checks.push("a normal turn completes");

  await writeFile(modeFile, "static-context");
  const refused = await runTurn(client, thread, { model: "fake-alpha" });
  assert.equal(refused.status, "failed", "Copilot's no-room answer ended the turn as a success.");
  assert.equal(
    refused.error,
    sourceText("error.provider.copilotStaticContext"),
    "The turn did not give OpenBot's message.",
  );
  assert.doesNotMatch(
    refused.reply,
    /Static system messages|No response was returned/u,
    "Copilot's warning became the reply.",
  );
  report.checks.push("Copilot's no-room answer fails the turn with OpenBot's message");

  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await stopClients(clients);
  if (savedHome === undefined) delete process.env.COPILOT_HOME;
  else process.env.COPILOT_HOME = savedHome;
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
}
process.stdout.write(`${report.passed ? "PASS" : "FAIL"} ${join(OUT, "report.json")} ${report.error ?? ""}\n`);
process.exitCode = report.passed ? 0 : 1;
