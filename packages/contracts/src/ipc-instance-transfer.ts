/**
 * Instance transfer: move the agents and app settings of this computer to another OpenBot computer
 * with one `.zip` file. It is a different format from the Grok Bot agent import.
 *
 * Main writes and reads the file. The renderer never receives a path or the file's bytes: it names
 * agents and a token. No secret goes into the file: API keys, sign-ins, connector tokens and the
 * values of MCP variables and headers stay on the computer that made it.
 */

import { type AgentProviderId, isAgentProvider, isAgentProviderRef } from "./agent-providers";
import { INPUT_LIMITS } from "./input-limits";
import { type AvatarHue, isAvatarHue } from "./ipc-agent-identity";
import {
  type AgentImportPreviewAgent,
  type AgentImportSkipped,
  decodeAgentImportPreviewAgent,
  decodeAgentImportSkipped,
  decodeImportMessages,
  isAgentImportKey,
} from "./ipc-agent-import";
import { type ClientAgentSummary, isClientAgentSummary } from "./ipc-agents";
import { isBoundedString, isIdentifier, isNullableBoundedString } from "./ipc-bounded-values";
import { decodeRecord, nonNegativeInteger } from "./ipc-decoding";
import { isBoolean, isString } from "./runtime-values";

export const INSTANCE_TRANSFER_LIMITS = {
  /** The file is read into memory on import, so it stays below 2 GiB. */
  archiveBytes: 2 * 1024 ** 3 - 1,
  files: 50_000,
  appVersion: 64,
} as const;

/** One agent on this computer, as the export screen lists it. */
export interface InstanceTransferAgent {
  id: string;
  name: string;
  title: string;
  avatarSeed: string;
  avatarHue: AvatarHue | null;
  avatarUrl: string | null;
  skillCount: number;
  routineCount: number;
  memoryCount: number;
  /** Workspace files that an export with files carries. */
  fileCount: number;
  fileBytes: number;
}

export interface InstanceTransferSummary {
  agents: InstanceTransferAgent[];
}

export interface ExportInstanceInput {
  agentIds: string[];
  includeFiles: boolean;
  includeSettings: boolean;
}

export interface InstanceExportResult {
  /** False when the user closed the save dialog. */
  saved: boolean;
  /** The name of the saved file, for display. `showExport` reveals it. */
  fileName: string | null;
  warnings: string[];
}

export interface InstanceTransferPreview {
  token: string;
  /** The OpenBot version that made the file. */
  appVersion: string;
  exportedAt: string | null;
  agents: AgentImportPreviewAgent[];
  /** The file carries app settings. */
  hasSettings: boolean;
  warnings: string[];
}

export interface ApplyInstanceTransferInput {
  token: string;
  /** May be empty when only the settings are imported. */
  keys: string[];
  includeSettings: boolean;
}

export interface InstanceTransferResult {
  agents: ClientAgentSummary[];
  skipped: AgentImportSkipped[];
  /** Providers that were signed in on the other computer and are not signed in here. */
  signIn: AgentProviderId[];
  warnings: string[];
}

/** Moves one agent from one server to another, `LOCAL_SERVER_ID` naming this computer's own server. */
export interface MoveAgentInput {
  agentId: string;
  sourceServerId: string;
  targetServerId: string;
}

/** The agent as the target server now holds it. The source keeps a hidden, read-only copy. */
export interface MoveAgentResult {
  agentId: string;
  name: string;
  warnings: string[];
  signIn: AgentProviderId[];
}

function invalid(label: string): never {
  throw new Error(`Invalid ${label}.`);
}

function isUniqueList<T extends string>(
  value: unknown,
  maximum: number,
  item: (entry: unknown) => entry is T,
): value is T[] {
  return Array.isArray(value) && value.length <= maximum && value.every(item) && new Set(value).size === value.length;
}

export function parseExportInstanceInput(value: unknown): ExportInstanceInput {
  const input = decodeRecord(value, "export request");
  if (!isUniqueList(input.agentIds, INPUT_LIMITS.agents, isIdentifier) || input.agentIds.length === 0)
    invalid("agent selection");
  if (!isBoolean(input.includeFiles) || !isBoolean(input.includeSettings)) invalid("export request");
  return { agentIds: input.agentIds, includeFiles: input.includeFiles, includeSettings: input.includeSettings };
}

export function parseApplyInstanceTransferInput(value: unknown): ApplyInstanceTransferInput {
  const input = decodeRecord(value, "import request");
  if (!isIdentifier(input.token)) invalid("import token");
  if (!isUniqueList(input.keys, INPUT_LIMITS.agents, isAgentImportKey)) invalid("agent selection");
  if (!isBoolean(input.includeSettings)) invalid("import request");
  if (input.keys.length === 0 && !input.includeSettings) invalid("import request");
  return { token: input.token, keys: input.keys, includeSettings: input.includeSettings };
}

export function parseMoveAgentInput(value: unknown): MoveAgentInput {
  const input = decodeRecord(value, "move request");
  if (!isIdentifier(input.agentId) || !isIdentifier(input.sourceServerId) || !isIdentifier(input.targetServerId))
    invalid("move request");
  if (input.sourceServerId === input.targetServerId) invalid("move request");
  return { agentId: input.agentId, sourceServerId: input.sourceServerId, targetServerId: input.targetServerId };
}

export function decodeMoveAgentResult(value: unknown): MoveAgentResult {
  const result = decodeRecord(value, "move result");
  if (
    !isIdentifier(result.agentId) ||
    !isBoundedString(result.name, INPUT_LIMITS.agentName) ||
    !isUniqueList(result.signIn, 32, isAgentProvider)
  )
    invalid("move result");
  return {
    agentId: result.agentId,
    name: result.name,
    warnings: decodeImportMessages(result.warnings, "move warnings"),
    signIn: result.signIn,
  };
}

function decodeTransferAgent(value: unknown): InstanceTransferAgent {
  const agent = decodeRecord(value, "transfer agent");
  if (
    !isIdentifier(agent.id) ||
    !isBoundedString(agent.name, INPUT_LIMITS.agentName) ||
    !isBoundedString(agent.title, INPUT_LIMITS.agentTitle) ||
    !isString(agent.avatarSeed) ||
    !(agent.avatarHue === null || isAvatarHue(agent.avatarHue)) ||
    !isNullableBoundedString(agent.avatarUrl, 2048)
  )
    invalid("transfer agent");
  return {
    id: agent.id,
    name: agent.name,
    title: agent.title,
    avatarSeed: agent.avatarSeed,
    avatarHue: agent.avatarHue,
    avatarUrl: agent.avatarUrl,
    skillCount: nonNegativeInteger(agent.skillCount, "transfer agent"),
    routineCount: nonNegativeInteger(agent.routineCount, "transfer agent"),
    memoryCount: nonNegativeInteger(agent.memoryCount, "transfer agent"),
    fileCount: nonNegativeInteger(agent.fileCount, "transfer agent"),
    fileBytes: nonNegativeInteger(agent.fileBytes, "transfer agent"),
  };
}

export function decodeInstanceTransferSummary(value: unknown): InstanceTransferSummary {
  const summary = decodeRecord(value, "transfer summary");
  if (!Array.isArray(summary.agents) || summary.agents.length > INPUT_LIMITS.agents) invalid("transfer summary");
  return { agents: summary.agents.map(decodeTransferAgent) };
}

export function decodeInstanceExportResult(value: unknown): InstanceExportResult {
  const result = decodeRecord(value, "export result");
  if (!isBoolean(result.saved) || !isNullableBoundedString(result.fileName, 255)) invalid("export result");
  return {
    saved: result.saved,
    fileName: result.fileName,
    warnings: decodeImportMessages(result.warnings, "export warnings"),
  };
}

export function decodeInstanceTransferPreview(value: unknown): InstanceTransferPreview | null {
  if (value === null) return null;
  const preview = decodeRecord(value, "transfer preview");
  if (
    !isIdentifier(preview.token) ||
    !isBoundedString(preview.appVersion, INSTANCE_TRANSFER_LIMITS.appVersion) ||
    !isNullableBoundedString(preview.exportedAt, 64) ||
    !Array.isArray(preview.agents) ||
    preview.agents.length > INPUT_LIMITS.agents ||
    !isBoolean(preview.hasSettings)
  )
    invalid("transfer preview");
  return {
    token: preview.token,
    appVersion: preview.appVersion,
    exportedAt: preview.exportedAt,
    agents: preview.agents.map(decodeAgentImportPreviewAgent),
    hasSettings: preview.hasSettings,
    warnings: decodeImportMessages(preview.warnings, "transfer warnings"),
  };
}

export function decodeInstanceTransferResult(value: unknown): InstanceTransferResult {
  const result = decodeRecord(value, "transfer result");
  if (!Array.isArray(result.agents) || !result.agents.every(isClientAgentSummary)) invalid("transfer result");
  if (!isUniqueList(result.signIn, 32, isAgentProvider)) invalid("transfer result");
  return {
    agents: result.agents,
    skipped: decodeAgentImportSkipped(result.skipped, "skipped agent"),
    signIn: result.signIn,
    warnings: decodeImportMessages(result.warnings, "transfer warnings"),
  };
}

/** A remote host's summary: `instance-transfer-v1` carries no avatar addresses. */
export function decodeRemoteInstanceTransferSummary(value: unknown): InstanceTransferSummary {
  const summary = decodeRecord(value, "transfer summary");
  if (!Array.isArray(summary.agents)) invalid("transfer summary");
  return decodeInstanceTransferSummary({
    agents: summary.agents.map((agent) => ({ ...decodeRecord(agent, "transfer agent"), avatarUrl: null })),
  });
}

/** A remote host's preview: `instance-transfer-v1` carries no avatars. */
export function decodeRemoteInstanceTransferPreview(value: unknown): InstanceTransferPreview {
  const preview = decodeRecord(value, "transfer preview");
  if (!Array.isArray(preview.agents)) invalid("transfer preview");
  const decoded = decodeInstanceTransferPreview({
    ...preview,
    agents: preview.agents.map((agent) => ({ ...decodeRecord(agent, "transfer agent"), avatarUrl: null })),
  });
  if (!decoded) invalid("transfer preview");
  return decoded;
}

/** A remote host's result: the new agents by id and name. */
export interface RemoteInstanceTransferResult extends Omit<InstanceTransferResult, "agents"> {
  agents: { agentId: string; name: string }[];
}

export function decodeRemoteInstanceTransferResult(value: unknown): RemoteInstanceTransferResult {
  const result = decodeRecord(value, "transfer result");
  if (!Array.isArray(result.agents)) invalid("transfer result");
  const agents = result.agents.map((item) => {
    const entry = decodeRecord(item, "transferred agent");
    if (!isIdentifier(entry.agentId) || !isBoundedString(entry.name, INPUT_LIMITS.agentName))
      invalid("transferred agent");
    return { agentId: entry.agentId, name: entry.name };
  });
  // A newer host can name a provider that this OpenBot does not know. Its sign-in cannot start here.
  if (!isUniqueList(result.signIn, 32, isAgentProviderRef)) invalid("transfer result");
  const signIn = result.signIn.filter(isAgentProvider);
  return { ...decodeInstanceTransferResult({ ...result, agents: [], signIn }), agents };
}

/** The remote result, with the new agents read from the host's agent list. */
export function resolveRemoteInstanceTransferResult(
  result: RemoteInstanceTransferResult,
  agents: readonly ClientAgentSummary[],
): InstanceTransferResult {
  const ids = new Set(result.agents.map((agent) => agent.agentId));
  return { ...result, agents: agents.filter((agent) => ids.has(agent.id)) };
}
