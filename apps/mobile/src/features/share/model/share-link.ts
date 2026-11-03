import { APP_URL_PROTOCOL } from "@openbot/contracts/app-url-scheme";
/**
 * The link that expo-sharing opens: the iOS share extension after it saves the share, and Android
 * for a share intent. It carries nothing; the share waits in native storage.
 */
export function isIncomingShareLink(path: string): boolean {
  try {
    const url = new URL(path);
    return url.protocol === APP_URL_PROTOCOL && url.host === "expo-sharing";
  } catch {
    return false;
  }
}
