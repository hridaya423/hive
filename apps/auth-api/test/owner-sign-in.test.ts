import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { migratedDatabase, sqliteD1 } from "../scripts/sqlite-d1";
import { AuthService } from "../src/server/auth-service";
import { D1AuthRepository } from "../src/server/d1-auth-repository";
import { ownerSignInEmail } from "../src/server/owner-sign-in";

const bindings = { OWNER_EMAIL: "owner@example.test", OWNER_TAILNET_LOGIN: "Owner@Example.test" };

function request(login?: string) {
  return new Headers(login === undefined ? {} : { "Tailscale-User-Login": login });
}

async function service() {
  const database = await migratedDatabase();
  const auth = new AuthService({ repository: new D1AuthRepository(sqliteD1(database)), delivery: null });
  return { database, auth };
}

describe("owner sign-in", () => {
  it("accepts the owner's tailnet login in any letter case", () => {
    expect(ownerSignInEmail(request("owner@example.test"), bindings)).toBe("owner@example.test");
    expect(ownerSignInEmail(request("OWNER@example.test"), bindings)).toBe("owner@example.test");
  });

  it("refuses a missing header, another login, and a Worker with no owner configured", () => {
    expect(ownerSignInEmail(request(), bindings)).toBeNull();
    expect(ownerSignInEmail(request("other@example.test"), bindings)).toBeNull();
    expect(ownerSignInEmail(request(""), bindings)).toBeNull();
    expect(ownerSignInEmail(request("owner@example.test"), {})).toBeNull();
    expect(ownerSignInEmail(request("owner@example.test"), { OWNER_EMAIL: "owner@example.test" })).toBeNull();
    expect(ownerSignInEmail(request("owner@example.test"), { OWNER_TAILNET_LOGIN: "owner@example.test" })).toBeNull();
  });

  it("signs the owner in without email and keeps one account across sign-ins", async () => {
    const { database, auth } = await service();
    const first = await Effect.runPromise(auth.signInOwner("owner@example.test", "100.64.0.1"));
    const second = await Effect.runPromise(auth.signInOwner("owner@example.test", "100.64.0.1"));
    expect(first.user.email).toBe("owner@example.test");
    expect(second.user.id).toBe(first.user.id);
    expect(second.sessionToken).not.toBe(first.sessionToken);
    expect(await Effect.runPromise(auth.authenticate(first.sessionToken))).toMatchObject({ id: first.user.id });
    expect(database.prepare("SELECT COUNT(*) AS count FROM users").get()).toEqual({ count: 1 });
  });

  it("gives no email code route to anyone else", async () => {
    const { auth } = await service();
    const result = await Effect.runPromise(Effect.result(auth.startEmailSignIn("someone@example.test", "100.64.0.2")));
    expect(result._tag).toBe("Failure");
  });
});
