import type { DynamicIslandPresentation } from "@openbot/contracts/ipc";
import { throttleTrailing } from "../../rate-limit";

const PRESENTATION_INTERVAL_MS = 250;

/**
 * Sends the presentation to main at most four times a second, and only when it differs from the
 * last one sent. Main ignores an equal presentation too, so a skipped one changes nothing. The
 * last presentation always follows. A failed send is forgotten, so the same presentation goes again.
 */
export function createPresentationPublisher(
  read: () => DynamicIslandPresentation,
  send: (presentation: DynamicIslandPresentation) => Promise<void>,
): () => void {
  let lastSent: string | undefined;
  return throttleTrailing(() => {
    const presentation = read();
    const key = JSON.stringify(presentation);
    if (key === lastSent) return;
    lastSent = key;
    send(presentation).catch(() => {
      if (lastSent === key) lastSent = undefined;
    });
  }, PRESENTATION_INTERVAL_MS);
}
