import type { AppTextKey } from "@openbot/i18n";
import { classifyFailure } from "@openbot/telemetry";
import type { ConnectorDetail } from "@openbot/ui/features/connectors/ConnectorDetailPanel";
import type { ConnectorId } from "@openbot/ui/features/connectors/connectors";
import { currentText } from "@openbot/ui/text";
import { createSignal, onCleanup, onSettled } from "solid-js";
import { actionToast } from "../../action-toast";
import { type DesktopAnalyticsProperties, desktopAnalytics } from "../../analytics";

/** What analytics records about a connector action. */
export type ConnectorAnalyticsAction = DesktopAnalyticsProperties<"connector_action">["action"];

/**
 * One connector of one place: this computer or a joined server. Every surface reads it in the same
 * way, so a new connector needs a controller and a panel, and no surface code.
 */
export interface ConnectorController {
  readonly id: ConnectorId;
  /** False until the first read, while the page has nothing to show. */
  ready: () => boolean;
  /** False when this OpenBot build cannot use the connector, such as GitHub with no GitHub App. */
  available: () => boolean;
  busy: () => boolean;
  /** The page of the connector. Its props are getters, so the page follows the controller. */
  readonly detail: ConnectorDetail;
  /** Starts a new connection in one click, from a card. Absent when the page must ask for input first. */
  readonly connect?: (() => void) | undefined;
  /** Reads the state again, for a view that opens. */
  reload: () => void;
  /**
   * Follows the state while a view shows it, for a connector whose state changes with no event from
   * main. Call the result to stop.
   */
  watch: () => () => void;
}

/** A controller with no state of its own to follow. */
export const NO_WATCH = () => () => undefined;

/**
 * The actions of one controller. Each action is one attempt. An action that waits locks every
 * button until it ends. One that does not wait, such as Cancel, starts a new attempt and frees the
 * buttons at once: the late answer of the action that it cancels must not replace a newer state.
 * A failure shows one toast with `failed`. An action with `track` records its result for
 * `connector`. Call it inside the owner of the controller.
 */
export function createConnectorActions(failed: AppTextKey, connector: ConnectorId) {
  const [busy, setBusy] = createSignal(false);
  let attempt = 0;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  /** Shows the toast of a failure. */
  const report = (error: unknown) => {
    const { t, errorMessage } = currentText();
    actionToast.error(t(failed), {
      description: errorMessage(error, t(failed)),
      report: { operation: "other", source: "action", cause_code: classifyFailure(error) },
    });
  };
  const run = <T>(
    action: () => Promise<T>,
    options: {
      waits?: boolean;
      /** The result of the newest attempt, while the owner lives. */
      done?: (result: T) => void;
      /** After the newest attempt, also after a failure. */
      settled?: () => void;
      /** Records the result in analytics, also when a newer attempt replaced this one. */
      track?: ConnectorAnalyticsAction;
    } = {},
  ) => {
    const waits = options.waits ?? true;
    if (waits && busy()) return;
    const current = ++attempt;
    setBusy(waits);
    const track = options.track;
    void action()
      .then((result) => {
        if (track) desktopAnalytics.track("connector_action", { connector, action: track, result: "succeeded" });
        if (!disposed && current === attempt) options.done?.(result);
      })
      .catch((error: unknown) => {
        if (track) desktopAnalytics.track("connector_action", { connector, action: track, result: "failed" });
        if (disposed || current !== attempt) return;
        report(error);
      })
      .finally(() => {
        if (disposed || current !== attempt) return;
        setBusy(false);
        options.settled?.();
      });
  };
  return { busy, run, report, disposed: () => disposed };
}

/**
 * Reads the status of a connection once and then follows the port's `changed` event into
 * `setStatus`. Call it inside the owner of the controller, after `createConnectorActions`.
 */
export function createConnectorStatus<S>(
  setStatus: (status: S) => unknown,
  port: () => { status: () => Promise<S>; onChanged: (listener: (status: S) => void) => () => void },
  disposed: () => boolean,
) {
  /** False until the first status read ends. Until then, the page does not show the default status. */
  const [read, setRead] = createSignal(false);
  /** Why the last status read failed, until a newer status comes. While it is set, the state is not known. */
  const [statusError, setStatusError] = createSignal<string | null>(null);
  /** Counts the statuses that came, so a failed read does not hide a status that came after it started. */
  let statuses = 0;
  const show = (next: S) => {
    statuses += 1;
    setStatus(next);
    setStatusError(null);
  };
  const unsubscribe = port().onChanged((next) => {
    if (!disposed()) show(next);
  });
  const reload = () => {
    const before = statuses;
    void port()
      .status()
      .then((next) => {
        if (!disposed()) show(next);
      })
      .catch((error: unknown) => {
        if (disposed() || before !== statuses) return;
        const { t, errorMessage } = currentText();
        setStatusError(errorMessage(error, t("connector.readFailed")));
      })
      .finally(() => {
        if (!disposed()) setRead(true);
      });
  };
  onSettled(reload);
  onCleanup(unsubscribe);
  return { read, statusError, show, reload };
}
