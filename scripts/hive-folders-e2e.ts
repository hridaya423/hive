// `bun scripts/hive-folders-e2e.ts`. Writes .openbot-build/hive-folders-e2e/report.json.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AgentStore } from "../src/backend/agent-store";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { providerRuntimeRoot } from "../src/main/provider-runtime-manager";

const OUT = resolve(import.meta.dirname, "../.openbot-build/hive-folders-e2e");
const root = await mkdtemp(join(tmpdir(), "hive-folders-"));
const home = join(root, "home");
const appData = join(root, "appData");
const userData = join(appData, "Hive");
const report: { checks: string[]; passed: boolean; error?: string } = { checks: [], passed: false };

try {
  await mkdir(userData, { recursive: true });
  const store = new AgentStore(userData, home);
  await runCauseEffect(store.initialize());
  assert.ok(existsSync(join(home, "Hive", "Agents")), "The agents folder is not under ~/Hive.");
  assert.ok(!existsSync(join(home, "OpenBot")), "The store created ~/OpenBot, the folder of upstream OpenBot.");
  report.checks.push("agent store uses ~/Hive");

  assert.equal(providerRuntimeRoot({ appData, userDataOverride: "" }), join(appData, "Hive", "provider-runtimes"));
  report.checks.push("provider runtimes use appData/Hive");
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
}
process.stdout.write(`${report.passed ? "PASS" : "FAIL"} ${join(OUT, "report.json")} ${report.error ?? ""}\n`);
process.exitCode = report.passed ? 0 : 1;
