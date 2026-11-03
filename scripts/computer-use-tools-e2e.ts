// Checks which Computer Use tools a Codex agent is offered, on the real `codex app-server`. A stdio
// MCP server stands in for the driver and declares its 62 tools. A fake Responses server records the
// tools of each request, so no account or key is used. The payload is the one `codexMcpServers`
// builds for a thread. Expected: only `COMPUTER_USE_CORE_TOOLS`, and an agent with no `computerUse`
// setting has Computer Use off.
// `bun scripts/computer-use-tools-e2e.ts`. Writes .openbot-build/computer-use-tools-e2e/report.json.
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import {
  agentComputerUseEnabled,
  COMPUTER_USE_CORE_TOOLS,
  COMPUTER_USE_MCP_SERVER_ID,
  COMPUTER_USE_MCP_SERVER_NAME,
  type McpServerConfig,
} from "@openbot/contracts/ipc";
import { CodexAppServerClient } from "../src/backend/app-server-client";
import { resolveCodexCli } from "../src/backend/cli";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { agentMcpServers, codexMcpServers, usableMcpServers } from "../src/backend/mcp-provider-shapes";
import { decodeRecordResponse, getRecord, getString } from "../src/backend/protocol";
import { listen } from "./net-support";

const OUT = resolve(import.meta.dirname, "../.openbot-build/computer-use-tools-e2e");
const NL = String.fromCharCode(10);
const DEADLINE_MS = 60_000;
const DRIVER_TOOLS =
  "list_apps list_windows get_window_state verify_state launch_app kill_app bring_to_front set_window_frame invoke_menu click double_click right_click drag type_text press_key hotkey set_value scroll clipboard_read clipboard_write get_screen_size get_desktop_state get_cursor_position move_cursor set_agent_cursor_enabled set_agent_cursor_motion set_agent_cursor_theme get_agent_cursor_state check_permissions health_report get_config set_config get_accessibility_tree zoom page get_browser_state browser_prepare browser_navigate browser_click browser_type browser_select browser_dialog browser_set_input_files browser_download browser_pointer start_recording stop_recording get_recording_state replay_trajectory install_ffmpeg start_session escalate_session get_session list_sessions get_session_state end_session get_guide run_steps run_script check_for_update install_extension parse_visual_regions".split(
    " ",
  );

interface Tool {
  name?: string;
  tools?: Tool[];
}
interface ModelRequest {
  tools?: Tool[];
  input?: Array<{ tools?: Tool[] }>;
}

const FAKE_DRIVER = `
import { Server } from ${JSON.stringify(import.meta.resolve("@modelcontextprotocol/sdk/server/index.js"))};
import { StdioServerTransport } from ${JSON.stringify(import.meta.resolve("@modelcontextprotocol/sdk/server/stdio.js"))};
import { ListToolsRequestSchema } from ${JSON.stringify(import.meta.resolve("@modelcontextprotocol/sdk/types.js"))};
const names = ${JSON.stringify(DRIVER_TOOLS)};
const server = new Server({ name: "driver", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: names.map((name) => ({ name, description: name, inputSchema: { type: "object", properties: {} } })),
}));
await server.connect(new StdioServerTransport());
`;

function startFakeModel() {
  const offered: string[][] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const parsed: ModelRequest = JSON.parse(body || "{}");
      const tools = parsed.tools ?? parsed.input?.find((item) => item.tools)?.tools ?? [];
      const namespace = tools.find((tool) => tool.name === `mcp__${COMPUTER_USE_MCP_SERVER_NAME}`);
      offered.push((namespace?.tools ?? []).flatMap((tool) => (tool.name ? [tool.name] : [])));
      const item = {
        type: "message",
        role: "assistant",
        id: "m",
        content: [{ type: "output_text", text: "done" }],
      };
      const send = (event: { type: string; [key: string]: unknown }) =>
        response.write(`event: ${event.type}${NL}data: ${JSON.stringify(event)}${NL}${NL}`);
      response.writeHead(200, { "content-type": "text/event-stream" });
      send({ type: "response.created", response: { id: "r", status: "in_progress" } });
      send({ type: "response.output_item.done", output_index: 0, item });
      send({
        type: "response.completed",
        response: {
          id: "r",
          status: "completed",
          output: [item],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        },
      });
      response.end();
    });
  });
  return listen(server).then((listening) => ({ offered, ...listening }));
}

function deadline(what: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`No answer for ${what} in ${DEADLINE_MS} ms.`)), DEADLINE_MS).unref();
  });
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const driverPath = join(OUT, "fake-driver.mjs");
await writeFile(driverPath, FAKE_DRIVER);
const cli = await runCauseEffect(resolveCodexCli());
const model = await startFakeModel();
const report: { passed: boolean; codexVersion: string; offered?: string[]; error?: string } = {
  passed: false,
  codexVersion: cli.version,
};
try {
  assert.equal(agentComputerUseEnabled({}), false, "An agent with no setting has Computer Use on.");
  assert.equal(agentComputerUseEnabled({ computerUse: true }), true);
  const config: McpServerConfig = {
    id: COMPUTER_USE_MCP_SERVER_ID,
    name: COMPUTER_USE_MCP_SERVER_NAME,
    transport: "stdio",
    enabled: true,
    command: process.execPath,
    args: [driverPath],
    env: [],
    envPassthrough: [],
    workingDirectory: "",
    url: "",
    headers: [],
  };
  assert.deepEqual(agentMcpServers([config], false), [], "An agent with Computer Use off is given the driver.");
  const usable = await runCauseEffect(usableMcpServers([config]));
  const servers = codexMcpServers(usable).servers;
  const home = join(OUT, "codex-home");
  await mkdir(home, { recursive: true });
  await writeFile(
    join(home, "config.toml"),
    [
      'model = "fake-model"',
      'model_provider = "fake"',
      "[model_providers.fake]",
      'name = "fake"',
      `base_url = "http://127.0.0.1:${model.port}/v1"`,
      'env_key = "FAKE_KEY"',
      'wire_api = "responses"',
      "",
    ].join(NL),
  );
  const client = new CodexAppServerClient(cli.executable, 30_000, { CODEX_HOME: home, FAKE_KEY: "e2e" });
  const turnDone = new Promise<void>((done) => {
    client.on("notification", (notification) => {
      if (notification.method === "turn/completed") done();
    });
  });
  client.start();
  try {
    await runCauseEffect(
      client.request(
        "initialize",
        { clientInfo: { name: "openbot_e2e", title: "OpenBot E2E", version: "0.0.0" }, capabilities: {} },
        decodeRecordResponse,
      ),
    );
    client.notify("initialized");
    const started = await runCauseEffect(
      client.request(
        "thread/start",
        {
          cwd: home,
          approvalPolicy: "never",
          sandbox: "danger-full-access",
          model: "fake-model",
          config: { mcp_servers: servers, mcp_optional_startup_grace_ms: 10_000 },
        },
        decodeRecordResponse,
      ),
    );
    const threadId = getString(getRecord(started, "thread"), "id");
    assert(threadId, "thread/start returned no thread id");
    await runCauseEffect(
      client.request("turn/start", { threadId, input: [{ type: "text", text: "hello" }] }, decodeRecordResponse),
    );
    await Promise.race([turnDone, deadline("the turn")]);
  } finally {
    await runCauseEffect(client.stop());
  }
  const offered = [...(model.offered[0] ?? [])].sort();
  report.offered = offered;
  assert.deepEqual(offered, [...COMPUTER_USE_CORE_TOOLS].sort(), "Codex offered other tools than the core list.");
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.exitCode = 1;
} finally {
  await model.close();
  await writeFile(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}${NL}`);
  process.stdout.write(`${report.passed ? "passed" : "failed"}: ${join(OUT, "report.json")}${NL}`);
  if (report.error) process.stdout.write(`${report.error}${NL}`);
}
