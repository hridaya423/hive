import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { Effect } from "effect";
import { runApiResponse } from "../../../server/effect-runtime";
import { ownerSignInEmail } from "../../../server/owner-sign-in";
import { apiError, authErrorResponse, json, requestAuthService } from "../../../server/request-auth";
import { requestSourceIp } from "../../../server/source-ip";
import { requireWorkerBindings } from "../../../server/types";

export const Route = createFileRoute("/v1/auth/owner")({
  server: {
    handlers: {
      POST: ({ request }) =>
        runApiResponse(
          Effect.gen(function* () {
            const email = ownerSignInEmail(request.headers, requireWorkerBindings(env));
            if (!email) return apiError(403, "owner_sign_in_forbidden", "This request is not from the owner.");
            return json(yield* requestAuthService().signInOwner(email, requestSourceIp(request)));
          }),
          authErrorResponse,
        ),
    },
  },
});
