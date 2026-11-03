// The ACP agent of `provider-conformance-e2e.ts`. It acts as each ACP provider does in the cases that
// every provider must pass, and differs only where the real CLIs differ:
// - `FAKE_MISSING` names the error that `session/load` and `session/resume` give for a session that
//   the agent does not have (`gone-…`). Each form is the one that the provider's flavor recognizes.
//   `hermes` acts as Hermes Agent 0.21.5: it advertises `session/resume`, which makes a new session for
//   a missing one, and `session/load` of a missing session answers null. Each session it opens has `modes`.
//   It lists its provider as an auth method only when it is signed in, and its stderr is a Python log.
// - `FAKE_SIGNED_OUT=1` refuses each new session, as an agent does before its sign-in. Hermes refuses
//   it with "Internal error", and writes the cause only to stderr.
// - `FAKE_MODEL_SET=kimi` gives no configuration options. `session/set_model` changes the model and
//   then fails, as Kimi CLI 1.52.0 does when its config.toml is protected.
// - `FAKE_MODEL_UNAPPLIED=1` acts as Copilot CLI 1.0.105 does in pingdotgg/t3code#29425: a new session
//   reports the first model as current, but runs on no listed model until the client sets one.
// - `FAKE_DEVICE_CODE=1` answers `login --device-code` with the text of Copilot CLI 1.0.105, as a CLI
//   that waits for the sign-in, and starts no agent.
// - `FAKE_COPILOT=1` makes the executable the Copilot CLI 1.0.105 for the runtime: `--version`, and
//   `login --web-flow` and `login --device-code`, which end with `FAKE_LOGIN_MODE` after
//   `FAKE_LOGIN_DELAY_MS`. `FAKE_MODE_FILE` names a file that holds what each new session does now:
//   `ok`, `signed-out` (`-32000 "Authentication required"`), or `no-plan` (the 403 that GitHub gives an
//   account with no Copilot plan: `-32603` with `data.category: "permission_denied"`, `data.status: 403`),
//   or `broken` (`-32603 "Internal error"`, a start that fails for no reason the user can act on).
// A prompt with the text `wait` runs until the client cancels it. Each other prompt answers at once.
import { readFileSync, writeFileSync } from "node:fs";
import {
  type AcpError,
  type AcpParams,
  type AcpPeer,
  type AcpRequest,
  logEntry,
  serveFakeAcpAgent,
} from "../acp-agent";

const MODELS = [
  { modelId: "fake-alpha", name: "Fake Alpha" },
  { modelId: "fake-beta", name: "Fake Beta" },
];

const MISSING_ERRORS: Readonly<Partial<Record<string, (sessionId: string) => AcpError>>> = {
  // The protocol's own error, which Grok, Cline and custom agents give.
  protocol: (sessionId) => ({ code: -32002, message: "Resource not found", data: { uri: sessionId } }),
  // OpenCode 2.x.
  opencode: (sessionId) => ({
    code: -32602,
    message: `Invalid params: session not found: ${sessionId}`,
    data: { sessionId },
  }),
  // Antigravity 1.3.0, on a load or a resume.
  antigravity: (sessionId) => ({ code: -32002, message: "Resource not found", data: { sessionId } }),
  // Kimi CLI 1.52.0.
  kimi: () => ({ code: -32602, message: "Invalid params", data: { session_id: "Session not found" } }),
  // Cursor.
  cursor: (sessionId) => ({
    code: -32602,
    message: "Invalid params",
    data: { message: `Session "${sessionId}" not found` },
  }),
};

const hermes = process.env.FAKE_MISSING === "hermes";
/** What Hermes 0.21.5 lists: its provider while that provider's credential resolves, and its terminal setup. */
const HERMES_AUTH_METHODS = [
  { id: "nous", name: "nous runtime credentials" },
  { id: "hermes-setup", name: "Configure Hermes provider", type: "terminal", args: ["--setup"] },
];
const missingError = MISSING_ERRORS[process.env.FAKE_MISSING ?? "protocol"];
const signedOut = process.env.FAKE_SIGNED_OUT === "1";
const modeFile = process.env.FAKE_MODE_FILE;
function sessionMode(): string {
  if (modeFile) {
    try {
      return readFileSync(modeFile, "utf8").trim();
    } catch {
      return "ok";
    }
  }
  return signedOut ? "signed-out" : "ok";
}
const kimiModelSet = process.env.FAKE_MODEL_SET === "kimi";
const modelUnapplied = process.env.FAKE_MODEL_UNAPPLIED === "1";
const UNAPPLIED_MODEL = "fake-unset";
/** The model that each session runs on. */
const models = new Map<string, string>();
/** The `wait` prompt of each session that waits for its cancel. */
const waiting = new Map<string, () => void>();
let count = 0;

function setup(sessionId: string) {
  const first = MODELS[0]?.modelId ?? "";
  if (!models.has(sessionId)) models.set(sessionId, modelUnapplied ? UNAPPLIED_MODEL : first);
  const running = models.get(sessionId) ?? first;
  const current = running === UNAPPLIED_MODEL ? first : running;
  const state = { availableModels: MODELS, currentModelId: current };
  if (kimiModelSet) return { sessionId, models: state };
  return {
    sessionId,
    configOptions: [
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: current,
        options: MODELS.map((model) => ({ value: model.modelId, name: model.name })),
      },
    ],
    models: state,
    modes: hermes ? { currentModeId: "default", availableModes: [{ id: "default", name: "Default" }] } : undefined,
  };
}

function restore(request: AcpRequest, peer: AcpPeer): void {
  const sessionId = request.params.sessionId ?? "";
  logEntry({ event: request.method, sessionId });
  if (sessionId.startsWith("gone-") && hermes) {
    count += 1;
    // The new session's id is not in a resume reply.
    peer.reply(
      request,
      request.method === "session/load" ? null : { ...setup(`s-${process.pid}-${count}`), sessionId: undefined },
    );
  } else if (sessionId.startsWith("gone-") && missingError) peer.fail(request, missingError(sessionId));
  else peer.reply(request, setup(sessionId));
}

function promptText(params: AcpParams): string {
  return (params.prompt ?? []).map((block) => block.text ?? "").join("");
}

const command = process.argv.slice(2).join(" ");
if (process.env.FAKE_COPILOT === "1" && command === "--version") {
  process.stdout.write("GitHub Copilot CLI 1.0.105.\nRun 'copilot update' to check for updates.\n");
  process.exit(0);
}
if (process.env.FAKE_COPILOT === "1" && (command === "login --web-flow" || command === "login --device-code")) {
  logEntry({ event: command });
  if (command === "login --device-code") {
    process.stdout.write(
      "To authenticate, visit https://github.com/login/device and enter code ABCD-1234\nWaiting for authorization...\n",
    );
  }
  await new Promise((settle) => setTimeout(settle, Number(process.env.FAKE_LOGIN_DELAY_MS ?? 0)));
  if (modeFile) writeFileSync(modeFile, process.env.FAKE_LOGIN_MODE ?? "ok");
  process.exit(0);
}

if (process.env.FAKE_DEVICE_CODE === "1" && process.argv.slice(2).join(" ") === "login --device-code") {
  process.stdout.write(
    "To authenticate, visit https://github.com/login/device and enter code ABCD-1234\nWaiting for authorization...\n",
  );
  setInterval(() => undefined, 1_000);
  await new Promise(() => undefined);
}

serveFakeAcpAgent(
  {
    initialize: (request, peer) =>
      peer.reply(request, {
        protocolVersion: 1,
        agentInfo: { name: "conformance", version: "1.0.0" },
        agentCapabilities: { loadSession: true, ...(hermes ? { sessionCapabilities: { resume: {} } } : {}) },
        authMethods: hermes ? HERMES_AUTH_METHODS.filter((method) => !signedOut || method.id === "hermes-setup") : [],
      }),
    "session/new": (request, peer) => {
      if (signedOut && hermes) {
        process.stderr.write(
          "2026-11-02 10:00:00,000 [WARNING] agent.auxiliary_client: resolve_provider_client: nous requested but Nous Portal not configured (run: hermes auth)\n",
        );
        peer.fail(request, { code: -32603, message: "Internal error" });
        return;
      }
      const mode = sessionMode();
      if (mode === "signed-out") {
        peer.fail(request, { code: -32000, message: "Authentication required" });
        return;
      }
      if (mode === "broken") {
        peer.fail(request, { code: -32603, message: "Internal error" });
        return;
      }
      if (mode === "no-plan") {
        const reason = "unauthorized: not authorized to use this Copilot feature\n";
        peer.fail(request, {
          code: -32603,
          message: `403 ${JSON.stringify(reason)}`,
          data: { category: "permission_denied", status: 403, error: reason },
        });
        return;
      }
      count += 1;
      peer.reply(request, setup(`s-${process.pid}-${count}`));
    },
    "session/load": restore,
    "session/resume": restore,
    "session/set_config_option": (request, peer) => {
      const { sessionId = "", configId, value = "" } = request.params;
      logEntry({ event: "set", sessionId, configId, value });
      if (configId === "model") models.set(sessionId, value);
      peer.reply(request, { configOptions: setup(sessionId).configOptions });
    },
    "session/set_model": (request, peer) => {
      const { sessionId = "", modelId = "" } = request.params;
      logEntry({ event: "set_model", sessionId, value: modelId });
      models.set(sessionId, modelId);
      if (!kimiModelSet) peer.reply(request, {});
      else
        peer.fail(request, {
          code: -32603,
          message: "Internal error",
          data: { details: "[Errno 1] Operation not permitted: '/home/user/.kimi/config.toml'" },
        });
    },
    "session/prompt": (request, peer) => {
      const sessionId = request.params.sessionId ?? "";
      const text = promptText(request.params);
      logEntry({ event: "prompt", sessionId, model: models.get(sessionId) ?? null, text });
      if (text.trim() === "wait") {
        waiting.set(sessionId, () => peer.reply(request, { stopReason: "cancelled" }));
        return;
      }
      peer.say(sessionId, `ok ${models.get(sessionId) ?? ""}`);
      peer.reply(request, { stopReason: "end_turn" });
    },
  },
  {
    onNotification: (method, params) => {
      if (method !== "session/cancel") return;
      const sessionId = params.sessionId ?? "";
      logEntry({ event: "cancel", sessionId });
      waiting.get(sessionId)?.();
      waiting.delete(sessionId);
    },
  },
);
