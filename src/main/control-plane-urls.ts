import { FORK_CONFIG } from "@openbot/contracts/fork-config";

/**
 * The account service and Signal that this app talks to. A development build uses its own local
 * services unless the environment names others. A packaged build uses the private control plane
 * that `fork.config.json` names.
 */
export function controlPlaneUrls(
  environment: NodeJS.ProcessEnv,
  packaged: boolean,
): { authApiUrl: string | undefined; signalUrl: string | undefined } {
  return {
    authApiUrl: environment.OPENBOT_AUTH_API_URL ?? (packaged ? FORK_CONFIG.controlPlane.accountApiUrl : undefined),
    signalUrl: environment.OPENBOT_REMOTE_SIGNAL_URL ?? (packaged ? FORK_CONFIG.controlPlane.signalUrl : undefined),
  };
}
