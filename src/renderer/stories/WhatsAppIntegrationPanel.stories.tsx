import type { MessagingConnection } from "@openbot/contracts/ipc";
import {
  WhatsAppConnectDialog,
  type WhatsAppIntegrationAgent,
  WhatsAppIntegrationPanel,
} from "@openbot/ui/features/settings/WhatsAppIntegrationPanel";
import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { STORY_AGENT_SUMMARIES } from "./fixtures";
import { SettledArgs } from "./settled-args";

const meta = {
  title: "Settings/WhatsAppIntegrationPanel",
  component: WhatsAppIntegrationPanel,
  parameters: { layout: "padded", a11y: { test: "error" } },
  render: (args) => <SettledArgs>{() => <WhatsAppIntegrationPanel {...args} />}</SettledArgs>,
} satisfies Meta<typeof WhatsAppIntegrationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const AGENTS: WhatsAppIntegrationAgent[] = STORY_AGENT_SUMMARIES.map((agent) => ({
  id: agent.id,
  name: agent.name,
  title: agent.title,
  avatarSeed: agent.avatarSeed,
  avatarHue: agent.avatarHue,
  avatarUrl: null,
}));

const ORCHESTRATOR: WhatsAppIntegrationAgent = {
  id: "agent-whatsapp-orchestrator",
  name: "WhatsApp Orchestrator",
  title: "Answers in WhatsApp and asks the team",
  avatarSeed: "whatsapp-orchestrator",
  avatarHue: 150,
  avatarUrl: null,
};

function account(update: Partial<MessagingConnection> = {}): MessagingConnection {
  return {
    workspaceId: "whatsapp",
    platform: "whatsapp",
    enabled: true,
    state: "connected",
    workspaceName: "WhatsApp",
    botUserId: "447700900001",
    missingScopes: [],
    retryAt: null,
    credentials: "saved",
    orchestratorAgentId: ORCHESTRATOR.id,
    ...update,
  };
}

const QR = "2@storybook-pairing-code,fG3pQ9xLm0aVn7TzK1sRw8uYdE4cHbJ6oXi5NtPqAe2Mg=,storybook";
const CHATS = ["447700900002@s.whatsapp.net", "120363000000000001@g.us"];

const args = (connections: MessagingConnection[], allowedChats: string[] = [], qr: string | null = null) => ({
  agents: [ORCHESTRATOR, ...AGENTS],
  connections,
  qr,
  allowedChats,
  busy: false,
  onConnect: fn(),
  onDisconnect: fn(),
  onReconnect: fn(),
  onSetEnabled: fn(),
  onAddOrchestrator: fn(),
  onSetAllowedChats: fn(async () => true),
});

export const NotLinked: Story = { args: args([]) };

/** The phone has not scanned the code. Show QR code opens the dialog. */
export const WaitingForScan: Story = { args: args([account({ state: "connecting" })], [], QR) };

export const Connected: Story = { args: args([account()], CHATS) };

/** Nothing reaches an agent until a chat is allowed. */
export const NoAllowedChats: Story = { args: args([account()]) };

export const NoOrchestrator: Story = { args: args([account({ orchestratorAgentId: null })], CHATS) };

export const Paused: Story = { args: args([account({ enabled: false, state: "paused" })], CHATS) };

/** WhatsApp restricted the number, so Hive stopped trying to connect. */
export const Restricted: Story = { args: args([account({ state: "restricted" })], CHATS) };

/** The unlink could not log the device out, so the phone may still list it. */
export const UnlinkedButListed: Story = { args: { ...args([]), phoneMayKeepDevice: true } };

/** The phone removed the device. */
export const LoggedOut: Story = { args: args([account({ state: "invalid_token" })], CHATS) };

type DialogStory = StoryObj<typeof WhatsAppConnectDialog>;

const dialogArgs = (connections: MessagingConnection[], start: "phone" | "agent", qr: string | null = null) => ({
  open: true,
  start,
  connections,
  agents: [ORCHESTRATOR, ...AGENTS],
  qr,
  busy: false,
  onAddOrchestrator: fn(),
  onClose: fn(),
});

/** Step 1: the code is ready, and the phone scans it. */
export const ScanQr: DialogStory = {
  render: (props) => <WhatsAppConnectDialog {...props} />,
  args: dialogArgs([account({ state: "connecting" })], "phone", QR),
};

/** Step 1 before WhatsApp has made the code. */
export const WaitingForCode: DialogStory = {
  render: (props) => <WhatsAppConnectDialog {...props} />,
  args: dialogArgs([], "phone"),
};

/** Step 2: the phone is linked, and the WhatsApp Orchestrator is added next. */
export const AddOrchestrator: DialogStory = {
  render: (props) => <WhatsAppConnectDialog {...props} />,
  args: dialogArgs([account({ orchestratorAgentId: null })], "agent"),
};

export const LinkDone: DialogStory = {
  render: (props) => <WhatsAppConnectDialog {...props} />,
  args: dialogArgs([account()], "agent"),
};
