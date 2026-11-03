import { ANDROID_PUSH_TOKEN_PATTERN } from "@openbot/contracts/team-protocol/push-notifications-android-v1";

export interface InstallTokenStore {
  read(): string | null;
  write(token: string): void;
}

export function ntfyInstallToken(store: InstallTokenStore, randomId: () => string): string {
  const saved = store.read();
  if (saved !== null && ANDROID_PUSH_TOKEN_PATTERN.test(saved)) return saved;
  const token = `hive-ntfy-${randomId()}`;
  store.write(token);
  return token;
}
