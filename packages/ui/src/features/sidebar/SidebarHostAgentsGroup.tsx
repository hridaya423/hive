/**
 * "On other hosts": the agents of every other joined host, after the sections. Like "Hidden", it is not
 * a section of the layout and has no drag target. A row names its host, shows what the agent does there,
 * and opens the agent on that host with one press.
 */

import { Badge, Button, ChevronDown } from "@openbot/ui";
import { For, Show } from "solid-js";
import { useText } from "../../text";
import { AgentAvatar } from "../agents/AgentAvatar";
import { SidebarAgentIndicator } from "./SidebarAgentIndicator";
import { sidebarAgentStateLabel } from "./sidebar-filtering";
import { useSidebarScope } from "./sidebar-scope";
import { SIDEBAR_HOSTS_GROUP_COLLAPSED_ID, type SidebarHostAgent } from "./sidebar-types";

const BODY_ID = "sidebar-host-agents-body";

function SidebarHostAgentRow(rowProps: { entry: SidebarHostAgent }) {
  const { props } = useSidebarScope();
  const { t, format } = useText();
  const state = () => rowProps.entry.state;
  const stateLabel = () => {
    const current = state();
    return current ? `. ${sidebarAgentStateLabel(current, t, format)}` : "";
  };
  return (
    <div class="sidebar-agent-item">
      <Button
        variant="ghost"
        type="button"
        class="agent-row"
        aria-label={`${t("sidebar.hosts.open", { name: rowProps.entry.agent.name, host: rowProps.entry.serverName })}${stateLabel()}`}
        data-cuelume-navigate=""
        onClick={() => props.onSelectHostAgent?.(rowProps.entry.serverId, rowProps.entry.agent.id)}
      >
        <span class="agent-row-avatar">
          <AgentAvatar agent={rowProps.entry.agent} motion="idle" mood="idle" workingFaces />
          <SidebarAgentIndicator state={state} />
        </span>
        <span class="agent-row-copy">
          <span class="agent-row-heading">
            <span class="agent-row-title">
              <span class="agent-row-name">
                <strong>{rowProps.entry.agent.name}</strong>
              </span>
            </span>
          </span>
          <span class="agent-row-preview">
            <Badge class="agent-host-badge" title={rowProps.entry.serverName}>
              <span>{rowProps.entry.serverName}</span>
            </Badge>
            <Show when={rowProps.entry.agent.title.trim()}>
              {(title) => <span class="agent-host-title">{title()}</span>}
            </Show>
          </span>
        </span>
      </Button>
    </div>
  );
}

export function SidebarHostAgentsGroup() {
  const { props, sectionIsCollapsed } = useSidebarScope();
  const { t } = useText();
  const entries = () => props.otherHostAgents ?? [];
  const open = () => !sectionIsCollapsed(SIDEBAR_HOSTS_GROUP_COLLAPSED_ID);
  return (
    <Show when={entries().length > 0}>
      <section
        class="sidebar-chat-group sidebar-section sidebar-hosts-group"
        aria-label={t("sidebar.hosts.label", { count: entries().length })}
      >
        <header>
          <Button
            variant="ghost"
            type="button"
            class="sidebar-section-toggle"
            aria-label={t("sidebar.hosts.label", { count: entries().length })}
            aria-expanded={open() ? "true" : "false"}
            aria-controls={BODY_ID}
            data-cuelume-open={open() ? undefined : ""}
            data-cuelume-close={open() ? "" : undefined}
            data-cuelume-emphasis="subtle"
            onClick={() => props.onToggleSection(SIDEBAR_HOSTS_GROUP_COLLAPSED_ID)}
          >
            <span class="sidebar-section-name">
              {t("sidebar.hosts.title")}
              <span class="sidebar-hidden-group-count">{t("sidebar.hidden.count", { count: entries().length })}</span>
            </span>
            <ChevronDown
              class={`sidebar-section-chevron size-4${open() ? "" : " sidebar-section-chevron-collapsed"}`}
              aria-hidden="true"
            />
          </Button>
        </header>
        <div
          class="sidebar-section-collapse"
          data-collapsed={open() ? undefined : ""}
          aria-hidden={open() ? undefined : "true"}
          inert={open() ? undefined : true}
        >
          <div id={BODY_ID} class="sidebar-section-body">
            <For each={entries()}>{(entry) => <SidebarHostAgentRow entry={entry} />}</For>
          </div>
        </div>
      </section>
    </Show>
  );
}
