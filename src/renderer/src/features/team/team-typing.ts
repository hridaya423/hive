import { throttleTrailing } from "../../rate-limit";
import { teamPort } from "./team-port";

const TYPING_INTERVAL_MS = 2_000;

/**
 * Telling the team server whether the user is composing. Its own module because two owners with
 * different lifetimes need it and neither can import the other: the server-scoped conversation
 * domain, and the controller in `app-providers.tsx`. One IPC at most every two seconds, and the
 * last state always follows. The server forgets a typing mark after five seconds.
 */
export const notifyTeamTyping = throttleTrailing((agentId: string, typing: boolean): void => {
  void teamPort()
    .servers.setTyping({ agentId: typing ? agentId : null, typing })
    .catch(() => {
      // Typing state is optional and must not interrupt message composition.
    });
}, TYPING_INTERVAL_MS);
