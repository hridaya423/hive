import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  developmentChildEnvironment,
  developmentSettingsForService,
  loadDevelopmentEnvironment,
} from "./development-environment";
import { resolvePackageBin } from "./package-bin";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function main(): Promise<void> {
  const [mode, ...extra] = process.argv.slice(2).filter((argument) => argument !== "--");
  if (mode !== "api" && mode !== "remote") {
    throw new Error("Choose api or remote.");
  }
  const environment = await loadDevelopmentEnvironment(projectRoot);
  let executable = process.execPath;
  let args: string[];
  let cwd = projectRoot;
  if (mode === "api") {
    executable = resolvePackageBin(projectRoot, "vite");
    args = ["dev", ...extra];
    cwd = join(projectRoot, "apps/auth-api");
  } else {
    args = ["run", "--cwd", join(projectRoot, "remote/api"), "dev", ...extra];
  }
  const child = spawn(executable, args, {
    cwd,
    env: developmentChildEnvironment({ ...developmentSettingsForService(environment, mode), ...process.env }, mode),
    stdio: "inherit",
  });
  const terminate = () => child.kill("SIGTERM");
  process.once("SIGINT", terminate);
  process.once("SIGTERM", terminate);
  child.once("error", () => {
    process.stderr.write("Could not start the development command. Check the installed dependencies.\n");
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.removeListener("SIGINT", terminate);
    process.removeListener("SIGTERM", terminate);
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Development command setup failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
