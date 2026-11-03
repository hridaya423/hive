import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";

export async function listen(server: Server) {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address === "object", "The server has no TCP address.");
  return {
    port: address.port,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}

export async function freePort(): Promise<number> {
  const probe = await listen(createServer());
  await probe.close();
  return probe.port;
}
