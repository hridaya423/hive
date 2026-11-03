# OpenBot Auth API

This TanStack Start and Solid 2 package is the central OpenBot account API. It
runs on Cloudflare Workers, stores account and authentication records in D1,
and stores account avatars in R2. Users sign in with an eight-character
one-time email code. D1 stores hashes instead of plaintext codes, session tokens,
and team authentication tickets.

## Local development

`.env.dev` is the committed encrypted development file. Local identity keys and saved overrides
stay in ignored `.openbot/dev-state.json`. A checkout without a development key starts with stable
generated local defaults. Existing state files remain valid.

The update resets values that exist only in the old generated `.env.dev`; it does not import them.
Local identity and custom settings already saved in `.openbot/dev-state.json` stay unchanged.
Set new manual overrides in the shell. The load order is shell values, saved local overrides,
decrypted development settings, then generated defaults. An explicit empty value is an override.
Shared settings do not replace the local ticket keys, auth webhook secret, report hash secret, or
skills admin token. Shell values and saved overrides can replace these local values.

Set `DOTENV_PRIVATE_KEY_DEV` in your shell profile to load the shared values in every worktree.
Without this key, the Worker starts with generated local defaults. Shell values override shared
values. Development commands do not read the root `.env.keys`; production commands continue to use
that file.

`.env.production` is the encrypted production file, and its private key stays in the ignored root
`.env.keys`. Production commands decrypt it only in process memory. Development commands use the
shell key described above and never read the root key file. New worktrees do not copy root
`.env.keys`; run production commands from a checkout that has the existing production key file.

```bash
bun run api:migrate:local
bun run dev:api
```

The local address is `http://127.0.0.1:3100`. The explicit development flag
returns the sign-in code in the API response. It never writes the code to logs.

Update and validate the encrypted production file with these commands:

```bash
printf '%s' '<APP_PASSWORD>' | bun run env:set:smtp
bun run env:validate:prod
```

Commit the encrypted `.env.production` and `.env.dev` files. Never commit `.env.keys` or local
state from `.openbot/`.

## Email delivery

Private Email SMTP is the primary delivery method. Use a separate app password.
Do not use the mailbox password.

Local development sends no email at all. Generated local defaults blank all five SMTP
variables, which is what turns delivery off - `wrangler.jsonc` blanks four of them
in the top-level `vars` that local `vite dev` reads, and a partial configuration is
what `readSmtpConfig` rejects. The team-invitation endpoint then
answers `503 email_delivery_not_configured`; login never reaches SMTP at all,
because `AUTH_EXPOSE_DEVELOPMENT_CODE` returns its code in the API response. To
exercise real delivery locally, put a full set in the ignored `.dev.vars` file:

```dotenv
EMAIL_SMTP_HOST=mail.privateemail.com
EMAIL_SMTP_PORT=465
EMAIL_SMTP_USERNAME=<MAILBOX_ADDRESS>
EMAIL_SMTP_PASSWORD=<PRIVATE_EMAIL_APP_PASSWORD>
EMAIL_FROM=<MAILBOX_ADDRESS>
```

`bun run env:set:smtp` encrypts the app password into `.env.production` only.

Production does not open the SMTP socket itself. From some Cloudflare locations, such as FSD, a
socket to the mail host fails at once (#4578). The production Worker sends each email through the
`openbot-email-relay` Worker (`wrangler.email-relay.jsonc`) over the `EMAIL_RELAY` service binding.
Cloudflare places that Worker near the mail host. The relay has no route and keeps no secret: the
binding request carries the SMTP settings and the message. CI and `bun run api:deploy` deploy the
relay before the production Worker. When you change `EMAIL_SMTP_HOST` or `EMAIL_SMTP_PORT`, also
change `placement.host` in `wrangler.email-relay.jsonc`. The test Worker and local `vite dev` send
from their own socket. To see where the relay runs, read the `colo` of its Workers Logs events.

For a deployed Worker, `bun run api:deploy` decrypts `.env.production`. It sends
`EMAIL_SMTP_PASSWORD`, `SKILLS_ADMIN_TOKEN`, `REMOTE_TICKET_PRIVATE_JWK`,
`REMOTE_TICKET_PUBLIC_JWKS`, and `REMOTE_AUTH_WEBHOOK_SECRET` to
`wrangler secret put` through standard input, and `GITHUB_APP_PRIVATE_KEY` when it is set. It then
builds and deploys the Worker.

`GITHUB_APP_PRIVATE_KEY` is the OpenBot GitHub App's private key as a PKCS #8 PEM. GitHub gives a
PKCS #1 key; convert it with `openssl pkcs8 -topk8 -nocrypt -in <key>.pem`. With the key, the
Worker gives the desktop installation tokens, so GitHub shows `openbotgit[bot]` as the author of an
agent's work. With no key, the desktop acts as the signed-in user. In GitHub Actions the secret is
`OPENBOT_GITHUB_APP_PRIVATE_KEY`, because GitHub refuses secret names that start with `GITHUB_`.
Secrets are never passed as process arguments. The other values are Worker
variables. The SMTP connection uses TLS from the start and accepts only port 465.

GitHub Actions reads the remote-control secrets and `SKILLS_ADMIN_TOKEN` from the `cloudflare-production`
Environment. It includes them in Wrangler's temporary runtime secrets file.

Use `bun run api:deploy:test` for the isolated `openbot-auth-api-test` Worker
and the `openbot-auth-test` D1 database.

As a fallback, set `EMAIL_DELIVERY_WEBHOOK_URL` to an HTTPS endpoint. OpenBot
sends this JSON:

```json
{
  "email": "person@example.com",
  "code": "ABCD-EFGH",
  "expiresAt": 1787060000000
}
```

If `EMAIL_DELIVERY_WEBHOOK_SECRET` is set, the request includes a Bearer token.
Do not enable `AUTH_EXPOSE_DEVELOPMENT_CODE` in production.

When the provider itself refuses a message with a sender limit, the Worker
answers 429 `email_delivery_rate_limited` instead of 502, for a sign-in code and
for a team invitation. The message is never sent in that case, so the app can
ask again later. Namecheap Private Email allows 500 messages an hour for each
mailbox, and every sign-in code and invitation spends that same quota.

## Cloudflare deployment

Create the D1 database and replace the placeholder `database_id` in
`wrangler.jsonc`. Apply remote migrations and set delivery secrets through
Wrangler. Then deploy the Worker.

```bash
bun run api:migrate:remote
bun run api:deploy
```

The service applies limits per email, per IP, per challenge, and per resend.

A deploy replaces every file under `/assets/`. Before a production deploy, CI and `bun run api:deploy`
run `scripts/keep-previous-assets.ts`. It copies the files of the builds that were live in the last
24 hours from the account service into the new build, so a tab that is open during a deploy can
still load code. The site keeps the list of these files in `/asset-history.json`. When the list or a
file cannot be read, the deploy continues with fewer files, and such a tab reloads when it next loads
code.

## Authentication data retention

The production Worker runs once each 5 minutes. Each run delivers pending remote
authorization events. It is a retry path: a request
schedules its own first attempt, so a run only repeats what failed. The midnight UTC run also deletes
expired or consumed email challenges, expired or revoked sessions, expired or
consumed team authentication tickets, and expired rate-limit records. A successful
retention run logs only aggregate deletion counts.

The `preview` and `test` environments do not install an automatic Cron Trigger.
To run the scheduled handler during local development, start the API and request
the Cloudflare scheduled-handler test route:

```bash
curl "http://127.0.0.1:3100/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
```

## Remote control plane

The Auth API stores remote hosts, memberships, invitations, and logical sessions.
It issues short-lived ES256 connection tickets. `/.well-known/jwks.json` publishes
the public key so the separate Signal service can verify tickets without a D1
request. The old Team Tunnel provisioning endpoint returns `426` and does not
create a Cloudflare Tunnel.

Set the private JWK, public JWKS, active key ID, Signal URL, and webhook secret in
the encrypted environment. The private and public keys must use ES256. The Signal
URL must point to a DNS-only host. Cloudflare carries only account and configuration
requests. It does not carry Team API or Remote Desktop data.

Two optional variables spread hosts over more than one Signal machine. When both are empty, each
ticket names `REMOTE_SIGNAL_URL`, as before.

- `REMOTE_SIGNAL_HOMES`: the Signal machines that a host can have as its home, as `id=url,id=url`,
  for example `a=wss://signal-a.example.com/v1/signal,b=wss://signal-b.example.com/v1/signal`. An ID
  has 1 to 32 characters from `a-z`, `0-9` and `-`. A URL must use `wss:`, or `ws:` when
  `REMOTE_SIGNAL_URL` uses `ws:`. An invalid value makes each ticket request fail with
  `503 remote_not_configured`. A host ticket request with `signalHome: true` gets a home, which
  `remote_hosts.signal_home` keeps, and a ticket with the `signal` claim. The host keeps its home
  until it sends that home's URL as `failedSignalUrl`. Session tickets of the host name the same
  home. Other host tickets (ingress, the webhook relay, released hosts) and hosts with no home use
  `REMOTE_SIGNAL_URL`, which stays the entry Signal.
- `REMOTE_AUTH_WEBHOOK_URLS`: each Signal that gets the auth events, as `url,url`. Empty means
  `REMOTE_AUTH_WEBHOOK_URL` only. The outbox deletes an event when each URL accepted it, and sends it
  again only to the URLs that failed.
- `SIGNAL_ENTRY_ZONE_ID` and the secret `SIGNAL_ENTRY_DNS_TOKEN`: with both and two homes, the cron
  `*/1 * * * *` moves the `REMOTE_SIGNAL_URL` name to another home when its machine stops answering
  `/health/ready` (`src/server/signal-entry-failover.ts`). The token needs only `Zone.DNS:Edit` on that
  zone. The test and preview Workers keep the zone empty, so they never change production DNS.

To deploy your own copy of this Worker with your own Signal, see
[Self-hosted remote access](../../docs/self-hosting.md).

### Live Activity and notification relay

`POST /v2/remote/hosts/:hostId/live-activity` forwards a sealed iPhone Live Activity update from a
host to Apple Push Notification service. The host seals the content for the phone, so the Worker
cannot read it. The Worker checks the host credential and `LIVE_ACTIVITY_RATE_LIMITER`, makes the
APNs payload itself, and stores and logs nothing. An update that shows an event that notifies the
member has an `alert` with the sound of the phone and "OpenBot" as its only text (iOS shows the text
on Apple Watch only); a host cannot give the text.

`POST /v2/remote/hosts/:hostId/notification` forwards a sealed iPhone notification in the same way.
It has its own key in `LIVE_ACTIVITY_RATE_LIMITER`, and it sends nothing for a device session that
has ended (`RemoteControlPlane.sessionOpen`), because the host does not learn about the end. The
alert has "OpenBot" as its only text and `mutable-content`; the app opens the sealed bytes.

The relay is off until `APNS_PRIVATE_KEY` (the `.p8` key text) and `APNS_KEY_ID` are set. Create
the key in Apple Developer > Keys with the Apple Push Notifications service, then add both to the
encrypted environment and to the `cloudflare-production` GitHub environment. `APNS_TEAM_ID` and
`APNS_TOPIC` are in `wrangler.jsonc`.

For local development, run `bun run dev:apns-key -- ~/Downloads/AuthKey_<KEY_ID>.p8`. It saves the
key in ignored development state. The local Worker runtime cannot open HTTP/2, which APNs requires, so `vite dev`
sets `APNS_ORIGIN` and forwards the Worker's request to Apple from Node
(`dev-apns-proxy.ts`). The Worker still checks the host and the limit, makes the payload and signs
the token. Only a loopback caller can use the forwarder, and the Worker accepts only a loopback
`APNS_ORIGIN`.

`POST /v2/remote/hosts/:hostId/android-notification` forwards a sealed Android notification to
Firebase Cloud Messaging in the same way, with the same limit and session check. The Worker sends a
data message with the sealed bytes and the sound only; the app opens the seal. The relay is off until
`FCM_SERVICE_ACCOUNT` is set: the service account key file (JSON) of the Firebase project of the app,
from Firebase console > Project settings > Service accounts > Generate new private key. Put it into
the encrypted environment as one line (`jq -c . <file>.json`) and into the `cloudflare-production`
GitHub environment. A deployment stops before remote changes when the value is not a service account
key file. The local Worker sends to Firebase directly.

## Private control plane and owner sign-in

A Worker that runs for one owner on a private network signs the owner in with no email.
`POST /v1/auth/owner` creates a session for `OWNER_EMAIL` when the request header
`Tailscale-User-Login` equals `OWNER_TAILNET_LOGIN` (compared without regard to letter case).
Without both variables, or with another login or no header, the route answers 403. The email
sign-in routes stay, but with `AUTH_EXPOSE_DEVELOPMENT_CODE=false` and no SMTP they answer 503, so
the owner is the only account.

The header is only as strong as the way the request arrives. Keep three rules:

- The Worker listens on `127.0.0.1` only. The source address of every request is then loopback and
  proves nothing, so the route trusts the header instead.
- `tailscale serve` is the only way in. It adds `Tailscale-User-Login` after it has identified the
  caller. Never use `tailscale funnel`, and never put another proxy in front: a public route would
  let any caller send the header.
- Run it only where every process on the machine is trusted, since a local process can send the
  header to loopback itself.

`ops/mini/README.md` has the install steps for the Mac mini.
