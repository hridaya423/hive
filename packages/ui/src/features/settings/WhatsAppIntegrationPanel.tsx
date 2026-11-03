import type { MessagingConnection } from "@openbot/contracts/ipc";
import { WHATSAPP_ORCHESTRATOR_AVATAR } from "@openbot/contracts/whatsapp-app";
import type { AppTextKey } from "@openbot/i18n";
import {
  Button,
  Check,
  Field,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  MessageCircle,
  QrCode,
  SettingsSection,
  Spinner,
  Text,
  Trash2,
} from "@openbot/ui";
import { createEffect, createSignal, For, Match, Show, Switch } from "solid-js";
import { useText } from "../../text";
import {
  type ChannelAgent,
  ChannelConnectionRow,
  ChannelDisconnectDialog,
  type ChannelOrchestratorChoice,
  type ChannelOrchestratorModels,
  ChannelOrchestratorSection,
  ChannelOrchestratorStep,
  ChannelPage,
  type ChannelState,
  type ChannelText,
  channelRowKind,
} from "./ChannelParts";
import { type IntegrationPageSlots, Stepper, UNKNOWN_STATUS, WizardDialog, type WizardLink } from "./IntegrationLayout";
import { messagingStateUnknown } from "./SlackIntegrationPanel";

export type WhatsAppIntegrationAgent = ChannelAgent;
export type WhatsAppOrchestratorChoice = ChannelOrchestratorChoice;
export type WhatsAppOrchestratorModels = ChannelOrchestratorModels;

export interface WhatsAppIntegrationPanelProps extends IntegrationPageSlots {
  agents: WhatsAppIntegrationAgent[];
  /** The linked account: none, or one. */
  connections: MessagingConnection[];
  /** The pairing code while the phone has not scanned it. */
  qr: string | null;
  /** The chats that can reach an agent, as jids. */
  allowedChats: string[];
  busy: boolean;
  models?: WhatsAppOrchestratorModels | undefined;
  /** Starts the link, which makes the QR code. */
  onConnect: () => void;
  /** Logs the account out of WhatsApp and deletes the login. */
  onDisconnect: () => void;
  onReconnect: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onAddOrchestrator: (choice: WhatsAppOrchestratorChoice | null) => void;
  /** Saves the whole list. Resolves `true` when it was saved. */
  onSetAllowedChats: (chats: string[]) => Promise<boolean>;
  loadError?: string | null | undefined;
  onRetry?: (() => void) | undefined;
}

const WHATSAPP_TEXT = {
  title: "connector.whatsapp.title",
  description: "connector.whatsapp.description",
  connect: "connector.whatsapp.connect",
  attentionTitle: "connector.whatsapp.attentionTitle",
  attentionDescription: "connector.whatsapp.attentionDescription",
  disconnectAllTitle: "connector.whatsapp.disconnectAllTitle",
  disconnect: "connector.whatsapp.unlink",
  reconnect: "connector.whatsapp.reconnect",
  pause: "connector.whatsapp.pause",
  resume: "connector.whatsapp.resume",
  rowAction: "connector.whatsapp.rowAction",
  addAgent: "connector.whatsapp.addAgent",
  orchestratorTitle: "connector.whatsapp.orchestratorTitle",
  orchestratorDescription: "connector.whatsapp.orchestratorDescription",
  orchestratorNone: "connector.whatsapp.orchestratorNone",
  orchestratorNoneDescription: "connector.whatsapp.orchestratorNoneDescription",
  note: "connector.whatsapp.mentionNote",
  connectStepBrowser: "connector.whatsapp.connectStepOpen",
  connectStepAllow: "connector.whatsapp.connectStepLinked",
  connectStepReturn: "connector.whatsapp.connectStepScan",
  connectWaiting: "connector.whatsapp.connectWaiting",
  orchestratorName: "connector.whatsapp.orchestratorName",
  orchestratorRole: "connector.whatsapp.orchestratorRole",
  orchestratorDoesReceive: "connector.whatsapp.orchestratorDoesReceive",
  orchestratorDoesDelegate: "connector.whatsapp.orchestratorDoesDelegate",
  orchestratorDoesAnswer: "connector.whatsapp.orchestratorDoesAnswer",
  orchestratorModel: "connector.whatsapp.orchestratorModel",
  removeEffectKept: "connector.whatsapp.removeEffectKept",
  removeEffectDeleted: "connector.whatsapp.removeEffectDeleted",
  keep: "connector.whatsapp.keep",
  close: "connector.whatsapp.close",
} as const satisfies ChannelText;

const STATE_HELP: Partial<Record<MessagingConnection["state"], AppTextKey>> = {
  invalid_token: "connector.whatsapp.helpError",
  secret_storage_unavailable: "connector.whatsapp.helpError",
  error: "connector.whatsapp.helpError",
};

const WhatsAppMark = () => <MessageCircle aria-hidden="true" />;

/** The one orchestrator agent of the linked account, when it still exists. */
export function whatsappOrchestrator<Agent extends { id: string }>(
  connections: readonly MessagingConnection[],
  agents: readonly Agent[],
): Agent | null {
  for (const connection of connections) {
    const agent = agents.find((candidate) => candidate.id === connection.orchestratorAgentId);
    if (agent) return agent;
  }
  return null;
}

/** The state of the whole WhatsApp integration, for the page header and the Marketplace. */
export function whatsappIntegrationState(
  connections: readonly MessagingConnection[],
  agents: readonly { id: string }[],
  loadError?: string | null,
): ChannelState {
  if (messagingStateUnknown({ connections, loadError })) return { ...UNKNOWN_STATUS, attention: 0 };
  const attention = connections.filter(
    (connection) => channelRowKind(connection) === "attention" || !whatsappOrchestrator([connection], agents),
  ).length;
  if (attention > 0) return { status: "attention", label: "connector.whatsapp.statusAttention", attention };
  if (connections.length === 0) return { status: "idle", label: "marketplace.app.notConnected", attention };
  return { status: "connected", label: "connector.whatsapp.statusConnected", attention };
}

/** The phone number or group id that a jid names. */
function chatName(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

/**
 * Marketplace > Apps > WhatsApp. The account links as a device with a QR code, one WhatsApp
 * Orchestrator answers the chats on the allowlist, and an unlink logs the account out. The QR code
 * and the state come from the caller, who reads them again while the page shows.
 */
export function WhatsAppIntegrationPanel(props: WhatsAppIntegrationPanelProps) {
  const { t } = useText();
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [dialogStart, setDialogStart] = createSignal<"phone" | "agent">("phone");
  const [unlinking, setUnlinking] = createSignal<MessagingConnection | null>(null);
  const orchestrator = () => whatsappOrchestrator(props.connections, props.agents);
  const connection = () => props.connections[0] ?? null;
  const linking = () => {
    const row = connection();
    return row !== null && channelRowKind(row) === "setup";
  };
  const note = (row: MessagingConnection) => {
    const help = STATE_HELP[row.state];
    if (help) return t(help);
    return t(row.state === "connecting" ? "connector.whatsapp.linkingNote" : "connector.whatsapp.linkedNote");
  };
  const openDialog = (start: "phone" | "agent") => {
    setDialogStart(start);
    setDialogOpen(true);
  };

  return (
    <ChannelPage
      text={WHATSAPP_TEXT}
      logo={<WhatsAppMark />}
      state={whatsappIntegrationState(props.connections, props.agents, props.loadError)}
      connections={props.connections}
      unknown={messagingStateUnknown(props)}
      busy={props.busy}
      loadError={props.loadError}
      onRetry={props.onRetry}
      onConnect={() => {
        props.onConnect();
        openDialog("phone");
      }}
      disconnectAllSummary={t(
        orchestrator() === null
          ? "connector.whatsapp.disconnectAllSummaryKept"
          : "connector.whatsapp.disconnectAllSummary",
      )}
      onDisconnectAll={props.onDisconnect}
      tagline={props.tagline}
      intro={props.intro}
      details={props.details}
      sections={
        <>
          <SettingsSection title={t("connector.whatsapp.accountTitle")}>
            <ItemGroup class="settings-modal-card">
              <Show when={connection()}>
                {(row) => (
                  <ChannelConnectionRow
                    text={WHATSAPP_TEXT}
                    logo={<WhatsAppMark />}
                    connection={row()}
                    note={note(row())}
                    busy={props.busy}
                    onReconnect={props.onReconnect}
                    onSetEnabled={props.onSetEnabled}
                    onDisconnect={() => setUnlinking(row())}
                  />
                )}
              </Show>
              <Show when={linking()}>
                <Item class="settings-modal-row">
                  <ItemContent>
                    <ItemDescription>{t("connector.whatsapp.linkingNote")}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button type="button" size="sm" variant="outline" onClick={() => openDialog("phone")}>
                      {t("connector.whatsapp.showQr")}
                    </Button>
                  </ItemActions>
                </Item>
              </Show>
            </ItemGroup>
          </SettingsSection>

          <WhatsAppAllowedChats chats={props.allowedChats} busy={props.busy} onSave={props.onSetAllowedChats} />

          <ChannelOrchestratorSection
            text={WHATSAPP_TEXT}
            avatar={WHATSAPP_ORCHESTRATOR_AVATAR}
            agents={orchestratorList(orchestrator())}
            busy={props.busy}
            onAddAgent={() => openDialog("agent")}
          />
        </>
      }
    >
      <WhatsAppConnectDialog
        open={dialogOpen()}
        start={dialogStart()}
        connections={props.connections}
        agents={props.agents}
        qr={props.qr}
        busy={props.busy}
        models={props.models}
        onAddOrchestrator={props.onAddOrchestrator}
        onClose={() => setDialogOpen(false)}
      />
      <ChannelDisconnectDialog
        text={WHATSAPP_TEXT}
        logo={<WhatsAppMark />}
        connection={unlinking()}
        title={t("connector.whatsapp.disconnectTitle")}
        description={t("connector.whatsapp.leaveDescription")}
        effect={t("connector.whatsapp.disconnectEffect")}
        deletesOrchestrator={orchestrator() !== null}
        onConfirm={() => {
          setUnlinking(null);
          props.onDisconnect();
        }}
        onClose={() => setUnlinking(null)}
      />
    </ChannelPage>
  );
}

/** The allowlist: each chat that can reach an agent, and a field to allow another. Every change saves the list. */
function WhatsAppAllowedChats(props: {
  chats: readonly string[];
  busy: boolean;
  onSave: (chats: string[]) => Promise<boolean>;
}) {
  const { t } = useText();
  const [value, setValue] = createSignal("");
  const [invalid, setInvalid] = createSignal(false);
  const add = () => {
    const entry = value().trim();
    if (!entry) return;
    void props.onSave([...props.chats, entry]).then((saved) => {
      setInvalid(!saved);
      if (saved) setValue("");
    });
  };
  return (
    <SettingsSection title={t("connector.whatsapp.chatsTitle")} description={t("connector.whatsapp.chatsDescription")}>
      <ItemGroup class="settings-modal-card">
        <For each={props.chats}>
          {(chat) => (
            <Item class="settings-modal-row">
              <ItemContent>
                <ItemTitle>{chatName(chat)}</ItemTitle>
                <ItemDescription>
                  {t(chat.endsWith("@g.us") ? "connector.whatsapp.chatGroup" : "connector.whatsapp.chatDirect")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive-ghost"
                  disabled={props.busy}
                  aria-label={t("connector.whatsapp.chatsRemoveLabel", { chat: chatName(chat) })}
                  onClick={() => void props.onSave(props.chats.filter((other) => other !== chat))}
                >
                  <Trash2 aria-hidden="true" />
                  {t("connector.whatsapp.chatsRemove")}
                </Button>
              </ItemActions>
            </Item>
          )}
        </For>
        <Show when={props.chats.length === 0}>
          <Text class="integration-card-note" variant="caption" tone="muted">
            {t("connector.whatsapp.chatsEmpty")}
          </Text>
        </Show>
        <form
          class="whatsapp-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Field
            label={t("connector.whatsapp.chatsAddLabel")}
            description={t("connector.whatsapp.chatsAddHint")}
            error={invalid() ? t("connector.whatsapp.chatsInvalid") : undefined}
          >
            <Input
              size="sm"
              autocomplete="off"
              spellcheck={false}
              value={value()}
              onInput={(event) => {
                setValue(event.currentTarget.value);
                setInvalid(false);
              }}
            />
          </Field>
          <Button type="submit" size="sm" variant="outline" disabled={props.busy || value().trim() === ""}>
            {t("connector.whatsapp.chatsAdd")}
          </Button>
        </form>
      </ItemGroup>
    </SettingsSection>
  );
}

function orchestratorList(agent: WhatsAppIntegrationAgent | null): WhatsAppIntegrationAgent[] {
  return agent ? [agent] : [];
}

/** 0 shows the QR code, 1 adds the orchestrator, and 2 is done. */
type ConnectStep = 0 | 1 | 2;

/**
 * Links WhatsApp in two steps. The phone scans the code outside the dialog, so the step follows the
 * connection: it waits for the code, then for the link. From `start` "agent", it adds the orchestrator
 * of the account that is already linked.
 */
export function WhatsAppConnectDialog(props: {
  open: boolean;
  start: "phone" | "agent";
  connections: readonly MessagingConnection[];
  agents: readonly { id: string }[];
  qr: string | null;
  busy: boolean;
  models?: WhatsAppOrchestratorModels | undefined;
  onAddOrchestrator: (choice: WhatsAppOrchestratorChoice | null) => void;
  onClose: () => void;
}) {
  const { t } = useText();
  const [choice, setChoice] = createSignal<WhatsAppOrchestratorChoice | null>(null);
  createEffect(
    () => props.open,
    (open) => {
      if (open) setChoice(props.models?.initial ?? null);
    },
  );
  const linked = () => props.connections.some((connection) => connection.state === "connected");
  const step = (): ConnectStep => {
    if (!linked()) return 0;
    return whatsappOrchestrator(props.connections, props.agents) ? 2 : 1;
  };
  const dialogLink = (): WizardLink => (step() === 2 ? "connected" : "connecting");
  const copy = () => {
    switch (step()) {
      case 0:
        return { title: t("connector.whatsapp.connectTitle"), description: t("connector.whatsapp.connectDescription") };
      case 1:
        return {
          title: t("connector.whatsapp.agentStepTitle"),
          description: t("connector.whatsapp.agentStepDescription"),
        };
      case 2:
        return { title: t("connector.whatsapp.doneTitle"), description: t("connector.whatsapp.doneDescription") };
    }
  };
  return (
    <WizardDialog
      open={props.open}
      closeLabel={t("connector.whatsapp.close")}
      onClose={props.onClose}
      logo={<WhatsAppMark />}
      link={dialogLink()}
      title={copy().title}
      description={copy().description}
      stepper={
        <Stepper
          steps={[t("connector.whatsapp.stepPhone"), t("connector.whatsapp.stepAgent")]}
          current={step()}
          label={t("connector.whatsapp.connect")}
        />
      }
      footer={
        <Switch>
          <Match when={step() === 0}>
            <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
              {t("connector.whatsapp.close")}
            </Button>
          </Match>
          <Match when={step() === 1}>
            <Button type="button" size="sm" loading={props.busy} onClick={() => props.onAddOrchestrator(choice())}>
              {t("connector.whatsapp.addAgent")}
            </Button>
          </Match>
          <Match when={step() === 2}>
            <Button type="button" size="sm" onClick={props.onClose}>
              {t("connector.whatsapp.done")}
            </Button>
          </Match>
        </Switch>
      }
    >
      <Switch>
        <Match when={step() === 0}>
          <div class="whatsapp-qr">
            <Show
              when={props.qr}
              fallback={
                <div class="channel-waiting" aria-live="polite">
                  <Spinner size="sm" />
                  <Text variant="caption" tone="muted">
                    {t("connector.whatsapp.connectWaiting")}
                  </Text>
                </div>
              }
            >
              {(code) => <QrCode value={code()} size={216} label={t("connector.whatsapp.qrLabel")} />}
            </Show>
          </div>
          <ol class="channel-checklist">
            <For
              each={[WHATSAPP_TEXT.connectStepBrowser, WHATSAPP_TEXT.connectStepAllow, WHATSAPP_TEXT.connectStepReturn]}
            >
              {(line) => (
                <li>
                  <span class="channel-checklist-dot" aria-hidden="true" />
                  {t(line)}
                </li>
              )}
            </For>
          </ol>
        </Match>
        <Match when={step() === 1}>
          <ChannelOrchestratorStep
            text={WHATSAPP_TEXT}
            avatar={WHATSAPP_ORCHESTRATOR_AVATAR}
            models={props.models}
            choice={choice()}
            busy={props.busy}
            onChoose={setChoice}
          />
        </Match>
        <Match when={step() === 2}>
          <ol class="channel-checklist">
            <li data-state="done">
              <Check size={14} aria-hidden="true" />
              {t("connector.whatsapp.linkedNote")}
            </li>
          </ol>
        </Match>
      </Switch>
    </WizardDialog>
  );
}
