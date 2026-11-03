// `bun scripts/managed-skill-retire-e2e.ts`. Writes .openbot-build/managed-skill-retire-e2e/report.json.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import {
  MANAGED_SKILL_FOLDERS,
  MANAGED_SKILL_SLUGS,
  OWNERSHIP_MARKER,
  retireManagedSkills,
} from "../src/main/managed-skill-service";

const OUT = resolve(import.meta.dirname, "../.openbot-build/managed-skill-retire-e2e");
const RETIRED = "openbot-site-hosting";
const root = await mkdtemp(join(tmpdir(), "managed-skill-retire-"));
const report: { checks: string[]; passed: boolean; error?: string } = { checks: [], passed: false };

async function writeSkill(workspace: string, folder: string, slug: string, owned: boolean): Promise<string> {
  const directory = join(workspace, folder, slug);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), `---\nname: ${slug}\ndescription: A fixture.\n---\n`);
  if (owned) {
    await writeFile(
      join(directory, OWNERSHIP_MARKER),
      `${JSON.stringify({ managedBy: "openbot", slug, version: 1 })}\n`,
    );
  }
  return directory;
}

try {
  assert.ok(!MANAGED_SKILL_SLUGS.has(RETIRED), "The retired skill is still a managed skill slug.");
  report.checks.push("the retired slug is not a managed skill slug");

  const owned = join(root, "owned");
  const unowned = join(root, "unowned");
  const clean = join(root, "clean");
  const retiredFolders: string[] = [];
  for (const folder of MANAGED_SKILL_FOLDERS) retiredFolders.push(await writeSkill(owned, folder, RETIRED, true));
  const kept = await writeSkill(owned, MANAGED_SKILL_FOLDERS[0], "openbot-data", true);
  const userCopy = await writeSkill(unowned, MANAGED_SKILL_FOLDERS[0], RETIRED, false);
  await mkdir(clean, { recursive: true });

  await Effect.runPromise(
    retireManagedSkills([{ workspacePath: owned }, { workspacePath: unowned }, { workspacePath: clean }]),
  );
  for (const folder of retiredFolders) assert.ok(!existsSync(folder), `The retired skill folder stays: ${folder}`);
  report.checks.push("owned retired folders are removed from every skill folder");
  assert.ok(existsSync(join(kept, "SKILL.md")), "A current managed skill was removed.");
  report.checks.push("a current managed skill stays");
  assert.match(await readFile(join(userCopy, "SKILL.md"), "utf8"), /A fixture/u);
  report.checks.push("a folder with no ownership marker stays");

  await Effect.runPromise(retireManagedSkills([{ workspacePath: owned }, { workspacePath: join(root, "missing") }]));
  report.checks.push("a second run and a missing workspace do not fail");
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
