// Runs the real central auth manager against a local account server that behaves like a private
// control plane. With no session the manager signs the owner in without email. With a stored
// session and no route to the service, it opens with the stored account. A revoked session signs
// the owner in again. A service that refuses the owner leaves the person signed out. A session file
// from before the cache keeps the retry screen.
//
// Run: bun scripts/central-auth-owner-start-e2e.ts
// It writes .openbot-build/central-auth-owner-start-e2e/report.json and exits non-zero on a failure.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { CentralAuthManager } from "../src/main/central-auth-manager";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, ".openbot-build", "central-auth-owner-start-e2e");
const OWNER = { id: "owner-1", email: "owner@example.test", name: null, avatarUrl: null, analyticsEnabled: null };
const OTHER = { id: "other-1", email: "other@example.test", name: null, avatarUrl: null, analyticsEnabled: null };

interface Control {
  ownerAllowed: boolean;
  validTokens: Set<string>;
  issued: number;
}

async function listen(control: Control, requests: string[]): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.url === "/health/live") return send(200, { status: "ok" });
    if (request.url === "/v1/auth/owner") {
      if (!control.ownerAllowed) return send(403, { error: { code: "owner_sign_in_forbidden", message: "No." } });
      control.issued += 1;
      const sessionToken = `session-${control.issued}`;
      control.validTokens.add(sessionToken);
      return send(200, { sessionToken, user: OWNER });
    }
    if (request.url === "/v2/server-claims/redeem") {
      control.validTokens.add("claim-session");
      return send(200, { sessionToken: "claim-session", user: OTHER });
    }
    if (request.url === "/v1/me") {
      const token = (request.headers.authorization ?? "").replace("Bearer ", "");
      if (!control.validTokens.has(token)) return send(401, { error: { code: "unauthorized" } });
      return send(200, token === "claim-session" ? OTHER : OWNER);
    }
    return send(404, { error: { code: "not_found" } });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closedUrl(): Promise<string> {
  const { server, url } = await listen({ ownerAllowed: false, validTokens: new Set(), issued: 0 }, []);
  await new Promise<void>((done) => server.close(() => done()));
  return url;
}

const root = await mkdtemp(join(tmpdir(), "openbot-central-auth-owner-"));
const manager = (apiUrl: string, name: string, ownerSignIn = true) =>
  new CentralAuthManager({
    apiUrl,
    storagePath: join(root, name),
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString(),
    startupRetryWindowMs: 1_000,
    startupRequestTimeoutMs: 300,
    startupRetryDelaysMs: [50],
    offlineStartWindowMs: 500,
    ownerSignIn,
  });
const start = async (auth: CentralAuthManager) => {
  const state = await runCauseEffect(auth.initialize());
  await runCauseEffect(auth.dispose());
  return state;
};

const checks: { name: string; passed: boolean; detail?: unknown }[] = [];
async function check(name: string, run: () => Promise<unknown>) {
  try {
    checks.push({ name, passed: true, detail: await run() });
  } catch (cause) {
    checks.push({ name, passed: false, detail: cause instanceof Error ? cause.message : String(cause) });
  }
}

const requests: string[] = [];
const control: Control = { ownerAllowed: true, validTokens: new Set(), issued: 0 };
const live = await listen(control, requests);
try {
  await check("no session: signs the owner in without email", async () => {
    const state = await start(manager(live.url, "a.bin"));
    assert.equal(state.status, "signed_in");
    assert.deepEqual(requests, ["GET /health/live", "POST /v1/auth/owner"]);
    const file = Buffer.from(await readFile(join(root, "a.bin"), "utf8"), "base64").toString();
    assert.equal(JSON.parse(file).user.id, OWNER.id);
    return requests.slice();
  });

  await check("stored session and no route to the service: opens with the stored account", async () => {
    const startedAt = Date.now();
    const state = await start(manager(await closedUrl(), "a.bin"));
    assert.equal(state.status, "signed_in");
    assert.equal(state.status === "signed_in" ? state.user.id : null, OWNER.id);
    const elapsedMs = Date.now() - startedAt;
    assert.ok(elapsedMs < 3_000, `took ${elapsedMs} ms`);
    return { elapsedMs };
  });

  await check("revoked session: signs the owner in again", async () => {
    control.validTokens.clear();
    requests.length = 0;
    const state = await start(manager(live.url, "a.bin"));
    assert.equal(state.status, "signed_in");
    assert.deepEqual(requests, ["GET /v1/me", "POST /v1/auth/owner"]);
    return requests.slice();
  });

  await check("a service that refuses the owner leaves the person signed out", async () => {
    control.ownerAllowed = false;
    requests.length = 0;
    const state = await start(manager(live.url, "b.bin"));
    assert.equal(state.status, "signed_out");
    assert.deepEqual(requests, ["GET /health/live", "POST /v1/auth/owner"]);
    await assert.rejects(readFile(join(root, "b.bin")));
    return requests.slice();
  });

  await check("a session file from before the cache keeps the retry screen", async () => {
    const legacy = JSON.stringify({ version: 2, sessionToken: "legacy", teamHostTokens: {} });
    await writeFile(join(root, "c.bin"), Buffer.from(legacy).toString("base64"));
    const state = await start(manager(await closedUrl(), "c.bin"));
    assert.equal(state.status, "error");
    return state.status;
  });

  await check("another account signed in by a claim is the one an offline start shows", async () => {
    control.ownerAllowed = true;
    const first = manager(live.url, "e.bin");
    await runCauseEffect(first.initialize());
    const issue = await runCauseEffect(first.redeemServerClaim("claim"));
    await runCauseEffect(first.dispose());
    assert.equal(issue, null);
    const state = await start(manager(await closedUrl(), "e.bin"));
    assert.equal(state.status, "signed_in");
    assert.equal(state.status === "signed_in" ? state.user.id : null, OTHER.id);
    return state.status === "signed_in" ? state.user.id : null;
  });

  await check("owner sign-in off: no owner request is made", async () => {
    control.ownerAllowed = true;
    requests.length = 0;
    const state = await start(manager(live.url, "d.bin", false));
    assert.equal(state.status, "signed_out");
    assert.deepEqual(requests, ["GET /health/live"]);
    return requests.slice();
  });
} finally {
  live.server.close();
  await rm(root, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const passed = checks.every((entry) => entry.passed);
  await writeFile(join(OUT, "report.json"), `${JSON.stringify({ passed, checks }, null, 2)}\n`);
  process.stdout.write(`${passed ? "PASS" : "FAIL"}: report in ${join(OUT, "report.json")}\n`);
  for (const entry of checks.filter((candidate) => !candidate.passed)) {
    process.stdout.write(`  FAIL ${entry.name}: ${String(entry.detail)}\n`);
  }
  if (!passed) process.exitCode = 1;
}
