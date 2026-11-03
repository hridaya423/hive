import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * The SDK transport classes declare their handlers and `sessionId` as `T | undefined`, which
 * `exactOptionalPropertyTypes` does not accept as a `Transport`. This one forwards to such a class.
 */
export function asTransport(inner: {
  start(): Promise<void>;
  send: Transport["send"];
  close(): Promise<void>;
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: Transport["onmessage"] | undefined;
  setProtocolVersion?: ((version: string) => void) | undefined;
}): Transport {
  const transport: Transport = {
    start: () => {
      inner.onclose = () => transport.onclose?.();
      inner.onerror = (error) => transport.onerror?.(error);
      inner.onmessage = (message, extra) => transport.onmessage?.(message, extra);
      return inner.start();
    },
    send: (message, options) => inner.send(message, options),
    close: () => inner.close(),
    setProtocolVersion: (version) => inner.setProtocolVersion?.(version),
  };
  return transport;
}
