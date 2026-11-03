import { type BitwardenConnectorStatus, DISCONNECTED_BITWARDEN_CONNECTOR } from "@openbot/contracts/ipc";
import { createSignal } from "solid-js";
import { type BitwardenConnectorPort, bitwardenConnectorPort } from "./bitwarden-connector-port";
import {
  type ConnectorController,
  createConnectorActions,
  createConnectorStatus,
  NO_WATCH,
} from "./connector-controller";

/**
 * The Bitwarden connection of this computer or of a joined server. Reads the status once and then
 * follows the port's `changed` event. The page asks for a session key, or on a joined server for an
 * API key and the master password, so a card has no one-click connect.
 */
export function createBitwardenConnector(
  port: () => BitwardenConnectorPort = bitwardenConnectorPort,
  /** The joined server whose connection this is, or undefined for this computer's. */
  hostName?: () => string | undefined,
): ConnectorController {
  const actions = createConnectorActions("connector.bitwarden.actionFailed");
  const [status, setStatus] = createSignal<BitwardenConnectorStatus>(DISCONNECTED_BITWARDEN_CONNECTOR);
  const { read, statusError, show, reload } = createConnectorStatus(setStatus, port, actions.disposed);

  const run = (action: () => Promise<BitwardenConnectorStatus>) => actions.run(action, { done: show });

  return {
    id: "bitwarden",
    ready: read,
    available: () => true,
    busy: actions.busy,
    reload,
    watch: NO_WATCH,
    detail: {
      id: "bitwarden",
      props: {
        get status() {
          return status();
        },
        get busy() {
          return actions.busy();
        },
        get statusError() {
          return statusError();
        },
        get hostName() {
          return hostName?.();
        },
        onRetry: reload,
        onConnect: (key) => run(() => port().connect(key)),
        onConnectHost: (input) => run(() => port().connectHost(input)),
        onDisconnect: () => run(() => port().disconnect()),
      },
    },
  };
}
