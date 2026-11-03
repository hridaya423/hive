# Control plane on the Mac mini

Hive runs its account service (the Worker in `apps/auth-api`) and Signal (`remote/api`) on the
Mac mini. Only the tailnet can reach them. Nothing goes to nightly-labs.

The URLs and ports come from `fork.config.json`. The owner is one person: the Worker signs in the
account `HIVE_OWNER_EMAIL` when the request carries the Tailscale login `HIVE_OWNER_TAILNET_LOGIN`.

## What runs

| Label | What | Port |
| --- | --- | --- |
| `dev.hridaya.hive.control-plane.worker` | Worker, `vite dev` on loopback | `workerPort` |
| `dev.hridaya.hive.control-plane.signal` | Signal, no TLS, no coturn | `signalPort` |
| `dev.hridaya.hive.control-plane.tick` | Calls the Worker's scheduled handler each minute | none |

`tailscale serve` publishes both on the tailnet over HTTPS (ports from the two URLs in
`fork.config.json`). Never use `tailscale funnel`. The Worker trusts the `Tailscale-User-Login`
header, so a public route would let anyone send it.

The local Worker does not fire its cron triggers. The tick job calls
`/cdn-cgi/handler/scheduled`, which sends the retries of the revocation outbox. Without it, a
revoked phone stays connected until its ticket expires.

## Install

Run on the mini, in the checkout that holds the branch to run:

```sh
HIVE_OWNER_EMAIL=you@example.com HIVE_OWNER_TAILNET_LOGIN=you@example.com sh ops/mini/install.sh
```

It makes `~/Library/Application Support/Hive Control Plane` (secrets, owner, database), applies
the D1 migrations, writes the three launch agents, publishes the two ports and waits for both
health routes. A second run keeps the secrets and the database. The two owner values are only
needed the first time.

The database lives in the data folder, not in the checkout: `apps/auth-api/.wrangler/state` is a
link to it, so `git clean` does not delete the accounts.

## Secrets

`secrets.env` in the data folder holds the ticket key pair and the shared secrets. Mode 600. Back
them up in the envsync vault from the MacBook:

```sh
ssh mini 'cat "$HOME/Library/Application Support/Hive Control Plane/secrets.env"' | while IFS= read -r line; do
  envsync set "HIVE_CP_${line%%=*}" "$(printf '%s' "${line#*=}" | sed "s/^'//; s/'\$//")"
done
```

A new `secrets.env` signs every ticket again: each desktop and phone signs in once more.

## Logs and restart

Logs are in `~/Library/Logs/Hive Control Plane/` (`worker.log`, `signal.log`, `tick.log`).

```sh
launchctl kickstart -k gui/$(id -u)/dev.hridaya.hive.control-plane.worker
launchctl kickstart -k gui/$(id -u)/dev.hridaya.hive.control-plane.signal
```

Check: `curl https://<mini>.<tailnet>.ts.net:<port>/health/live` answers 200 from any tailnet
device, and `tailscale funnel status` lists nothing.

## Remove

```sh
for n in worker signal tick; do
  launchctl bootout gui/$(id -u)/dev.hridaya.hive.control-plane.$n
  rm ~/Library/LaunchAgents/dev.hridaya.hive.control-plane.$n.plist
done
tailscale serve --https=<api port> off
tailscale serve --https=<signal port> off
```

The data folder stays until you delete it.
