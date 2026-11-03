import type { OpenBotDesktopApi } from "@openbot/contracts/ipc";

/** What the host roster reaches in main: the agents, runtime and unread counts of any joined server. */
export interface HostRosterPort {
  agent: Pick<
    OpenBotDesktopApi["agent"],
    "listAgents" | "getRuntimeSnapshot" | "listConversationReads" | "onScopedEvent"
  >;
  instanceTransfer: Pick<OpenBotDesktopApi["instanceTransfer"], "moveAgent">;
}

export function hostRosterPort(): HostRosterPort {
  return window.openbot;
}
