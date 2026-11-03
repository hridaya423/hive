import type {
  MessagingConnection,
  MessagingDesktopApi,
  MessagingPlatform,
  MessagingRole,
  WhatsAppOverview,
} from "@openbot/contracts/ipc";
import { sourceText } from "@openbot/i18n/source";
import { clone } from "./mock-support";

/** The platforms whose preview adds a workspace for each connect. Telegram has a chat for each link. */
type WorkspacePlatform = Exclude<MessagingPlatform, "telegram" | "whatsapp">;

/** The preview workspace of the `count`th connect. The first keeps the names that stories show. */
const PREVIEW_WORKSPACE = {
  slack: (count: number) => ({
    workspaceId: count === 1 ? "T0PREVIEW" : `T0PREVIEW${count}`,
    workspaceName: count === 1 ? "Preview workspace" : `Preview workspace ${count}`,
    botUserId: "U0PREVIEW",
  }),
  discord: (count: number) => ({
    workspaceId: String(100000000000000001n + BigInt(count - 1)),
    workspaceName: count === 1 ? "Preview Discord server" : `Preview Discord server ${count}`,
    botUserId: "100000000000000002",
  }),
} as const satisfies Record<
  WorkspacePlatform,
  (count: number) => { workspaceId: string; workspaceName: string; botUserId: string }
>;

/** The roles of every preview Discord server, highest first. */
const PREVIEW_ROLES: readonly MessagingRole[] = [
  { id: "200000000000000001", name: "Admin" },
  { id: "200000000000000002", name: "Moderator" },
  { id: "200000000000000003", name: "Member" },
];

/** The time Telegram takes in the preview before a chat links: the user picks the chat there. */
const TELEGRAM_LINK_MS = 1_500;

/** The time the preview phone takes to scan the WhatsApp QR code. */
const WHATSAPP_SCAN_MS = 4_000;

const PREVIEW_WHATSAPP_QR = "2@preview-pairing-code,fG3pQ9xLm0aVn7TzK1sRw8uYdE4cHbJ6oXi5NtPqAe2Mg=,preview";

/**
 * The Slack workspaces, Discord servers and Telegram chats of the preview host. Connecting Slack or
 * Discord connects a preview workspace at once. A Telegram link adds a preview chat after a moment,
 * as the user picks it in Telegram. `orchestrator` names the preview agent that stands in for the
 * orchestrators.
 */
export function createMockMessaging(orchestrator: () => string): MessagingDesktopApi {
  const platform = (name: WorkspacePlatform, notConnected: string) => {
    const connections = new Map<string, MessagingConnection>();
    let connects = 0;
    const change = (workspaceId: string, update: Partial<MessagingConnection>) => {
      const current = connections.get(workspaceId);
      if (!current) throw new Error(notConnected);
      connections.set(workspaceId, { ...current, ...update });
    };
    return {
      overview: async () => clone({ connections: [...connections.values()] }),
      connect: async () => {
        connects += 1;
        const workspace = PREVIEW_WORKSPACE[name](connects);
        connections.set(workspace.workspaceId, {
          ...workspace,
          platform: name,
          enabled: true,
          state: "connected",
          missingScopes: [],
          retryAt: null,
          credentials: "saved",
          orchestratorAgentId: null,
        });
      },
      disconnect: async ({ workspaceId }: { workspaceId: string }) => {
        connections.delete(workspaceId);
      },
      reconnect: async ({ workspaceId }: { workspaceId: string }) =>
        change(workspaceId, { enabled: true, state: "connected" }),
      setEnabled: async ({ workspaceId, enabled }: { workspaceId: string; enabled: boolean }) =>
        change(workspaceId, { enabled, state: enabled ? "connected" : "paused" }),
      addOrchestrator: async ({ workspaceId }: { workspaceId: string }) => {
        const agentId = orchestrator();
        change(workspaceId, { orchestratorAgentId: agentId });
        return { agentId, sectionId: null };
      },
      connected: (workspaceId: string) => {
        if (!connections.has(workspaceId)) throw new Error(notConnected);
      },
    };
  };
  const slack = platform("slack", sourceText("error.messaging.notConnected"));
  const discord = platform("discord", sourceText("error.messaging.discordNotConnected"));
  /** The roles that each preview Discord server allows. None lets everyone. */
  const allowedRoles = new Map<string, MessagingRole[]>();
  const chats = new Map<string, MessagingConnection>();
  /** One orchestrator answers every Telegram chat, so a new chat gets it too. */
  let telegramOrchestrator: string | null = null;
  let linkedChats = 0;
  const changeChat = (workspaceId: string, update: Partial<MessagingConnection>) => {
    const current = chats.get(workspaceId);
    if (!current) throw new Error(sourceText("error.messaging.notConnected"));
    chats.set(workspaceId, { ...current, ...update });
  };
  let whatsapp: MessagingConnection | null = null;
  let whatsappQr: string | null = null;
  let whatsappChats: string[] = [];
  const whatsappOverview = (): WhatsAppOverview =>
    clone({ connections: whatsapp ? [whatsapp] : [], qr: whatsappQr, allowedChats: whatsappChats });
  const changeWhatsApp = (update: Partial<MessagingConnection>) => {
    if (!whatsapp) throw new Error(sourceText("error.messaging.whatsappNotLinked"));
    whatsapp = { ...whatsapp, ...update };
  };
  const api: Omit<MessagingDesktopApi, `host${string}`> = {
    getSlackOverview: slack.overview,
    connectSlackWorkspace: slack.connect,
    disconnectSlackWorkspace: slack.disconnect,
    reconnectSlackWorkspace: slack.reconnect,
    setSlackEnabled: slack.setEnabled,
    addSlackOrchestrator: slack.addOrchestrator,
    getDiscordOverview: discord.overview,
    connectDiscordGuild: discord.connect,
    disconnectDiscordGuild: discord.disconnect,
    reconnectDiscordGuild: discord.reconnect,
    setDiscordEnabled: discord.setEnabled,
    addDiscordOrchestrator: discord.addOrchestrator,
    getDiscordAccess: async ({ workspaceId }) => {
      discord.connected(workspaceId);
      return clone({ allowedRoles: allowedRoles.get(workspaceId) ?? [] });
    },
    listDiscordRoles: async ({ workspaceId }) => {
      discord.connected(workspaceId);
      return clone({ roles: [...PREVIEW_ROLES] });
    },
    setDiscordAccess: async ({ workspaceId, allowedRoles: roles }) => {
      discord.connected(workspaceId);
      allowedRoles.set(workspaceId, clone(roles));
      return clone({ allowedRoles: roles });
    },
    getTelegramOverview: async () => clone({ connections: [...chats.values()] }),
    connectTelegramChat: async ({ place }) => {
      linkedChats += 1;
      const count = linkedChats;
      // Telegram gives a group a negative chat ID, and a direct chat a positive one.
      const chat =
        place === "group"
          ? { workspaceId: `-100${count}`, workspaceName: `Preview group ${count}` }
          : { workspaceId: `${700_000 + count}`, workspaceName: `Preview chat ${count}` };
      setTimeout(() => {
        chats.set(chat.workspaceId, {
          ...chat,
          platform: "telegram",
          enabled: true,
          state: "connected",
          botUserId: "7000000000",
          missingScopes: [],
          retryAt: null,
          credentials: "saved",
          orchestratorAgentId: telegramOrchestrator,
        });
      }, TELEGRAM_LINK_MS);
    },
    disconnectTelegramChat: async ({ workspaceId }) => {
      chats.delete(workspaceId);
    },
    reconnectTelegramChat: async ({ workspaceId }) => changeChat(workspaceId, { enabled: true, state: "connected" }),
    setTelegramEnabled: async ({ workspaceId, enabled }) =>
      changeChat(workspaceId, { enabled, state: enabled ? "connected" : "paused" }),
    addTelegramOrchestrator: async () => {
      const agentId = orchestrator();
      telegramOrchestrator = agentId;
      for (const workspaceId of chats.keys()) changeChat(workspaceId, { orchestratorAgentId: agentId });
      return { agentId, sectionId: null };
    },
    getWhatsAppOverview: async () => whatsappOverview(),
    connectWhatsApp: async () => {
      whatsapp = {
        workspaceId: "whatsapp",
        workspaceName: "WhatsApp",
        platform: "whatsapp",
        enabled: true,
        state: "connecting",
        botUserId: null,
        missingScopes: [],
        retryAt: null,
        credentials: "saved",
        orchestratorAgentId: whatsapp?.orchestratorAgentId ?? null,
      };
      whatsappQr = PREVIEW_WHATSAPP_QR;
      setTimeout(() => {
        if (whatsapp?.state !== "connecting") return;
        whatsappQr = null;
        changeWhatsApp({ state: "connected", botUserId: "447700900001" });
      }, WHATSAPP_SCAN_MS);
    },
    disconnectWhatsApp: async () => {
      whatsapp = null;
      whatsappQr = null;
      whatsappChats = [];
      return { deviceRemoved: true };
    },
    reconnectWhatsApp: async () => changeWhatsApp({ enabled: true, state: "connected" }),
    setWhatsAppEnabled: async ({ enabled }) => changeWhatsApp({ enabled, state: enabled ? "connected" : "paused" }),
    addWhatsAppOrchestrator: async () => {
      const agentId = orchestrator();
      changeWhatsApp({ orchestratorAgentId: agentId });
      return { agentId, sectionId: null };
    },
    setWhatsAppAllowedChats: async ({ chats: next }) => {
      whatsappChats = [
        ...new Set(next.map((chat) => (chat.includes("@") ? chat : `${chat.replace(/\D/gu, "")}@s.whatsapp.net`))),
      ];
      return whatsappOverview();
    },
  };
  // The preview has one host, so a joined server's connections are the same ones.
  const overview = {
    slack: api.getSlackOverview,
    discord: api.getDiscordOverview,
    telegram: api.getTelegramOverview,
    whatsapp: async () => whatsappOverview(),
  };
  return {
    ...api,
    hostOverview: ({ platform }) => overview[platform](),
    hostConnect: ({ platform, place }) =>
      platform === "slack"
        ? api.connectSlackWorkspace()
        : platform === "discord"
          ? api.connectDiscordGuild()
          : platform === "whatsapp"
            ? api.connectWhatsApp()
            : api.connectTelegramChat({ place: place ?? "group" }),
    hostDisconnect: ({ platform, workspaceId }) =>
      platform === "slack"
        ? api.disconnectSlackWorkspace({ workspaceId })
        : platform === "discord"
          ? api.disconnectDiscordGuild({ workspaceId })
          : platform === "whatsapp"
            ? api.disconnectWhatsApp().then(() => undefined)
            : api.disconnectTelegramChat({ workspaceId }),
    hostReconnect: ({ platform, workspaceId }) =>
      platform === "slack"
        ? api.reconnectSlackWorkspace({ workspaceId })
        : platform === "discord"
          ? api.reconnectDiscordGuild({ workspaceId })
          : platform === "whatsapp"
            ? api.reconnectWhatsApp()
            : api.reconnectTelegramChat({ workspaceId }),
    hostSetEnabled: ({ platform, ...input }) =>
      platform === "slack"
        ? api.setSlackEnabled(input)
        : platform === "discord"
          ? api.setDiscordEnabled(input)
          : platform === "whatsapp"
            ? api.setWhatsAppEnabled({ enabled: input.enabled })
            : api.setTelegramEnabled(input),
    hostAddOrchestrator: ({ platform, workspaceId }) =>
      platform === "whatsapp"
        ? api.addWhatsAppOrchestrator({})
        : platform === "telegram" || workspaceId === null
          ? api.addTelegramOrchestrator({})
          : platform === "slack"
            ? api.addSlackOrchestrator({ workspaceId })
            : api.addDiscordOrchestrator({ workspaceId }),
    hostGetDiscordAccess: (input) => api.getDiscordAccess(input),
    hostListDiscordRoles: (input) => api.listDiscordRoles(input),
    hostSetDiscordAccess: (input) => api.setDiscordAccess(input),
    hostGetWhatsAppOverview: () => api.getWhatsAppOverview(),
    hostSetWhatsAppAllowedChats: (input) => api.setWhatsAppAllowedChats(input),
  };
}
