import { type AgentBackupModels, DEFAULT_HOST_BACKUP_MODELS } from "@openbot/contracts/ipc";
import type { BackupModelSource } from "@openbot/ui/features/conversation/BackupModels";
import type { ProviderFallbackOrder } from "@openbot/ui/features/settings/ProviderSettingsPage";
import { useText } from "@openbot/ui/text";
import { createSignal, createStore } from "solid-js";
import { settingsPort } from "./settings-port";

/** The order of every agent with none of its own, as the host last said. Undefined until it answered. */
export const [hostBackupModels, setHostBackupModels] = createSignal<AgentBackupModels>();

export async function loadHostBackupModels(): Promise<void> {
  setHostBackupModels(await settingsPort().getHostBackupModels());
}

export function createHostFallbackOrder(source: () => BackupModelSource): ProviderFallbackOrder {
  const { t, errorMessage } = useText();
  const [state, setState] = createStore<{ error: string | null }>({ error: null });
  loadHostBackupModels().catch((error: unknown) =>
    setState((draft) => {
      draft.error = errorMessage(error, t("provider.settings.fallbackOrderLoadFailed"));
    }),
  );

  async function save(next: AgentBackupModels | null): Promise<void> {
    try {
      setHostBackupModels(await settingsPort().setHostBackupModels(next ?? DEFAULT_HOST_BACKUP_MODELS));
      setState((draft) => {
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
      return hostBackupModels() ?? null;
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
