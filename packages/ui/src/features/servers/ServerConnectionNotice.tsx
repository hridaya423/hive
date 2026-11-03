import { createEffect, createSignal, Show, untrack } from "solid-js";
import { Button } from "../../button";
import { ErrorReference } from "../../error-reference";
import { useText } from "../../text";
import { AppLoadingScreen } from "../account/AppLoadingScreen";
import { ServerStatusDialog } from "./ServerStatusDialog";

export type ServerWorkspacePhase = "connecting" | "loading" | "reconnecting" | "waiting" | "updating" | "blocked";

/** What the desktop and the web know about a server that is not ready yet. */
export interface ServerWorkspaceState {
  updating: boolean;
  blocked: boolean;
  /** The connection failed and waits before it tries again. */
  waiting?: boolean;
  /** The server is online or connecting, and its workspace loads. */
  loading: boolean;
  /** The workspace was on screen before, so the notice reconnects instead of connecting. */
  hasContent: boolean;
}

/** The phase that the notice shows, in order of priority. */
export function serverWorkspacePhase(state: ServerWorkspaceState): ServerWorkspacePhase {
  if (state.updating) return "updating";
  if (state.blocked) return "blocked";
  if (state.waiting) return "waiting";
  if (state.loading) return "loading";
  return state.hasContent ? "reconnecting" : "connecting";
}

export interface ServerConnectionNoticeProps {
  name: string;
  phase: ServerWorkspacePhase;
  initial: boolean;
  remainingSeconds?: number;
  busy?: boolean;
  detail?: string | null;
  /** The code of the failure in `detail`, for a user to copy into a report. */
  reference?: string | null;
  /** The OpenBot version that the server restarts into, while it updates. */
  updateVersion?: string | null;
  /** Removes Details, for a notice that is not about the server connection. */
  hideDetails?: boolean;
  onRetry: () => void;
}

/** Connection feedback stays visible until the workspace can answer the user's actions. */
export function ServerConnectionNotice(props: ServerConnectionNoticeProps) {
  const { t } = useText();
  const since = Date.now();
  const [detailsOpen, setDetailsOpen] = createSignal(false);
  const title = () => {
    switch (props.phase) {
      case "updating":
        return t("server.connection.updating", { name: props.name });
      case "loading":
        return t("server.connection.loading", { name: props.name });
      case "connecting":
        return t("server.connection.connecting", { name: props.name });
      case "blocked":
        return t("server.connection.blocked", { name: props.name });
      default:
        return t("server.connection.reconnecting", { name: props.name });
    }
  };
  const detail = () =>
    props.detail ??
    (props.remainingSeconds
      ? t("server.connection.nextRetry", { seconds: props.remainingSeconds })
      : props.initial
        ? t("server.connection.loadingHint")
        : t("server.connection.cachedHint"));
  const actions = () => (
    <>
      <Button variant="outline" disabled={props.busy} onClick={() => props.onRetry()}>
        {t("server.connection.retry")}
      </Button>
      <Show when={!props.hideDetails}>
        <Button variant="ghost" onClick={() => setDetailsOpen(true)}>
          {t("server.connection.details")}
        </Button>
      </Show>
      <ServerStatusDialog
        open={detailsOpen()}
        onClose={() => setDetailsOpen(false)}
        name={props.name}
        title={title()}
        phase={props.phase}
        initial={props.initial}
        updateVersion={props.updateVersion ?? null}
        remainingSeconds={props.remainingSeconds ?? 0}
        detail={props.detail ?? null}
        reference={props.reference ?? null}
        since={since}
      />
    </>
  );
  return (
    <Show
      when={props.initial}
      fallback={
        <section class="server-connection-notice" role="status" aria-live="polite">
          <div>
            <p>{title()}</p>
            <p class="server-connection-detail">{detail()}</p>
            <ErrorReference reference={props.reference} />
          </div>
          <div class="server-connection-actions">{actions()}</div>
        </section>
      }
    >
      <AppLoadingScreen
        label={title()}
        title={title()}
        detail={detail()}
        reference={props.reference ?? null}
        actions={actions()}
      />
    </Show>
  );
}

// A history that loads faster than this does not cover the chat, so a fast switch does not flash.
const CONVERSATION_LOADING_DELAY_MS = 150;

export interface ConversationLoadNoticeProps {
  /** The agent whose history loads. */
  name: string;
  /** The first page of the history is loading. */
  loading: boolean;
  /** Why the history did not load. The notice then shows Retry. */
  error: string | null;
  onRetry: () => void;
}

/**
 * While an agent's history loads for the first time, the lilac plush of the app loading screen covers
 * the chat and watches its balls, and the screen fades when the history is ready. A failed load shows the notice with Retry.
 */
export function ConversationLoadNotice(props: ConversationLoadNoticeProps) {
  const { t } = useText();
  const waiting = () => props.loading && !props.error;
  // Each wait gets its own screen: a screen that started its exit cannot load again.
  const [screen, setScreen] = createSignal<number | null>(null);
  // The screen that started its exit. It stays ready, so a new wait does not stop its exit.
  const [exiting, setExiting] = createSignal<number | null>(null);
  let screens = 0;
  createEffect(waiting, (current) => {
    if (!current) {
      setExiting(untrack(screen));
      return;
    }
    const timer = setTimeout(() => {
      screens += 1;
      setScreen(screens);
    }, CONVERSATION_LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  });
  return (
    <>
      <Show when={screen()} keyed>
        {(key) => (
          <AppLoadingScreen
            scene="thinking"
            ready={key === exiting() || !waiting()}
            label={t("server.connection.loading", { name: props.name })}
            title={t("server.connection.loading", { name: props.name })}
            onExited={() => setScreen((current) => (current === key ? null : current))}
          />
        )}
      </Show>
      <Show when={props.error}>
        {(error) => (
          <ServerConnectionNotice
            name={props.name}
            phase="blocked"
            initial={false}
            detail={error()}
            hideDetails
            onRetry={props.onRetry}
          />
        )}
      </Show>
    </>
  );
}

/** A failed optional read does not prevent work in the loaded workspace. */
export function ServerPanelLoadNotice(props: { busy: boolean; onRetry: () => void }) {
  const { t } = useText();
  return (
    <section class="server-connection-notice" role="status">
      <p>{t("server.connection.panelsFailed")}</p>
      <Button variant="outline" disabled={props.busy} onClick={() => props.onRetry()}>
        {t("server.connection.retry")}
      </Button>
    </section>
  );
}
