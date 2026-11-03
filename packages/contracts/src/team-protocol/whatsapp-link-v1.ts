// Frozen optional whatsapp-link-v1 wire contract.
//
// What it grants, recorded here because freezing it makes it permanent: an owner or admin of a
// joined server links, unlinks and sets the allowed chats of the WhatsApp account of the host from
// their own computer. The host holds the login and the connection to WhatsApp; the client only
// shows the state. `overview` answers the connections, the allowed chats, and `qr`: the pairing code
// of a link that waits for the phone, or null. The client draws it and the user scans it in WhatsApp
// under Linked devices. The code is a short-lived secret of the host's login. It is sent to an owner
// or admin only, and no route carries a key or a message. A member cannot use any route;
// `requireAdmin` on the host is the only gate. `connectors-v1` stays frozen to Slack, Discord and
// Telegram. `state` and `credentials` are text, so a later host state does not break an older client.
// Widening any of it needs a second capability string.
import {
  adminRoute,
  boolean,
  empty,
  fields,
  identifier,
  list,
  nullable,
  type OptionalRouteCodec,
  oneOf,
  string,
} from "./admin-wire";

export const WHATSAPP_LINK_CAPABILITY = "whatsapp-link-v1";

export const WHATSAPP_LINK_ROUTES = {
  overview: "/v1/admin/connectors/whatsapp/overview",
  connect: "/v1/admin/connectors/whatsapp/connect",
  disconnect: "/v1/admin/connectors/whatsapp/disconnect",
  reconnect: "/v1/admin/connectors/whatsapp/reconnect",
  enabled: "/v1/admin/connectors/whatsapp/enabled",
  orchestrator: "/v1/admin/connectors/whatsapp/orchestrator",
  allowedChats: "/v1/admin/connectors/whatsapp/allowed-chats",
} as const;

const connection = fields({
  workspaceId: identifier,
  platform: oneOf("whatsapp"),
  enabled: boolean,
  state: string(64),
  workspaceName: string(256),
  botUserId: nullable(string(256)),
  missingScopes: list(string(64), 32),
  retryAt: nullable(string(64)),
  credentials: string(64),
  orchestratorAgentId: nullable(identifier),
});
const chats = list(string(64), 64);
const overview = fields({ connections: list(connection, 64), qr: nullable(string(1_024)), allowedChats: chats });

export const WHATSAPP_LINK_CODECS: ReadonlyMap<string, OptionalRouteCodec> = new Map([
  [WHATSAPP_LINK_ROUTES.overview, adminRoute(empty, overview)],
  [WHATSAPP_LINK_ROUTES.connect, adminRoute(empty, empty)],
  [WHATSAPP_LINK_ROUTES.disconnect, adminRoute(empty, empty)],
  [WHATSAPP_LINK_ROUTES.reconnect, adminRoute(empty, empty)],
  [WHATSAPP_LINK_ROUTES.enabled, adminRoute(fields({ enabled: boolean }), empty)],
  [
    WHATSAPP_LINK_ROUTES.orchestrator,
    adminRoute(empty, fields({ agentId: identifier, sectionId: nullable(identifier) })),
  ],
  [WHATSAPP_LINK_ROUTES.allowedChats, adminRoute(fields({ chats }), overview)],
]);
