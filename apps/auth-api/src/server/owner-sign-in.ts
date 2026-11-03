import type { WorkerBindings } from "./types";

export const TAILNET_LOGIN_HEADER = "Tailscale-User-Login";

/**
 * The owner's email when this request is the owner's, and null otherwise. The Worker listens on
 * loopback only, so the source address proves nothing. `tailscale serve` adds the login header
 * after it has identified the caller, and never Funnel, which would let the public reach the Worker.
 */
export function ownerSignInEmail(
  headers: Headers,
  bindings: Pick<WorkerBindings, "OWNER_EMAIL" | "OWNER_TAILNET_LOGIN">,
): string | null {
  const email = bindings.OWNER_EMAIL?.trim();
  const owner = bindings.OWNER_TAILNET_LOGIN?.trim().toLowerCase();
  const login = headers.get(TAILNET_LOGIN_HEADER)?.trim().toLowerCase();
  return email && owner && login === owner ? email : null;
}
