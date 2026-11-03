/**
 * Moves one agent to another joined host. The dialog stays open and pending until the target holds the
 * agent, and shows why when it fails; the source host is untouched in that case.
 */

import { ConfirmDialog, RadioGroup } from "@openbot/ui";
import { createSignal, For, Show, untrack } from "solid-js";
import type { AgentProfile } from "../../data";
import { useText } from "../../text";
import { AgentAvatar } from "../agents/AgentAvatar";
import type { SidebarMoveTarget } from "./sidebar-types";

export function MoveAgentDialog(props: {
  agent: AgentProfile;
  targets: readonly SidebarMoveTarget[];
  onMove: (targetServerId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t, errorMessage } = useText();
  const [targetId, setTargetId] = createSignal(untrack(() => props.targets[0]?.id ?? ""));
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function move(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await props.onMove(targetId());
      props.onClose();
    } catch (cause) {
      setError(errorMessage(cause, t("sidebar.moveHost.failed")));
    } finally {
      setPending(false);
    }
  }

  return (
    <ConfirmDialog
      open
      tone="default"
      pending={pending()}
      error={error()}
      media={<AgentAvatar agent={props.agent} style={{ width: "44px", height: "44px" }} />}
      title={t("sidebar.moveHost.title", { name: props.agent.name })}
      description={t("sidebar.moveHost.description")}
      confirmLabel={t("sidebar.moveHost.confirm")}
      pendingLabel={t("sidebar.moveHost.pending")}
      onCancel={props.onClose}
      onConfirm={move}
    >
      <Show
        when={props.targets.length > 1}
        fallback={
          <p class="sidebar-move-host-single">
            <span class="sidebar-move-host-label">{t("sidebar.moveHost.target")}</span>
            <strong>{props.targets[0]?.name}</strong>
          </p>
        }
      >
        <RadioGroup.Root
          class="sidebar-move-host-list"
          name="move-agent-host"
          value={targetId()}
          onChange={setTargetId}
          disabled={pending()}
        >
          <RadioGroup.Label class="sidebar-move-host-label">{t("sidebar.moveHost.target")}</RadioGroup.Label>
          <For each={props.targets}>
            {(target) => (
              <RadioGroup.Item class="sidebar-move-host-item" value={target.id}>
                <RadioGroup.ItemInput />
                <RadioGroup.ItemControl class="sidebar-move-host-control">
                  <RadioGroup.ItemIndicator class="sidebar-move-host-dot" />
                </RadioGroup.ItemControl>
                <RadioGroup.ItemLabel>{target.name}</RadioGroup.ItemLabel>
              </RadioGroup.Item>
            )}
          </For>
        </RadioGroup.Root>
      </Show>
    </ConfirmDialog>
  );
}
