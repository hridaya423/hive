import { Effect, Result } from "effect";
import { type AuthRetentionResult, pruneExpiredAuthData } from "./auth-data-retention";
import { permanentTrailingSlashRedirect } from "./canonical-redirect";
import { runApiEffect } from "./effect-runtime";
import { enforceMarketplaceIngress, MarketplaceRateLimitError } from "./marketplace-request-policy";
import { deliverPendingRemoteAuthEvents, type RemoteAuthEventBindings } from "./remote-control-plane";
import { checkSignalEntry, SIGNAL_ENTRY_CRON, type SignalEntryBindings } from "./signal-entry-failover";
import type { WorkerBindings } from "./types";

type WorkerFetch = (request: Request) => Response | Promise<Response>;
type AuthDataPruner = typeof pruneExpiredAuthData;
type RetentionLogger = (result: AuthRetentionResult) => void;
type WorkerExecutionContext = Pick<ExecutionContext, "waitUntil">;
type RemoteAuthEventDelivery = typeof deliverPendingRemoteAuthEvents;

export function createWorkerHandler(
  fetchHandler: WorkerFetch,
  prune: AuthDataPruner = pruneExpiredAuthData,
  log: RetentionLogger = logRetentionResult,
  deliverRemoteAuthEvents: RemoteAuthEventDelivery = deliverPendingRemoteAuthEvents,
) {
  return {
    async fetch(
      request: Request,
      bindings: Pick<WorkerBindings, "MARKETPLACE_INGRESS_RATE_LIMITER">,
      context?: WorkerExecutionContext,
    ) {
      const rateLimited = await runApiEffect(
        enforceMarketplaceIngress(request, bindings).pipe(
          Effect.as(null),
          Effect.catchIf(
            (error) => error instanceof MarketplaceRateLimitError,
            (error) =>
              Effect.succeed(
                Response.json(
                  { error: { code: error.code, message: error.message } },
                  {
                    status: error.status,
                    headers: {
                      "Cache-Control": "no-store",
                      "Retry-After": String(error.retryAfterSeconds),
                      "X-Content-Type-Options": "nosniff",
                    },
                  },
                ),
              ),
          ),
        ),
      );
      if (rateLimited) return rateLimited;
      const response = Promise.resolve(fetchHandler(request)).then((result) =>
        permanentTrailingSlashRedirect(request, result),
      );
      if (context && isEmailSignInStart(request)) {
        context.waitUntil(
          response.then(
            () => undefined,
            () => undefined,
          ),
        );
      }
      return response;
    },
    async scheduled(
      controller: Pick<ScheduledController, "scheduledTime"> & Partial<Pick<ScheduledController, "cron">>,
      bindings: RemoteAuthEventBindings & Partial<SignalEntryBindings>,
    ) {
      if (controller.cron === SIGNAL_ENTRY_CRON) {
        await runSignalEntryCheck(bindings);
        return;
      }
      const now = controller.scheduledTime;
      const [retention] = await runApiEffect(
        Effect.all(
          [
            Effect.exit(isDailyRetentionRun(now) ? prune(bindings.DB, now) : Effect.succeed(null)),
            Effect.exit(deliverRemoteAuthEvents(bindings, now)),
          ],
          { concurrency: "unbounded" },
        ).pipe(Effect.flatMap(([retentionExit, deliveryExit]) => Effect.all([retentionExit, deliveryExit]))),
      );
      if (retention) log(retention);
    },
  } satisfies ExportedHandler<WorkerBindings>;
}

/** Logs only the result and the error tag: the Cloudflare token never reaches a log. */
async function runSignalEntryCheck(bindings: Partial<SignalEntryBindings>): Promise<void> {
  const result = await Effect.runPromise(
    Effect.result(checkSignalEntry(bindings, { fetch: (input, init) => fetch(input, init) })),
  );
  if (Result.isFailure(result)) {
    console.error("Signal entry check failed.", { operation: result.failure.operation, status: result.failure.status });
    return;
  }
  const check = result.success;
  if (check.status === "moved") console.warn("Signal entry moved.", check);
  else if (check.status === "kept" || check.status === "unknown") console.warn("Signal entry not changed.", check);
}

function isEmailSignInStart(request: Request): boolean {
  return (
    request.method === "POST" &&
    ["/v1/auth/email/start", "/api/browser/email/start"].includes(new URL(request.url).pathname)
  );
}

function isDailyRetentionRun(scheduledTime: number): boolean {
  const scheduled = new Date(scheduledTime);
  return scheduled.getUTCHours() === 0 && scheduled.getUTCMinutes() === 0;
}

function logRetentionResult(result: AuthRetentionResult): void {
  console.info("Auth data retention completed.", result);
}
