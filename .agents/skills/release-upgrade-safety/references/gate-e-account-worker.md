# Gate E — Account Worker — `apps/auth-api/`

Triggered by **any** addition, modification, deletion or rename under `apps/auth-api/migrations/`,
a change to any non-UI file under `apps/auth-api/src/`, or a change to a file that decides how the
Worker runs: `apps/auth-api/package.json`, `apps/auth-api/wrangler.jsonc` and `ops/mini/`.

The `src/` half is wider than `routes/` and `server/` on purpose: `worker-entry.ts` is the deployed
Worker's default export and `router.tsx` builds the router from `routeTree.gen.ts`, so a `/v1` or
`/v2` endpoint can be removed or shadowed there while every file under `routes/` is untouched.

The run files are in the list because the migration order is a property of *how the Worker starts*,
not of `apps/auth-api/`. On the mini, `ops/mini/` applies the local D1 migrations (`api:migrate:local`)
before it starts the Worker. A change that drops that step or starts the Worker first runs a Worker
against a schema it was never started against, with nothing under `apps/auth-api/src/` modified and
the gate otherwise reporting "not triggered". Re-read the order every time one of these files changes.

```bash
git diff --stat --diff-filter=AMDR <tag>..HEAD -- apps/auth-api/migrations
```

Three separate hazards; check all three.

- **An already-applied migration was edited.** This is a stop, and it is the one that looks
  harmless. Wrangler records migrations by *name* and never replays a file it has already applied,
  so an edit leaves production on the old schema while every fresh database executes the new
  history. The two diverge permanently and nothing reports it. Same rule as `src/backend`: append a
  new migration, never edit a shipped one — for a different reason, since here it is the applied-name
  ledger rather than the absence of a backup.
- **The D1 deploy race.** CI applies migrations **before** deploying the new Worker, so for the
  length of that gap the old Worker runs against the new schema. No `NOT NULL` column without a
  default, no rename, no drop of a column the deployed Worker still reads. A contraction needs the
  two-step release — expand, deploy the Worker that uses it, contract in a later change.
  - **Indexes and triggers race too, and they are the ones that get missed** — the list above is
    about columns, and a migration can leave every column compatible while changing what the old
    Worker's writes *do*. A `CREATE TRIGGER` fires on statements the old Worker is already issuing.
    Swapping a `UNIQUE` index is worse: if the replacement is partial and predicated on a column the
    old Worker does not know to populate, its rows fall outside the new index and the constraint it
    was relying on silently stops being enforced for the length of the gap.
    `0018_remote_device_sessions.sql` is the worked example: it drops
    `remote_sessions_one_active_per_user_host` for a new index predicated on
    `auth_session_hash IS NOT NULL`, then keeps the old guarantee alive with a second
    `..._legacy_user_host` index covering exactly the rows the old Worker still writes. Copy that
    shape — when you narrow a unique index, add the legacy one beside it rather than assuming the
    gap is short.
- **Installed desktop builds never update**, in *both* directions. A build from a year ago keeps
  calling `auth:*` against the current Worker forever, and unlike a D1 mistake that is not
  recoverable by a redeploy.
  - *Responses*: a removed or renamed field in a handler under `apps/auth-api/src/routes/v1/` or
    `v2/` breaks the clients that still read it.
  - *Requests*: an old build also keeps sending its original routes, methods, headers and bodies.
    Making an optional request field required, tightening a validator, rejecting a value that used
    to be accepted, or adding an auth requirement breaks those clients even when every response
    shape is untouched. Diff the request parsers and route registrations, not only the responses.

```bash
bun run --cwd apps/auth-api test -- test/mobile-auth-migration.test.ts
```

`apps/auth-api` has its own vitest config, so `bun run test:desktop` does not reach it. Run the
sibling `*-migration.test.ts` files in `apps/auth-api/test/` that cover what you touched.
`bun run check:api` is CI's job, not yours.
