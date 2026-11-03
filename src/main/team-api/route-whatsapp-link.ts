import { decodeSetWhatsAppAllowedChatsInput } from "@openbot/contracts/ipc";
import { WHATSAPP_LINK_CAPABILITY, WHATSAPP_LINK_ROUTES } from "@openbot/contracts/team-protocol/whatsapp-link-v1";
import { sourceText } from "@openbot/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import { WHATSAPP_WORKSPACE_ID } from "../../backend/messaging/whatsapp/whatsapp-session";
import type { TeamApiWhatsAppLink } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireAdmin } from "./request-helpers";

const ROUTES: ReadonlySet<string> = new Set(Object.values(WHATSAPP_LINK_ROUTES));

/**
 * The WhatsApp account of this host, linked, unlinked and given its allowed chats from a joined server.
 * Frozen by `whatsapp-link-v1`. The QR code travels only to an owner or admin, and `requireAdmin` runs on
 * every route.
 */
export async function routeWhatsAppLink(
  context: TeamApiRequestContext,
  whatsapp: TeamApiWhatsAppLink | undefined,
): Promise<RouteOutcome> {
  const { method, url, capabilities, member, request, json } = context;
  if (method !== "POST" || !ROUTES.has(url.pathname)) return "unmatched";
  if (!whatsapp || !capabilities.has(WHATSAPP_LINK_CAPABILITY))
    throw new HttpError(400, sourceText("error.team.whatsappLinkUnsupported"));
  requireAdmin(member);
  // `readJson` has already run the body through the `whatsapp-link-v1` codec.
  const body = await readJson(request);
  switch (url.pathname) {
    case WHATSAPP_LINK_ROUTES.overview:
      return json(200, whatsapp.whatsappOverview());
    case WHATSAPP_LINK_ROUTES.connect:
      await runCauseEffect(whatsapp.connectWhatsApp());
      return json(200, {});
    case WHATSAPP_LINK_ROUTES.disconnect:
      await runCauseEffect(whatsapp.disconnectWhatsApp());
      return json(200, {});
    case WHATSAPP_LINK_ROUTES.reconnect:
      await runCauseEffect(whatsapp.reconnect("whatsapp", WHATSAPP_WORKSPACE_ID, false));
      return json(200, {});
    case WHATSAPP_LINK_ROUTES.enabled:
      await runCauseEffect(whatsapp.setEnabled("whatsapp", WHATSAPP_WORKSPACE_ID, body.enabled === true));
      return json(200, {});
    case WHATSAPP_LINK_ROUTES.orchestrator:
      return json(200, await runCauseEffect(whatsapp.addWhatsAppOrchestrator({})));
    default:
      return json(
        200,
        await runCauseEffect(whatsapp.setWhatsAppAllowedChats(decodeSetWhatsAppAllowedChatsInput(body).chats)),
      );
  }
}
