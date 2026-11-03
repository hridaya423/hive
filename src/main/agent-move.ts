import { readFile, rm } from "node:fs/promises";
import {
  type AgentBackupModelSettings,
  type AgentProviderId,
  decodeAgentBackupModelSettings,
  decodeRemoteInstanceTransferResult,
  decodeRemoteInstanceTransferSummary,
  type ExportInstanceInput,
} from "@openbot/contracts/ipc";
import { TEAM_API_ROUTES } from "@openbot/contracts/team-api-routes";
import {
  AGENT_BACKUP_MODELS_CAPABILITY,
  AGENT_BACKUP_MODELS_ROUTES,
} from "@openbot/contracts/team-protocol/agent-backup-models-v1";
import { AGENT_HIDDEN_CAPABILITY, AGENT_HIDDEN_ROUTES } from "@openbot/contracts/team-protocol/agent-hidden-v1";
import type { TeamCurrentCapability } from "@openbot/contracts/team-protocol/current";
import {
  INSTANCE_TRANSFER_CAPABILITY,
  INSTANCE_TRANSFER_ROUTES,
} from "@openbot/contracts/team-protocol/instance-transfer-v1";
import { sourceText } from "@openbot/i18n/source";
import { Effect, Schema } from "effect";
import type { AgentService } from "../backend/agent-service";
import type { SidebarLayoutStore } from "../backend/sidebar-layout-store";
import type { AgentHostSettingsService } from "./agent-host-settings";
import type { InstanceTransferService } from "./instance-transfer-service";
import { decodeHiddenAgentsFromHost, decodeRoutines } from "./remote-agent-decoding";
import { decodeVoid } from "./remote-host-decoding";
import type { RemoteServerManager } from "./remote-server-manager";

class AgentMoveFailed extends Schema.TaggedError<AgentMoveFailed>()("AgentMoveFailed", {
  step: Schema.String,
  cause: Schema.Defect(),
}) {}

interface MovedAgent {
  agentId: string;
  name: string;
  warnings: string[];
  signIn: AgentProviderId[];
}

interface TransferCounts {
  routineCount: number;
  memoryCount: number;
}

export interface MoveHost {
  readonly name: string;
  readonly counts: (agentId: string) => Effect.Effect<TransferCounts, AgentMoveFailed>;
  readonly exportAgent: (agentId: string) => Effect.Effect<Uint8Array, AgentMoveFailed>;
  readonly importAgent: (bytes: Uint8Array) => Effect.Effect<MovedAgent, AgentMoveFailed>;
  readonly backupModels: (agentId: string) => Effect.Effect<AgentBackupModelSettings | null, AgentMoveFailed>;
  readonly setBackupModels: (
    agentId: string,
    settings: AgentBackupModelSettings,
  ) => Effect.Effect<void, AgentMoveFailed>;
  readonly routineIds: (agentId: string) => Effect.Effect<string[], AgentMoveFailed>;
  readonly deleteRoutine: (agentId: string, routineId: string) => Effect.Effect<void, AgentMoveFailed>;
  readonly deleteAgent: (agentId: string) => Effect.Effect<void, AgentMoveFailed>;
  readonly hideAgent: (agentId: string) => Effect.Effect<void, AgentMoveFailed>;
}

const exportOne = (agentId: string): ExportInstanceInput => ({
  agentIds: [agentId],
  includeFiles: true,
  includeSettings: false,
});

const failAt =
  (step: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, AgentMoveFailed, R> =>
    effect.pipe(Effect.mapError((cause) => new AgentMoveFailed({ step, cause })));

const attempt = <A>(step: string, run: () => A | Promise<A>): Effect.Effect<A, AgentMoveFailed> =>
  Effect.tryPromise({ try: async () => run(), catch: (cause) => new AgentMoveFailed({ step, cause }) });

export interface LocalMoveHostDependencies {
  name: string;
  agents: Pick<AgentService, "listRoutines" | "deleteRoutine" | "deleteAgent" | "setAgentHidden">;
  hostSettings: Pick<AgentHostSettingsService, "readBackupModels" | "updateBackupModels">;
  instanceTransfer: Pick<InstanceTransferService, "summary" | "exportForMember" | "stageUpload" | "apply">;
  sidebarLayout: Pick<SidebarLayoutStore, "removeAgent">;
}

const LOCAL_MOVE_OWNER = "agent-move";

export function localMoveHost({
  name,
  agents,
  hostSettings,
  instanceTransfer,
  sidebarLayout,
}: LocalMoveHostDependencies): MoveHost {
  return {
    name,
    counts: (agentId) =>
      instanceTransfer.summary().pipe(
        failAt("summary"),
        Effect.flatMap((summary) => countsOf(summary.agents, agentId)),
      ),
    exportAgent: (agentId) =>
      Effect.acquireUseRelease(
        instanceTransfer.exportForMember(exportOne(agentId)).pipe(failAt("export")),
        (path) => attempt("export", async () => new Uint8Array(await readFile(path))),
        (path) => Effect.promise(() => rm(path, { force: true })),
      ),
    importAgent: (bytes) =>
      Effect.gen(function* () {
        const preview = yield* instanceTransfer
          .stageUpload(() => Promise.resolve(bytes), LOCAL_MOVE_OWNER)
          .pipe(failAt("stage"));
        const key = preview.agents[0]?.key;
        if (key === undefined)
          return yield* new AgentMoveFailed({ step: "stage", cause: new Error(preview.warnings.join(" ")) });
        const result = yield* instanceTransfer
          .apply({ token: preview.token, keys: [key], includeSettings: false }, LOCAL_MOVE_OWNER)
          .pipe(failAt("apply"));
        const created = result.agents[0];
        if (!created)
          return yield* new AgentMoveFailed({
            step: "apply",
            cause: new Error(result.skipped.map((item) => item.reason).join(" ")),
          });
        return { agentId: created.id, name: created.name, warnings: result.warnings, signIn: result.signIn };
      }),
    backupModels: (agentId) => attempt("backup models", () => hostSettings.readBackupModels(agentId)),
    setBackupModels: (agentId, settings) =>
      hostSettings
        .updateBackupModels({ agentId, backupModels: settings.backupModels })
        .pipe(failAt("backup models"), Effect.asVoid),
    routineIds: (agentId) => attempt("routines", () => agents.listRoutines(agentId).map((routine) => routine.id)),
    deleteRoutine: (agentId, routineId) => agents.deleteRoutine({ agentId, routineId }).pipe(failAt("delete routine")),
    deleteAgent: (agentId) =>
      agents.deleteAgent(agentId).pipe(
        failAt("delete agent"),
        Effect.andThen(() => sidebarLayout.removeAgent(agentId).pipe(failAt("delete agent"))),
      ),
    hideAgent: (agentId) => agents.setAgentHidden({ agentId, hidden: true }).pipe(failAt("hide agent"), Effect.asVoid),
  };
}

export type RemoteMoveTransport = Pick<
  RemoteServerManager,
  "request" | "supportsCapability" | "stageInstanceTransfer" | "downloadInstanceTransfer"
>;

export interface RemoteMoveHostOptions {
  uploadTimeoutMs: number;
  timezone: string;
}

export function remoteMoveHost(
  remote: RemoteMoveTransport,
  serverId: string,
  name: string,
  { uploadTimeoutMs, timezone }: RemoteMoveHostOptions,
): MoveHost {
  const supported = (capability: TeamCurrentCapability, step: string): Effect.Effect<void, AgentMoveFailed> =>
    remote.supportsCapability(serverId, capability)
      ? Effect.void
      : Effect.fail(
          new AgentMoveFailed({ step, cause: new Error(sourceText("error.team.agentMoveUnsupported", { name })) }),
        );
  return {
    name,
    counts: (agentId) =>
      supported(INSTANCE_TRANSFER_CAPABILITY, "summary").pipe(
        Effect.andThen(() =>
          remote
            .request(serverId, INSTANCE_TRANSFER_ROUTES.summary, decodeRemoteInstanceTransferSummary, {
              method: "POST",
              body: {},
            })
            .pipe(failAt("summary")),
        ),
        Effect.flatMap((summary) => countsOf(summary.agents, agentId)),
      ),
    exportAgent: (agentId) =>
      supported(INSTANCE_TRANSFER_CAPABILITY, "export").pipe(
        Effect.andThen(() => remote.downloadInstanceTransfer(serverId, exportOne(agentId)).pipe(failAt("export"))),
      ),
    importAgent: (bytes) =>
      Effect.gen(function* () {
        yield* supported(INSTANCE_TRANSFER_CAPABILITY, "stage");
        const preview = yield* remote.stageInstanceTransfer(serverId, bytes).pipe(failAt("stage"));
        const key = preview.agents[0]?.key;
        if (key === undefined)
          return yield* new AgentMoveFailed({ step: "stage", cause: new Error(preview.warnings.join(" ")) });
        const result = yield* remote
          .request(serverId, INSTANCE_TRANSFER_ROUTES.apply, decodeRemoteInstanceTransferResult, {
            method: "POST",
            body: { token: preview.token, keys: [key], includeSettings: false, timezone },
            timeoutMs: uploadTimeoutMs,
          })
          .pipe(
            failAt("apply"),
            Effect.tapError(() =>
              remote
                .request(serverId, INSTANCE_TRANSFER_ROUTES.discard, decodeVoid, {
                  method: "POST",
                  body: { token: preview.token },
                })
                .pipe(Effect.ignore),
            ),
          );
        const created = result.agents[0];
        if (!created)
          return yield* new AgentMoveFailed({
            step: "apply",
            cause: new Error(result.skipped.map((item) => item.reason).join(" ")),
          });
        return { agentId: created.agentId, name: created.name, warnings: result.warnings, signIn: result.signIn };
      }),
    backupModels: (agentId) =>
      remote.supportsCapability(serverId, AGENT_BACKUP_MODELS_CAPABILITY)
        ? remote
            .request(serverId, AGENT_BACKUP_MODELS_ROUTES.settings, decodeAgentBackupModelSettings, {
              method: "POST",
              body: { agentId },
            })
            .pipe(failAt("backup models"))
        : Effect.succeed(null),
    setBackupModels: (agentId, settings) =>
      supported(AGENT_BACKUP_MODELS_CAPABILITY, "backup models").pipe(
        Effect.andThen(() =>
          remote
            .request(serverId, AGENT_BACKUP_MODELS_ROUTES.update, decodeAgentBackupModelSettings, {
              method: "POST",
              body: { agentId, backupModels: settings.backupModels },
            })
            .pipe(failAt("backup models"), Effect.asVoid),
        ),
      ),
    routineIds: (agentId) =>
      remote.request(serverId, TEAM_API_ROUTES.agent.routines(agentId), decodeRoutines).pipe(
        failAt("routines"),
        Effect.map((routines) => routines.map((routine) => routine.id)),
      ),
    deleteRoutine: (agentId, routineId) =>
      remote
        .request(serverId, TEAM_API_ROUTES.agent.routine(agentId, routineId), decodeVoid, { method: "DELETE" })
        .pipe(failAt("delete routine"), Effect.asVoid),
    deleteAgent: (agentId) =>
      remote
        .request(serverId, TEAM_API_ROUTES.agent.one(agentId), decodeVoid, { method: "DELETE" })
        .pipe(failAt("delete agent"), Effect.asVoid),
    hideAgent: (agentId) =>
      supported(AGENT_HIDDEN_CAPABILITY, "hide agent").pipe(
        Effect.andThen(() =>
          remote
            .request(serverId, AGENT_HIDDEN_ROUTES.set, decodeHiddenAgentsFromHost, {
              method: "POST",
              body: { agentId, hidden: true },
            })
            .pipe(failAt("hide agent"), Effect.asVoid),
        ),
      ),
  };
}

function countsOf(agents: readonly (TransferCounts & { id: string })[], agentId: string) {
  const found = agents.find((agent) => agent.id === agentId);
  return found
    ? Effect.succeed({ routineCount: found.routineCount, memoryCount: found.memoryCount })
    : Effect.fail(
        new AgentMoveFailed({ step: "summary", cause: new Error(sourceText("error.agent.unknown", { id: agentId })) }),
      );
}

export interface MoveAgentInput {
  source: MoveHost;
  target: MoveHost;
  agentId: string;
}

export const moveAgent = Effect.fn("AgentMove.move")(function* ({ source, target, agentId }: MoveAgentInput) {
  const expected = yield* source.counts(agentId);
  const backups = yield* source.backupModels(agentId);
  const bytes = yield* source.exportAgent(agentId);
  const created = yield* target.importAgent(bytes);
  const warnings = [...created.warnings];

  yield* Effect.gen(function* () {
    const actual = yield* target.counts(created.agentId);
    if (actual.routineCount !== expected.routineCount || actual.memoryCount !== expected.memoryCount)
      return yield* new AgentMoveFailed({
        step: "confirm",
        cause: new Error(sourceText("error.team.agentMoveIncomplete", { name: target.name })),
      });
    yield* source.hideAgent(agentId);
  }).pipe(
    Effect.tapError(() =>
      target.deleteAgent(created.agentId).pipe(
        Effect.mapError(
          () =>
            new AgentMoveFailed({
              step: "rollback",
              cause: new Error(sourceText("error.team.agentMoveCopyKept", { name: target.name })),
            }),
        ),
      ),
    ),
  );

  if (backups?.backupModels) {
    yield* target
      .setBackupModels(created.agentId, backups)
      .pipe(
        Effect.catch(() =>
          Effect.sync(() => void warnings.push(sourceText("error.team.agentMoveBackupModels", { name: target.name }))),
        ),
      );
  }
  const routineIds = yield* source.routineIds(agentId).pipe(Effect.orElseSucceed(() => []));
  for (const routineId of routineIds) yield* source.deleteRoutine(agentId, routineId).pipe(Effect.ignore);

  return { agentId: created.agentId, name: created.name, warnings, signIn: created.signIn } satisfies MovedAgent;
});
