import { type AgentBackupModels, DEFAULT_HOST_BACKUP_MODELS, isAgentBackupModels } from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { PreferenceStore } from "./preference-file";

export type HostBackupModelsPreferenceStore = PreferenceStore<AgentBackupModels>;

export function createHostBackupModelsPreferenceStore(path: string): HostBackupModelsPreferenceStore {
  return new PreferenceStore({
    path,
    defaultValue: DEFAULT_HOST_BACKUP_MODELS,
    decode: (parsed) =>
      isDynamicRecord(parsed) && parsed.version === 1 && isAgentBackupModels(parsed)
        ? { automatic: parsed.automatic, order: parsed.order }
        : null,
  });
}
