import type {
  AgentRuntimeSnapshot,
  ClientAgentSummary,
  ConversationReadState,
  ServerSummary,
} from "@openbot/contracts/ipc";
import { AGENT_HIDDEN_CAPABILITY } from "@openbot/contracts/team-protocol/agent-hidden-v1";
import { INSTANCE_TRANSFER_CAPABILITY } from "@openbot/contracts/team-protocol/instance-transfer-v1";
import {
  computeSidebarAgentStates,
  type SidebarApproval,
  type SidebarAttention,
} from "@openbot/ui/features/sidebar/sidebar-agent-states";
import type { SidebarHostAgent, SidebarMoveTarget } from "@openbot/ui/features/sidebar/sidebar-types";
import { createEffect, createStore, onSettled } from "solid-js";
import { toAgentProfile } from "../../app-message-projection";
import { createSimpleContext } from "../../simple-context";
import { hostRosterPort } from "./host-roster-port";
import { serverCanAdminister } from "./server-capabilities";
import { useServers } from "./servers-context";

const UNREAD_REFRESH_MS = 1_000;

const unreadCounts = (reads: Record<string, ConversationReadState>) =>
  Object.fromEntries(Object.entries(reads).map(([agentId, entry]) => [agentId, entry.unreadCount]));

interface HostRosterEntry {
  agents: ClientAgentSummary[];
  snapshot: AgentRuntimeSnapshot | null;
  unread: Record<string, number>;
}

/**
 * The agents of every joined host that is not the active one, with what each is doing. The active host's
 * own domains hold its agents; this holds the rest, so one list can show all hosts. A host stays here
 * while it is connected and not active, and a read that fails keeps what the last read found.
 */
const HostRoster = createSimpleContext({
  name: "Host roster",
  init: () => {
    const { servers, activeServerId } = useServers();
    const [hosts, setHosts] = createStore<Record<string, HostRosterEntry>>({});
    const unreadTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const isBackground = (server: ServerSummary) =>
      server.id !== activeServerId() && (server.kind === "local" || server.state === "online");

    async function read(serverId: string): Promise<void> {
      const { agent } = hostRosterPort();
      try {
        const [agents, snapshot, reads] = await Promise.all([
          agent.listAgents(serverId),
          agent.getRuntimeSnapshot(serverId),
          agent.listConversationReads(serverId),
        ]);
        setHosts((state) => {
          state[serverId] = {
            agents,
            snapshot,
            unread: unreadCounts(reads),
          };
        });
      } catch {
        return;
      }
    }

    function scheduleUnreadRead(serverId: string): void {
      if (unreadTimers.has(serverId)) return;
      unreadTimers.set(
        serverId,
        setTimeout(() => {
          unreadTimers.delete(serverId);
          void hostRosterPort()
            .agent.listConversationReads(serverId)
            .then((reads) =>
              setHosts((state) => {
                const entry = state[serverId];
                if (entry) entry.unread = unreadCounts(reads);
              }),
            )
            .catch(() => undefined);
        }, UNREAD_REFRESH_MS),
      );
    }

    createEffect(
      () =>
        servers()
          .filter(isBackground)
          .map((server) => `${server.id}:${server.connectionSequence ?? 0}`)
          .join(","),
      () => {
        const wanted = new Set(
          servers()
            .filter(isBackground)
            .map((server) => server.id),
        );
        setHosts((state) => {
          for (const serverId of Object.keys(state)) if (!wanted.has(serverId)) delete state[serverId];
        });
        for (const serverId of wanted) void read(serverId);
      },
    );

    onSettled(() => {
      const unsubscribe = hostRosterPort().agent.onScopedEvent(({ serverId, event }) => {
        if (!hosts[serverId]) return;
        if (event.type === "agents-changed") {
          setHosts((state) => {
            const entry = state[serverId];
            if (entry) entry.agents = event.agents;
          });
        } else if (event.type === "runtime-snapshot") {
          setHosts((state) => {
            const entry = state[serverId];
            if (entry) entry.snapshot = event.snapshot;
          });
        } else if (event.type === "conversation") scheduleUnreadRead(serverId);
      });
      return () => {
        unsubscribe();
        for (const timer of unreadTimers.values()) clearTimeout(timer);
        unreadTimers.clear();
      };
    });

    function hostAgents(localName: string): SidebarHostAgent[] {
      return servers().flatMap((server) => {
        const entry = hosts[server.id];
        if (!entry || !isBackground(server)) return [];
        const visible = entry.agents.filter((agent) => agent.hiddenAt === undefined);
        const snapshot = entry.snapshot;
        const activeTurns: Record<string, string | null> = {};
        const pendingPrompts: Record<string, SidebarAttention | undefined> = {};
        const pendingApprovals: Record<string, SidebarApproval | undefined> = {};
        const failedTurns: Record<string, string | undefined> = {};
        for (const turn of snapshot?.activeTurns ?? []) activeTurns[turn.agentId] = turn.turnId;
        for (const prompt of snapshot?.pendingPrompts ?? [])
          pendingPrompts[prompt.agentId] = { type: "prompt", turnId: prompt.turnId, questions: prompt.questions };
        for (const approval of snapshot?.pendingApprovals ?? []) pendingApprovals[approval.agentId] = approval;
        for (const failed of snapshot?.failedTurns ?? []) failedTurns[failed.agentId] = failed.turnId;
        const states = computeSidebarAgentStates({
          agentIds: visible.map((agent) => agent.id),
          activeTurns,
          queues: {},
          unreadReplies: entry.unread,
          recentReplies: {},
          pendingPrompts,
          pendingApprovals,
          failedTurns,
        });
        const serverName = server.kind === "local" ? localName : server.name;
        return visible.map((agent) => ({
          serverId: server.id,
          serverName,
          agent: toAgentProfile(agent),
          state: states[agent.id],
        }));
      });
    }

    function moveTargets(localName: string): SidebarMoveTarget[] {
      const canHost = (server: ServerSummary | undefined) =>
        serverCanAdminister(server, INSTANCE_TRANSFER_CAPABILITY) &&
        serverCanAdminister(server, AGENT_HIDDEN_CAPABILITY);
      const active = servers().find((server) => server.id === activeServerId());
      if (!canHost(active)) return [];
      return servers()
        .filter((server) => isBackground(server) && canHost(server))
        .map((server) => ({ id: server.id, name: server.kind === "local" ? localName : server.name }));
    }

    async function moveAgent(agentId: string, sourceServerId: string, targetServerId: string): Promise<void> {
      await hostRosterPort().instanceTransfer.moveAgent({ agentId, sourceServerId, targetServerId });
      await read(targetServerId);
    }

    return { hostAgents, moveTargets, moveAgent };
  },
});

export const HostRosterProvider = HostRoster.provider;
export const useHostRoster = HostRoster.use;
