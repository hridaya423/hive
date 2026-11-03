import { type AgentBackupModels, DEFAULT_HOST_BACKUP_MODELS } from "@openbot/contracts/ipc";
import type { BackupModelSource } from "@openbot/ui/features/conversation/BackupModels";
import type { ProviderFallbackOrder } from "@openbot/ui/features/settings/ProviderSettingsPage";
import { useText } from "@openbot/ui/text";
import { createStore } from "solid-js";
import { settingsPort } from "./settings-port";

export function createHostFallbackOrder(source: () => BackupModelSource): ProviderFallbackOrder {
  const { t, errorMessage } = useText();
  const [state, setState] = createStore<{ value: AgentBackupModels | null; error: string | null }>({
    value: null,
    error: null,
  });
  settingsPort()
    .getHostBackupModels()
    .then(
      (value) =>
        setState((draft) => {
          draft.value = value;
        }),
      (error: unknown) =>
        setState((draft) => {
          draft.error = errorMessage(error, t("provider.settings.fallbackOrderLoadFailed"));
        }),
    );

  async function save(next: AgentBackupModels | null): Promise<void> {
    try {
      const saved = await settingsPort().setHostBackupModels(next ?? DEFAULT_HOST_BACKUP_MODELS);
      setState((draft) => {
        draft.value = saved;
        draft.error = null;
      });
    } catch (error) {
      setState((draft) => {
        draft.error = errorMessage(error, t("provider.settings.fallbackOrderSaveFailed"));
      });
    }
  }

  return {
    get value() {
      return state.value;
    },
    get source() {
      return source();
    },
    get error() {
      return state.error;
    },
    onChange: (next) => void save(next),
  };
}
