import type { AgentProviderId } from "@openbot/contracts/agent-providers";
import type { CauseCode } from "@openbot/user-errors/failure-cause";

export interface FailureContext {
  causeCode?: CauseCode;
  provider?: AgentProviderId;
  model?: string | null;
  turnId?: string | null;
  severity?: "error" | "warning";
}
