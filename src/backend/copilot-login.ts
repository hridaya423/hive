import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { copilotHome } from "./process-confinement";

const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u;

/**
 * The GitHub login that the Copilot CLI last signed in, from its `config.json`, which holds no token.
 * Null when the CLI signed in with a token from the environment, or the file is missing or unreadable.
 */
/** The names of the MCP servers in the user's own Copilot `mcp-config.json`. Empty when it is missing or unreadable. */
export function copilotUserMcpServers(env: NodeJS.ProcessEnv = process.env): string[] {
  try {
    const config = JSON.parse(readFileSync(join(copilotHome(env), "mcp-config.json"), "utf8"));
    const servers = isDynamicRecord(config) ? config.mcpServers : undefined;
    return isDynamicRecord(servers) ? Object.keys(servers) : [];
  } catch {
    return [];
  }
}

export function copilotLogin(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const text = readFileSync(join(copilotHome(env), "config.json"), "utf8").replace(/^\s*\/\/.*$/gmu, "");
    const config = JSON.parse(text);
    const last = isDynamicRecord(config) ? config.lastLoggedInUser : undefined;
    const login = isDynamicRecord(last) ? last.login : undefined;
    return typeof login === "string" && GITHUB_LOGIN.test(login) ? login : null;
  } catch {
    return null;
  }
}
