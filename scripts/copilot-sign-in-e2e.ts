// Runs the real `ProviderRuntime` and the real Copilot driver over the conformance fake, which acts as
// Copilot CLI 1.0.105 (`provider-fakes/agents/conformance.ts`, `FAKE_COPILOT=1`). Checks what the
// Copilot row says in each situation the CLI can be in, and that no error toast comes from a start
// that the user did not ask for:
// - a signed-in account with no Copilot plan (GitHub's 403) is its own row: signed in, no plan, never
//   "sign-in required", with the page that turns the plan on, and a failover cause that skips Copilot;
// - the row re-checks, and ends when the plan appears;
// - a signed-out CLI is "sign-in required"; the browser sign-in (`login --web-flow`) and the code
//   sign-in (`login --device-code`) end signed in; a cancel ends the CLI and keeps the row signed out;
//   a sign-in that ends with an account with no plan is the no-plan row.
// `bun scripts/copilot-sign-in-e2e.ts`. Writes .openbot-build/copilot-sign-in-e2e/report.json.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { agentProviderDescriptor } from "@openbot/contracts/agent-providers";
import type { AgentProviderStatus } from "@openbot/contracts/ipc";
import { classifyFailure } from "@openbot/user-errors/failure-cause";
import { Effect } from "effect";
import { ConversationRuntime } from "../src/backend/agent/conversation-runtime";
import { isFailoverFailure } from "../src/backend/agent/provider-diagnostics";
import { ProviderRuntime } from "../src/backend/agent/provider-runtime";
import { AgentStore } from "../src/backend/agent-store";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { BUILT_IN_PROVIDER_DRIVERS, NO_PROVIDER_CREDENTIALS } from "../src/backend/provider-drivers";
import { installFakeAgent } from "./provider-fakes/host";

const OUT = resolve(import.meta.dirname, "../.openbot-build/copilot-sign-in-e2e");
const LOGIN = "hridaya423";
const NO_PLAN_REFUSAL = '403 "unauthorized: not authorized to use this Copilot feature\\n"';

const root = await mkdtemp(join(tmpdir(), "openbot-copilot-sign-in-e2e-"));
const modeFile = join(root, "mode");
const changes = new EventEmitter();
const errors: { code: string; message: string }[] = [];
const results: { name: string; passed: boolean }[] = [];
const savedEnvironment = {
  OPENBOT_COPILOT_PATH: process.env.OPENBOT_COPILOT_PATH,
  COPILOT_HOME: process.env.COPILOT_HOME,
};
const database = new OpenBotDatabase(join(root, "profile"));
const agents = new AgentStore(join(root, "profile"), join(root, "home"), database);
let runtime: ProviderRuntime | undefined;

async function setMode(mode: "ok" | "signed-out" | "no-plan"): Promise<void> {
  await writeFile(modeFile, mode);
}

async function installCli(env: Readonly<Record<string, string>> = {}): Promise<void> {
  const executable = join(root, "bin", "copilot");
  await installFakeAgent(executable, "conformance", {
    FAKE_COPILOT: "1",
    FAKE_MODE_FILE: modeFile,
    FAKE_LOG: join(root, "copilot.jsonl"),
    ...env,
  });
  process.env.OPENBOT_COPILOT_PATH = executable;
}

function createRuntime(): ProviderRuntime {
  return new ProviderRuntime({
    offProviders: BUILT_IN_PROVIDER_DRIVERS.map((driver) => driver.id).filter((id) => id !== "copilot"),
    conversation: new ConversationRuntime(
      agents,
      () => undefined,
      () => agents.list(),
    ),
    hooks: {
      bindClient: () => undefined,
      onProvidersReady: () => Effect.void,
      onProviderLost: () => undefined,
      onClientStopped: () => Effect.void,
      isStopping: () => false,
      isProviderBusy: () => false,
      isAgentBusy: () => false,
      isProviderAssigned: () => false,
      onAgentClientLost: () => Effect.void,
      sharedRoot: () => join(root, "shared"),
      onProviderResumed: () => undefined,
      onProviderActivated: () => Effect.void,
      captureConfigRevision: () => 0,
    },
    emit: () => {
      changes.emit("status");
    },
    emitError: (code, error) => {
      errors.push({ code, message: error instanceof Error ? error.message : String(error) });
    },
    requestTimeoutMs: 10_000,
    preferredProvider: "copilot",
    clientFactory: null,
    bundledExecutables: {},
    credentials: NO_PROVIDER_CREDENTIALS,
    redactMcp: (text) => text,
  });
}

function row(): AgentProviderStatus {
  const status = runtime?.status().providers?.find((candidate) => candidate.id === "copilot");
  assert.ok(status, "The status has a Copilot row.");
  return status;
}

function waitForRow(match: (status: AgentProviderStatus) => boolean, what: string, timeoutMs = 15_000) {
  return new Promise<AgentProviderStatus>((resolveRow, reject) => {
    const check = () => {
      const status = runtime?.status().providers?.find((candidate) => candidate.id === "copilot");
      if (!status || !match(status)) return;
      clearTimeout(timer);
      changes.off("status", check);
      resolveRow(status);
    };
    const timer = setTimeout(() => {
      changes.off("status", check);
      reject(new Error(`The Copilot row did not reach: ${what}. It is ${JSON.stringify(row())}`));
    }, timeoutMs);
    changes.on("status", check);
    check();
  });
}

async function startFresh(): Promise<void> {
  if (runtime) await stop(runtime);
  errors.length = 0;
  runtime = createRuntime();
  await runCauseEffect(runtime.start());
}

async function stop(target: ProviderRuntime): Promise<void> {
  const clients = await runCauseEffect(target.dispose());
  for (const client of clients) await runCauseEffect(client.stop());
}

const openPage = async () => undefined;
const noPlan = (status: AgentProviderStatus) => status.state === "error" && status.planRequired === true;
const signedOut = (status: AgentProviderStatus) => status.state === "sign-in-required";
const connected = (status: AgentProviderStatus) => status.state === "available";
const pass = (name: string) => results.push({ name, passed: true });

let passed = false;
try {
  await mkdir(join(root, "copilot-home"), { recursive: true });
  await writeFile(
    join(root, "copilot-home", "config.json"),
    JSON.stringify({ lastLoggedInUser: { host: "https://github.com", login: LOGIN } }),
  );
  process.env.COPILOT_HOME = join(root, "copilot-home");

  await setMode("no-plan");
  await installCli();
  await startFresh();
  const refused = await waitForRow(noPlan, "no plan");
  assert.ok(refused.message?.includes(LOGIN), `The no-plan row names the account: ${refused.message}`);
  assert.doesNotMatch(refused.message ?? "", /sign in with github/iu, "The no-plan row does not ask for a sign-in.");
  assert.equal(
    agentProviderDescriptor("copilot").planGuideLink,
    "copilot-plan",
    "The no-plan row links to the Copilot page in GitHub settings.",
  );
  assert.deepEqual(errors, [], "A start that no agent uses and the user did not ask for shows no error.");
  const cause = classifyFailure(new Error(refused.message ?? ""));
  assert.equal(cause, "billing", "The no-plan message is a billing cause, so a failover chain skips Copilot.");
  assert.equal(
    classifyFailure(new Error(NO_PLAN_REFUSAL)),
    "billing",
    "GitHub's own 403 text is a billing cause as well.",
  );
  assert.equal(isFailoverFailure(new Error(NO_PLAN_REFUSAL)), true, "A turn that GitHub refuses fails over.");
  pass("a signed-in account with no plan is its own row, shows no toast, and fails over");

  await setMode("ok");
  await runCauseEffect(runtime?.refreshProvider("copilot") ?? Effect.void);
  await waitForRow(connected, "connected");
  assert.equal(row().planRequired, undefined, "A connected row has no plan flag.");
  pass("a re-check ends the no-plan row when the plan appears");

  await setMode("signed-out");
  await installCli({ FAKE_LOGIN_MODE: "ok", FAKE_LOGIN_DELAY_MS: "300" });
  await startFresh();
  await waitForRow(signedOut, "sign-in required");
  assert.deepEqual(errors, [], "A signed-out CLI shows no error at start.");
  await runCauseEffect(runtime?.connectProvider("copilot", openPage) ?? Effect.void);
  await waitForRow(connected, "connected after the browser sign-in");
  pass("the browser sign-in (login --web-flow) ends signed in");

  await setMode("signed-out");
  await installCli({ FAKE_LOGIN_MODE: "ok", FAKE_LOGIN_DELAY_MS: "300" });
  await startFresh();
  await waitForRow(signedOut, "sign-in required before the code sign-in");
  const prompt = await runCauseEffect(runtime?.startProviderCodeLogin("copilot") ?? Effect.die("no runtime"));
  assert.equal(prompt.kind, "code");
  assert.equal(prompt.userCode, "ABCD-1234", "The code sign-in reads the device code from the CLI.");
  assert.equal(prompt.verificationUrl, "https://github.com/login/device", "The code sign-in reads its page.");
  await waitForRow(connected, "connected after the code sign-in");
  pass("the code sign-in (login --device-code) shows the code and ends signed in");

  await setMode("signed-out");
  await installCli({ FAKE_LOGIN_MODE: "ok", FAKE_LOGIN_DELAY_MS: "60000" });
  await startFresh();
  await waitForRow(signedOut, "sign-in required before the cancel");
  await runCauseEffect(runtime?.connectProvider("copilot", openPage) ?? Effect.void);
  await waitForRow((status) => status.connectionState === "connecting", "connecting");
  await runCauseEffect(runtime?.cancelProviderSignIn("copilot") ?? Effect.void);
  const cancelled = await waitForRow((status) => status.connectionState === undefined, "not connecting");
  assert.equal(cancelled.state, "sign-in-required", "A cancelled sign-in leaves the row signed out.");
  pass("a cancelled sign-in keeps the row signed out");

  await setMode("signed-out");
  await installCli({ FAKE_LOGIN_MODE: "no-plan", FAKE_LOGIN_DELAY_MS: "300" });
  await startFresh();
  await waitForRow(signedOut, "sign-in required before a sign-in with no plan");
  await runCauseEffect(runtime?.connectProvider("copilot", openPage) ?? Effect.void);
  const ended = await waitForRow(noPlan, "no plan after the sign-in");
  assert.ok(ended.message?.includes(LOGIN), "The row names the account that signed in.");
  pass("a sign-in that ends with no plan is the no-plan row");
  passed = true;
} finally {
  if (runtime) await stop(runtime);
  for (const [name, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "report.json"), `${JSON.stringify({ passed, results, errors }, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
  database.close();
  process.stdout.write(`${JSON.stringify({ passed, results }, null, 2)}\n`);
}
process.exit(passed ? 0 : 1);
