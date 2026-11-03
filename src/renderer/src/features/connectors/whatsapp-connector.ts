import type { AddMessagingOrchestratorResult, MessagingDesktopApi, WhatsAppOverview } from "@openbot/contracts/ipc";
import { sourceText } from "@openbot/i18n/source";
import type { SlackOrchestratorChoice } from "@openbot/ui/features/settings/SlackIntegrationPanel";
import { currentText } from "@openbot/ui/text";
import { createSignal, untrack } from "solid-js";
import { type ConnectorController, createConnectorActions } from "./connector-controller";
import type { MessagingConnectorOptions } from "./messaging-connector";

/** The WhatsApp account of this computer. A joined server cannot link it: the phone scans on the computer that runs OpenBot. */
export interface WhatsAppApi {
  overview: () => Promise<WhatsAppOverview>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  addOrchestrator: (choice: SlackOrchestratorChoice | null) => Promise<AddMessagingOrchestratorResult>;
  setAllowedChats: (chats: string[]) => Promise<WhatsAppOverview>;
}

export function localWhatsAppApi(messaging: () => MessagingDesktopApi = () => window.openbot.messaging): WhatsAppApi {
  return {
    overview: () => messaging().getWhatsAppOverview(),
    connect: () => messaging().connectWhatsApp(),
    disconnect: () => messaging().disconnectWhatsApp(),
    reconnect: () => messaging().reconnectWhatsApp(),
    setEnabled: (enabled) => messaging().setWhatsAppEnabled({ enabled }),
    addOrchestrator: (choice) => messaging().addWhatsAppOrchestrator({ ...(choice ?? {}) }),
    setAllowedChats: (chats) => messaging().setWhatsAppAllowedChats({ chats }),
  };
}

/** How often the page reads the account while it shows: the QR code rotates and the phone links on its own. */
const POLL_MS = 3_000;

/** Electron puts the IPC channel in front of the message, so only the end is compared. */
function isChatRejected(error: unknown): boolean {
  return error instanceof Error && error.message.endsWith(sourceText("error.messaging.whatsappChatInvalid"));
}

/**
 * The WhatsApp account of this computer. Main sends no event for the QR code or the link, so a page
 * that shows the state calls `watch`. Each action reads the account again when it ends.
 */
export function createWhatsAppConnector(api: WhatsAppApi, options: MessagingConnectorOptions): ConnectorController {
  const [loaded, setLoaded] = createSignal<{ overview: WhatsAppOverview | null; error: string | null } | null>(null);
  const overview = () => loaded()?.overview ?? null;
  const actions = createConnectorActions("connector.whatsapp.actionFailed", "whatsapp");
  let reads = 0;

  const reload = () => {
    const read = ++reads;
    void api
      .overview()
      .then((next) => {
        if (actions.disposed() || read !== reads) return;
        setLoaded({ overview: next, error: null });
      })
      .catch((error: unknown) => {
        if (actions.disposed() || read !== reads) return;
        const { t, errorMessage } = currentText();
        setLoaded({
          overview: untrack(loaded)?.overview ?? null,
          error: errorMessage(error, t("connector.readFailed")),
        });
      });
  };

  return {
    id: "whatsapp",
    ready: () => loaded() !== null,
    available: () => true,
    busy: actions.busy,
    reload,
    watch: () => {
      reload();
      const timer = setInterval(reload, POLL_MS);
      return () => clearInterval(timer);
    },
    detail: {
      id: "whatsapp",
      props: {
        get agents() {
          return options.agents();
        },
        get connections() {
          return overview()?.connections ?? [];
        },
        get qr() {
          return overview()?.qr ?? null;
        },
        get allowedChats() {
          return overview()?.allowedChats ?? [];
        },
        get busy() {
          return actions.busy();
        },
        get models() {
          return options.models?.();
        },
        get loadError() {
          return loaded()?.error ?? null;
        },
        onRetry: reload,
        onConnect: () => actions.run(() => api.connect(), { track: "connect_started", settled: reload }),
        onDisconnect: () => actions.run(() => api.disconnect(), { track: "disconnected", settled: reload }),
        onReconnect: () => actions.run(() => api.reconnect(), { track: "connect_started", settled: reload }),
        onSetEnabled: (enabled) =>
          actions.run(() => api.setEnabled(enabled), { track: enabled ? "enabled" : "disabled", settled: reload }),
        onAddOrchestrator: (choice) =>
          actions.run(
            async () => {
              const { sectionId } = await api.addOrchestrator(choice);
              if (sectionId) options.onOrchestratorSection?.(sectionId);
            },
            { settled: reload },
          ),
        onSetAllowedChats: (chats) =>
          new Promise<boolean>((resolve) => {
            if (actions.busy()) return resolve(false);
            let saved = false;
            actions.run(
              async () => {
                try {
                  setLoaded({ overview: await api.setAllowedChats(chats), error: null });
                  saved = true;
                } catch (error) {
                  if (!isChatRejected(error)) throw error;
                }
              },
              {
                settled: () => {
                  reload();
                  resolve(saved);
                },
              },
            );
          }),
      },
    },
  };
}
