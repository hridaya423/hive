import { Effect } from "effect";
import { type NtfySender, PushNotificationSendFailure } from "./push-notifications";

const SEND_TIMEOUT_MS = 10_000;

export interface NtfyConfig {
  url: string;
  topic: string;
  token: string | null;
}

export function ntfyConfigFromEnvironment(env: NodeJS.ProcessEnv): NtfyConfig | null {
  const url = env.HIVE_NTFY_URL?.trim();
  const topic = env.HIVE_NTFY_TOPIC?.trim();
  return url && topic ? { url, topic, token: env.HIVE_NTFY_TOKEN?.trim() || null } : null;
}

export function createNtfySender({ url, topic, token }: NtfyConfig): NtfySender {
  return (notice) =>
    Effect.tryPromise({
      try: async (signal) => {
        const response = await fetch(url, {
          method: "POST",
          signal: AbortSignal.any([signal, AbortSignal.timeout(SEND_TIMEOUT_MS)]),
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ topic, title: notice.title, message: notice.body, click: notice.click }),
        });
        if (!response.ok) throw new Error(`The ntfy server answered ${response.status}.`);
        return "sent" as const;
      },
      catch: (cause) => new PushNotificationSendFailure({ cause }),
    });
}
