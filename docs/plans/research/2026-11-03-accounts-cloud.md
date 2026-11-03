# Research: OpenBot account and cloud dependencies

Repo: `/Users/hridyaagrawal/honey/openbot` at `de784cee2`. Read-only research. No code changed.
All paths are relative to the repo root. "Unconfirmed" marks a claim I did not verify; the place I looked is named.

## Summary

1. The desktop app cannot run without an account today. `AppAccessGate` shows only the sign-in screen until `centralAuth().status === "signed_in"` (`src/renderer/src/AppView.tsx:77`, `src/renderer/src/features/account/account-context.tsx:291-295`). The default account URL is `https://api.openbot.run` in a packaged build (`src/main/application-services.ts:991-994`).
2. The account Worker (`apps/auth-api`) is the root of trust for sign-in, host registration, Signal tickets, memberships, invitations, push relays, messaging routes, billing, hosted servers and the marketplace. Signal (`remote/api`) only relays WebRTC set-up and trusts tickets signed by the Worker.
3. Push and Live Activity need an APNs key (iPhone) or a Firebase service account (Android) in the Worker. The current ones belong to nightly-labs (`apps/auth-api/wrangler.jsonc:79-80`, bundle `run.openbot.mobile`). The fork needs its own Apple team, bundle ID and key, and its own Firebase project.
4. Recommendation: Option A, trimmed. Keep the Worker, Signal and the ticket protocol. Run them for one user on the Mac mini behind Tailscale HTTPS. Delete billing, hosted servers, licence and marketplace routes. Add an offline-first start so a MacBook with no route to the mini still opens. Option B (rip the account out) touches about 150 or more files, rewrites the phone pairing and the Team API auth, and has no compensating gain for one user.
5. Removing the account needs no `openbot.db` change (no account columns found). It does touch `openbot-team-server-v2.json`, `openbot-central-auth-v1.bin`, `servers.json` v3 and the phone's stored session. Option A changes none of them.

## Current architecture

### 1. Sign-in and session

- Email and one-time code. Desktop calls `POST /v1/auth/email/start` (`src/main/central-auth-manager.ts:1484`) and `POST /v1/auth/email/verify` (`:1551`). Mobile calls the same start route (`apps/mobile/src/features/auth/api/mobile-auth.ts:150`) and `/v1/mobile-auth/email/verify` (`:184`).
- The Worker can skip SMTP: `AUTH_EXPOSE_DEVELOPMENT_CODE=true` returns the code in the API response (`apps/auth-api/src/server/request-auth.ts:61-66`, `apps/auth-api/src/server/auth-service.ts:222`). `wrangler.jsonc:52` sets it to `"false"`. `docs/web-client.md:240` says production must not enable it.
- Session storage. File `openbot-central-auth-v1.bin` in `userData` (`src/main/application-services.ts:394`, path built at `:998`). Content is JSON `{version: 2, sessionToken, teamHostTokens, mobileConnectLink}` encrypted with Electron `safeStorage` (`central-auth-manager.ts:1891-1950`, restore at `:1968-1989`). `teamHostTokens` are per-host machine tokens.
- Startup. `initialize()` reads the file. With no session it calls `GET /health/live` on the account API (`:1433-1436`). With a session it calls `GET /v1/me` (`:1438`). The startup request timeout is 3 s and the retry window 30 s (`:124-125`). A network failure sets `{status: "error", issue.code: "auth_api_unavailable"}` (`:2001-2022`). The renderer then shows the retry screen, not the app.
- A 401 clears the stored session and goes to `signed_out` (`:1444-1449`).

Can the app run with no account today? No.

- Gate: `src/renderer/src/AppView.tsx:77` (`when={auth.visibleSignedInAccount()}`, fallback is `AccountLogin`). `account-context.tsx:291-295` returns a user only for `signed_in`.
- Nothing in `src/main`, `src/renderer/src`, `src/preload` bypasses it. I grepped for skip/offline/no-account switches and found none (`grep -rniE "skip.?auth|no.?account|offline.?mode|OPENBOT_(SKIP|NO|OFFLINE|LOCAL_ONLY)"`).
- Two precedents for no-account operation exist in the main process and can guide the fork: the "local server child" has "no account" and an owner that is a password member (`src/main/application-services.ts:2769-2771`, `src/main/index.ts:943`, `src/main/local-server-child.ts`), and `team-store.ts:136-160, 306-355` still reads hosts "from before accounts".

Features gated on being signed in (all through `CentralAuthManager`, 33 non-test files in `src/main`, `src/preload` reference it):

| Feature | Account route | Call site |
|---|---|---|
| Whole UI | `/v1/me` | `central-auth-manager.ts:261, 1438` |
| Profile, avatar, analytics flag | `/v1/me/profile`, `/v1/me/avatar`, `/v1/me/analytics` | `:1715-1784` |
| Host registration and key handover | `/v2/remote/hosts/register`, `/hosts/:id/key-handover` | `:562, 613`; `host-service.ts:891-910` |
| Signal tickets | `/v2/remote/hosts/:id/ticket`, `/v2/remote/sessions/*` | `:681, 1008, 1032` |
| Membership, invites, roles, logo | `/v2/remote/hosts/:id/members/*`, `/invites`, `/logo` | `:1136-1289` |
| Team invite email | `/v1/team-invitations/email` | `:1372` |
| Mobile Connect QR and link, device list | `/v1/mobile-auth/ticket`, `/link`, `/devices` | `:362-541` |
| Push and Live Activity relays | `/v2/remote/hosts/:id/notification`, `/android-notification`, `/live-activity` | `:930-1000` |
| Slack, Discord, Telegram, webhook and GitHub routes | `/v2/remote/hosts/:id/*-route`, `*-disconnect`, `telegram-link` | `:690-925` |
| Billing and licence | `/v1/me/billing/`, `/v1/me/license/*` | `src/main/billing-service.ts:40-46`, `src/main/license-service.ts:38-57` |
| Hosted (paid) servers | `/v2/hosting/*` | `src/main/hosted-server-service.ts:95-263`, `hosted-server-bootstrap.ts:108` |
| Hosted sites | `/v1/sites/*` | `src/main/hosted-site-service.ts:100-290` |
| Skill and agent marketplace, templates | `/v1/skills/*`, `/v1/marketplace/agents/*`, `/v1/agent-templates/*` | `skill-marketplace-service.ts:99+`, `agent-marketplace-service.ts:110+`, `agent-template-service.ts:209+` |

Renderer consumers of auth state: 15 files under `src/renderer/src` (for example `server-scope.tsx:171, 301, 393`, `channels-context.tsx:35-77`, `settings-context.tsx:169-196`).

### 2. Network calls to nightly-labs hosts

| Host | Base URL / env | Where |
|---|---|---|
| Account Worker | `https://api.openbot.run`; override `OPENBOT_AUTH_API_URL` (HTTPS or loopback HTTP only, `central-auth-manager.ts:2025-2032`); phone QR origin override `OPENBOT_MOBILE_AUTH_API_URL` (`application-services.ts:997`) | all routes above |
| Account Worker (shared constant) | `OPENBOT_CONTROL_PLANE_ORIGIN = "https://api.openbot.run"` | `packages/contracts/src/invite-links.ts:5`; mobile `mobile-auth.ts:121-122` (the env override works only when `__DEV__`) |
| Signal | `wss://signal.openbot.run/v1/signal`. The Worker puts the URL in each ticket (`signalUrl`, `packages/contracts/src/remote-control-plane.ts:34-58`; Worker var `REMOTE_SIGNAL_URL`). The desktop only allows it in the CSP (`src/main/content-security-policy.ts:23, 33-47`, env `OPENBOT_REMOTE_SIGNAL_URL`, read at `src/main/session-configuration.ts:35`) | host and client peers: `src/main/team-webrtc-host-gateway.ts`, `team-webrtc-client-transport.ts`, `src/renderer/src/features/team/team-webrtc.ts`; mobile `packages/team-client/src/remote-peer.ts:1003` |
| TURN / STUN | Host name chosen by Signal (`TURN_HOST`), credentials are an HMAC of `TURN_SHARED_SECRET` (`remote/api/src/tokens.ts:499-517`) | clients receive `iceServers` from Signal; mobile fails with `signal/no_ice_servers` when the list is empty (`packages/team-client/src/remote-peer.ts:1203-1204`) |
| OpenPanel analytics | `https://analytics.openbot.run/api` | main `src/main/analytics.ts:38`; renderer `src/renderer/src/analytics.ts:37`; `packages/telemetry/src/transport.ts:13`; mobile `EXPO_PUBLIC_OPENPANEL_CLIENT_ID/SECRET` (`apps/mobile/src/features/analytics/mobile-analytics.ts:49-53`, `failure-reports.ts:43-47`); CSP `content-security-policy.ts:23`. Enabled only for packaged production (`application-services.ts` `analyticsEnabled`, around `:2790`) |
| GitHub releases | `https://github.com/nightly-labs/openbot/releases/latest/download/...` | `src/main/host-release-service.ts:131`; `electron-builder.yml:21-24` (`publish.provider: github`, owner `nightly-labs`); `electron-updater` 6.8.11 in `package.json:425`. Whether the desktop updater is enabled in packaged builds: unconfirmed, looked in `package.json` and `src/main/hosted-update-adapter.ts` only |
| Runtime blocklist | `raw.githubusercontent.com/nightly-labs/openbot/main/provider-runtime-blocklist.json` | `src/main/provider-runtime-releases.ts:46` |
| GitHub App "OpenBotGit" | needs a Client ID; "With no Client ID, the connection is not offered" | `src/main/github-connector-config.ts:6`; `src/main/github-bot-tokens.ts:36` (token from the OpenBot API) |
| Links to `openbot.run` | terms, privacy, docs, changelog, plugin share URLs | `FirstRunFlow.tsx:41-42`, `WhatsNewOverlay.tsx:30`, `app-handlers.ts:73-84`, `marketplace-plugin-catalog.ts` (many), `web-provider-admin.ts:97-99` |

CSP also allows `wss://*.openbot.run` and `https://*.openbot.run` frames (`content-security-policy.ts:23, 26`).

### 3. Remote access: how a client reaches a host

1. The host (desktop) is registered with the Worker: `registerRemoteHost` (`host-service.ts:891-910`). It stores an Ed25519 host key in `openbot-team-server-v2.json` and sends the public key (`team-store.ts:567-572`).
2. The host asks the Worker for a host ticket (ES256 JWT, audience `openbot-remote`, `packages/contracts/src/signal-protocol/ticket.ts:19-55`) and opens a WSS socket to Signal (`host-service.ts:1068-1080`, `team-webrtc-host-gateway.ts:44-110`).
3. A client (desktop or phone) asks the Worker for a session and a client ticket bound to its Ed25519 public key (`/v2/remote/sessions/`, `/sessions/:id/ticket`: `central-auth-manager.ts:1008, 1032`). Mobile does the same through `packages/team-client/src/remote-directory.ts`.
4. Both open `WSS /v1/signal`. Signal checks the ticket against the Worker's JWKS (`remote/api/src/config.ts:182`, `REMOTE_TICKET_JWKS_URL` or `REMOTE_TICKET_PUBLIC_KEYS`). It relays SDP and ICE and returns STUN/TURN credentials (`remote/README.md:11-20`).
5. WebRTC DataChannels `rpc`, `events`, `files` carry the Team API. After the channel opens, the client sends the ticket again in an `auth-init` frame with a signature. The host verifies the ticket with the Worker's JWKS (`central-auth-manager.ts:1044-1111`; `team-webrtc-host-peer.ts:416-470`). Host and client pin each other's fingerprints.
6. Revocations and role changes go from the Worker to Signal through `POST /internal/auth-events` (`remote/api/src/app.ts:186`) with a durable outbox retried by cron.
7. Mobile Connect pairing. The host asks the Worker for a one-time ticket (`/v1/mobile-auth/ticket`, `central-auth-manager.ts:362`). The QR is `openbot://mobile-connect?api=<account origin>&ticket=...&host=<hostId>&fingerprint=<fp>` (`packages/contracts/src/mobile-connect.ts:75-90`). The phone redeems it at `<api>/v1/mobile-auth/redeem` (`mobile-auth.ts:87`) and then works as an account session. A persistent link variant exists (`/v1/mobile-auth/link`, `:422`).
8. A "private network route" already exists. The host gets no STUN/TURN and filters ICE candidates to RFC 1918, RFC 6598 (Tailscale) and `.local` (`src/renderer/src/features/team/team-webrtc-private-network.ts:1-60`; set at `src/main/application-services.ts:2654`; UI `packages/ui/src/features/settings/RemoteNetworkRouteChoice.tsx`). It still uses Signal for set-up, so it still needs the Worker and Signal.

Which parts need the Worker, and which need only two reachable machines?

| Part | Needs Worker | Needs only network reachability |
|---|---|---|
| Local agents, routines, database | No | Yes (but the UI gate needs the Worker, see section 1) |
| Host registration, tickets, JWKS, memberships, invites | Yes | No |
| Phone sign-in and QR pairing | Yes (`/v1/mobile-auth/*`, `/v2/remote/*`) | No |
| Signal rendezvous | Needs a Worker-signed ticket | Signal itself only needs to be reachable |
| WebRTC data path (rpc, events, files) | No (Worker is not on the data path, `remote/README.md:7-8`) | Yes. On a tailnet or LAN, host ICE candidates are enough; TURN is useless there (see below) |
| TURN | No | Not needed on LAN or Tailscale. `remote/coturn/turnserver.conf` denies relay to RFC 1918, 100.64/10 and loopback peers, so it cannot reach tailnet hosts anyway |
| Push, Live Activity | Yes (relay holds the Apple/Firebase key and checks host machine token and session) | No |
| Slack, Discord, Telegram, GitHub events, webhook relay | Yes (route tickets) and Signal | No |

### 4. Push notifications and Live Activity

- The host seals the content for the phone, then POSTs it to the Worker with its machine token (`central-auth-manager.ts:930-1000`; `src/main/push-notifications.ts:417`, `src/main/live-activity-push.ts`).
- The Worker sends to APNs: `apps/auth-api/src/server/live-activity-relay.ts:125` (`api.push.apple.com` or `api.sandbox.push.apple.com`, HTTP/2, ES256 provider token). Routes: `apps/auth-api/src/routes/v2/remote/hosts/$hostId/live-activity.ts`, `.../notification.ts`. The Worker also checks that the phone's session is still open before it sends (`notification.ts`, `controlPlane.sessionOpen`).
- Android: `apps/auth-api/src/server/android-notification-relay.ts` sends to Firebase Cloud Messaging.
- Secrets: `APNS_PRIVATE_KEY`, `APNS_KEY_ID` (Worker secrets), `APNS_TEAM_ID = 8A47NKRZSJ`, `APNS_TOPIC = run.openbot.mobile` (`wrangler.jsonc:79-80, 273-274`), `FCM_SERVICE_ACCOUNT` (`apps/auth-api/README.md:329-345`). These are owned by nightly-labs. `apps/mobile/app.json` fixes the bundle ID `run.openbot.mobile`, and `apps/mobile/google-services.json` is nightly-labs' Firebase file.
- The phone sends its APNs/FCM token to the host (`apps/mobile/src/features/push-notifications/push-notifications-native.ios.ts:28`, `android-push-notifications.android.ts:27`).
- Consequence for the fork: iPhone push and Live Activity need your own Apple Developer team, your own bundle ID, your own `.p8` key, and your own build of the mobile app. Android needs your own Firebase project. Whether you already have an Apple Developer account: unconfirmed (asked in Open questions).
- Local dev has an HTTP/2 workaround: the local Worker runtime cannot open HTTP/2, so `apps/auth-api/dev-apns-proxy.ts` forwards from Node. A Worker run locally on the mini would need the same (`apps/auth-api/README.md:333-340`).
- The desktop "Dynamic Island" (`src/main/dynamic-island-*.ts`, `live-activity-push.ts` imports `DynamicIslandCoordinator`) is a separate goal; Live Activity push shares code with it (`live-activity-push.ts:1-30`). Another agent should own that cut; note the overlap.

### 5. Slack, Discord, Telegram

All three need the Worker and Signal.

- `docs/messaging.md:10-13, 42-46`: each "needs an OpenBot account and a name for this computer"; the platform sends events to OpenBot's Signal.
- Signal holds the bot tokens and signing secrets (`remote/api/src/config.ts`, `remote/README.md:30-110`: `SLACK_SIGNING_SECRET`, `GITHUB_WEBHOOK_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `TELEGRAM_BOT_TOKENS`). Routes are authorised by Worker-signed route tickets (`apps/auth-api` `/v2/remote/hosts/:id/slack-route`, `discord-route`, `telegram-route`).
- `apps/slack-app`, `apps/discord-app`, `apps/telegram-app` contain app manifests and launch notes only (no server code found by `ls`). The apps and bots are registered under nightly-labs and cannot be used by the fork.
- `docs/self-hosting.md:19-20` says Slack, the OpenBot Telegram bot, the GitHub App and the Live Activity relay "stay off" on a self-hosted service.
- For the fork: Slack/Discord/Telegram need you to register your own app or bot and put its secrets into your Signal. This is optional and independent of the account decision.

## Inventory

Keep = leave as is. Replace = change to a fork value. Remove = delete.

| File / area | What it does | Verdict (Option A, trimmed) |
|---|---|---|
| `src/main/central-auth-manager.ts` (2287 lines) | Account client: sign-in, session file, all `/v1` and `/v2` calls, JWKS verify | Keep. Add offline-first start. Remove billing/licence/hosting/marketplace methods |
| `src/main/application-services.ts:394, 990-1005` | Builds the manager, file name, default URL | Replace default URL with the mini's HTTPS URL |
| `packages/contracts/src/invite-links.ts:5` | `OPENBOT_CONTROL_PLANE_ORIGIN` | Replace |
| `src/main/content-security-policy.ts`, `session-configuration.ts:35` | CSP allows `*.openbot.run` and one self-hosted Signal origin | Replace with the mini's origins; drop `analytics.openbot.run` |
| `src/renderer/src/AppView.tsx:60-77`, `account-context.tsx` | Sign-in gate | Keep for A. Change so the app opens offline with a cached user |
| `src/main/server-mode.ts`, `local-server-child.ts` | Headless Linux server and no-account local servers | Keep (unrelated to the macOS mini). Useful precedent |
| `src/main/host-service.ts`, `team-store.ts`, `team-webrtc-*` | Host identity, registration, WebRTC peers | Keep |
| `src/main/billing-service.ts`, `license-service.ts` | Stripe billing and licence calls | Remove |
| `src/main/hosted-server-service.ts`, `hosted-server-bootstrap.ts`, `hosted-server-activity.ts`, `hosted-update-adapter.ts` | Paid hosted servers | Remove |
| `src/main/hosted-site-service.ts` (+ `apps/site-router`) | Hosted sites on `*.hosted.openbot.run` | Remove (needs Worker `/v1/sites`) |
| `src/main/skill-marketplace-service.ts`, `agent-marketplace-service.ts`, `agent-template-service.ts` | Marketplace through the Worker | Remove or make local-only. Decision for the owner of the marketplace area |
| `src/main/analytics.ts`, `src/renderer/src/analytics.ts`, `packages/telemetry/*`, mobile analytics | OpenPanel telemetry | Remove (or hard-disable). `PRIVACY.md` must change |
| `src/main/push-notifications.ts`, `live-activity-push.ts` | Seal and send push through the Worker | Keep. Overlaps the Dynamic Island removal |
| `apps/auth-api/src/routes/v1/me/billing`, `.../license`, `v2/hosting/*`, `v1/skills`, `v1/marketplace`, `v1/sites`, `v1/agent-templates`, `news`, `guides`, `compare`, `providers`, landing pages | Commercial and marketing surface of the Worker (555 files under `src` and `migrations` in total, 47 migrations) | Remove (large deletion, D1 migrations need care) |
| `apps/auth-api/src/routes/v1/auth`, `v1/me`, `v1/mobile-auth`, `v2/remote/*`, `.well-known/jwks.json` | Identity, pairing, tickets, memberships, push relays | Keep |
| `apps/auth-api/src/routes/v2/slack`, `v2/discord`, `v2/remote/discord-route`, `telegram-route`, messaging routes | Messaging routing | Keep disabled; remove later if unused |
| `apps/auth-api/wrangler.jsonc` | Routes on `openbot.run`, D1/R2 IDs, APNs team and topic | Replace all identifiers |
| `remote/api` (6789 lines), `remote/compose*.yaml`, `remote/coturn` | Signal, coturn, deploy files | Keep Signal; coturn optional (see Risks) |
| `apps/mobile/app.json`, `app.config.js`, `eas.json`, `google-services.json` | Bundle ID `run.openbot.mobile`, associated domain `applinks:openbot.run`, Firebase | Replace |
| `apps/mobile/src/features/auth/*`, `packages/team-client/src/remote-directory.ts`, `remote-peer.ts` | Phone sign-in, directory, WebRTC peer | Keep |
| `electron-builder.yml:21-24`, `host-release-service.ts:131`, `provider-runtime-releases.ts:46` | Update feed and blocklist on nightly-labs GitHub | Replace with the fork's repo, or remove |
| `src/main/github-connector-config.ts`, `github-bot-tokens.ts` | OpenBotGit App | Remove (separate Copilot goal; `src/main/github-device-flow.ts` already signs in to GitHub without an account server, which helps the Copilot work) |
| `docs/self-hosting.md`, `docs/hosted-servers.md`, `docs/multi-tenant-hosting.md`, `docs/aws-ecs.md`, `PRIVACY.md` | Docs for the above | Update or remove |

## Options and recommendation

### Option A: self-host Worker + Signal (+ optional coturn), keep the code mostly intact

What runs where (my design, not in the repo docs):

- Mac mini: the Worker, Signal, and Tailscale. Tailscale HTTPS (`tailscale serve`) gives the two public URLs the clients need.
- Desktop host on MacBook and mini: same code, `OPENBOT_AUTH_API_URL` and `OPENBOT_REMOTE_SIGNAL_URL` set to the mini (or compiled in).
- Phone: Tailscale app, the QR from the desktop.

How to run the Worker on the mini. Two variants:

- A1. Your own Cloudflare account, as `docs/self-hosting.md` describes. It needs Workers, D1, R2, a domain on Cloudflare (`docs/self-hosting.md:29-35`). Signal is then public or on the tailnet. This is a cloud dependency, but it is yours. The doc also asks for SMTP; `AUTH_EXPOSE_DEVELOPMENT_CODE` can replace it only if the API is not public.
- A2. Run the Worker locally on the mini with the dev path (`apps/auth-api` `bun run dev` / `scripts/dev-services.ts api`). The dev stack uses local D1 and R2 emulation and local state (`scripts/dev-services.ts:300-441`, `apps/auth-api/package.json:7`). Signal runs with `bun src/index.ts` (`remote/api/package.json:7-8`) and `REMOTE_TLS_DISABLED` (`remote/compose.dev.yaml`). I did not run either. Unconfirmed: whether the dev server is stable as a long-running service, whether the cron outbox (revocation retry, `wrangler.jsonc:22-24`) runs under a local runtime, and whether APNs works (needs the Node forwarder, `dev-apns-proxy.ts`).

Constraints found in the code that shape A:

- The account URL must be HTTPS or loopback HTTP (`central-auth-manager.ts:2025-2032`). The phone accepts `http:` only for loopback and RFC 1918 hosts, not Tailscale `100.64.0.0/10` (`packages/contracts/src/mobile-connect.ts:137-149`). So use `https://<mini>.<tailnet>.ts.net` for both services. Signal must be `wss:` (`content-security-policy.ts:43-45`; `remote-control-plane.ts:52`), or `ws:` on a private LAN address.
- The phone needs a non-empty ICE list from Signal (`remote-peer.ts:1203`). Signal always builds one from `TURN_HOST` and `TURN_SHARED_SECRET` (`tokens.ts:499-517`; both required, `remote/compose.yaml:59-60`). Unconfirmed: whether a Signal with an unreachable TURN host still connects over Tailscale host candidates. Test it before deleting coturn from the plan.
- Both hosts and the phone must use the same account service (`docs/self-hosting.md:12-14`).
- The browser client at `openbot.run/app` stops working (`docs/self-hosting.md:15`). Not needed.

Files touched (estimates):

| Work | Files | Note |
|---|---|---|
| Point at the mini: default URL, `OPENBOT_CONTROL_PLANE_ORIGIN`, CSP, Worker vars, wrangler IDs | about 8 to 12 | `application-services.ts`, `invite-links.ts`, `content-security-policy.ts`, `session-configuration.ts`, `wrangler.jsonc`, `remote/.env` |
| Mobile identity: bundle ID, associated domain, Firebase file, EAS config | about 5 | `apps/mobile/app.json`, `app.config.js`, `eas.json`, `google-services.json`, plugin Swift/Kotlin namespaces (the Android module packages are `run.openbot.*`, e.g. `apps/mobile/modules/share-files/expo-module.config.json:7`) |
| Offline-first start | about 4 to 6 | `central-auth-manager.ts` (cache the user in the session file; start as `signed_in` when the service is unreachable), `AppView.tsx`, `account-context.tsx`, the e2e `scripts/central-auth-startup-stall-e2e.ts` |
| Remove commercial code (other goal) | 60 or more, mostly deletions in `apps/auth-api` | independent of the account decision |

Keeps: phone remote access, push and Live Activity (with your own Apple/Firebase keys), multi-host (one account owns the MacBook and the mini), invitations, roles. Messaging stays off until you register your own apps. Risk: low for the protocol (nothing in it changes), medium for operations (the mini is a single point of failure, see Risks).

### Option B: remove the account, pair host and client directly over LAN or Tailscale

Design needed (none of it exists today):

- A local single-user identity replaces `CentralAuthManager` (always signed in, no network).
- Pairing: the host shows a QR with its address, its fingerprint (already in the QR, `mobile-connect.ts:75-90`) and a one-time secret. The phone stores the host address, the host key pin and a device key. The host keeps an allowlist of device keys.
- Ticket replaced: the host verifies a device key, not a Worker-signed JWT. This changes the `auth-init` frame and `verifyRemoteSessionTicket` on both ends (`team-webrtc-host-peer.ts:416-470`, `central-auth-manager.ts:1044-1111`, `packages/team-client/src/remote-peer.ts`).
- Transport: either embed a Signal in the host, or drop WebRTC for a direct encrypted WebSocket to the host over Tailscale. The Team API framing is tied to DataChannels (`packages/team-client/src/webrtc-framing.ts`, `team-webrtc-bridge.ts`).
- Multi-host: the phone keeps a local list of hosts. The remote directory (`remote-directory.ts`, `/v2/remote/hosts/`) is replaced by that list.
- Push: the host calls APNs itself (move `live-activity-relay.ts`, 279 lines, into the desktop main process; Node has `http2`). The `.p8` key then sits on each host. Revocation of a phone's token has no Worker to check `sessionOpen`.
- Members, roles and invitations (`team-store.ts` already has a password-member path, `:81, 1174-1218`) would be reduced to "paired devices".

Files touched (estimates from counts I measured):

- `src/main` + `src/preload`: 33 files reference the account (list in section 1).
- `src/renderer/src`: 15 files use auth state.
- `packages/contracts`: 10 files (CentralAuth, remote-control-plane, mobile-connect, invite-links, hosted-servers, live-activity-relay).
- `apps/mobile/src`: 61 files reference `apiUrl`, `mobile-auth` or the session.
- `packages/team-client`: `remote-directory.ts`, `remote-peer.ts`, the auth frames.
- `remote/api` (6789 lines) rewritten or embedded; `apps/auth-api` (555 files) deleted.
- Total: about 150 or more files edited or deleted, plus new pairing, device-key and transport code. Tests to rewrite: `test:team-session-revoke`, `test:mobile-connected-devices`, `test:invite-acceptance`, `test:host-key-handover`, `test:signal`, `test:central-auth-startup`.

Keeps: phone remote access (rebuilt), multi-host (rebuilt), push (rebuilt on the host). Loses: Worker-checked revocation, the central membership list, any messaging route (needs Signal), the browser client. Risk: high. It rewrites the trust boundary between host and client, and the repo marks the released Team API protocols permanent (`AGENTS.md`, "Non-negotiable"). A personal fork may change them, but the host and the phone must then change together and the legacy-client test (`test:team-legacy-clients`) loses meaning.

### Comparison

| | A (trimmed) | B |
|---|---|---|
| Files touched | about 20 for the account plus 60 or more of unrelated commercial deletion | about 150 or more, plus new code |
| Phone remote access | Kept, unchanged protocol | Rebuilt |
| Push and Live Activity | Kept; needs own Apple and Firebase keys | Rebuilt on host; same key needs |
| Multi-host (MacBook + mini) | Kept (one account, two hosts) | Rebuilt |
| Cloud dependency | None with A2; your own Cloudflare with A1 | None |
| Mini as single point of failure | Yes, mitigated by offline-first start | Less: only the host you connect to |
| Risk | Low to medium | High |
| Reversible | Yes | Hard |

### Recommendation

Choose Option A, trimmed, with variant A2 first (Worker and Signal on the mini over Tailscale HTTPS), and A1 as the fallback if the Worker does not run well as a local service.

Reasons:

1. One user needs the Worker's features at the smallest size: one account, two hosts, one phone. The protocol already handles that (the "private network" route in `team-webrtc-private-network.ts` is already tailnet-aware).
2. The Worker is the root of trust for tickets, memberships, revocation and push authorisation. B must rebuild each, and a mistake in B is a security bug on a machine where agents have `danger-full-access`.
3. The phone app depends on the account API in 61 files. B is mostly mobile work.
4. The goal "remove the OpenBot account" is met in the sense that matters: nightly-labs no longer holds anything. Your own service holds your own data.
5. If A2 proves painful, B is still possible later. The offline-first start and the deletion of commercial routes help both options.

Do first, before any removal: a spike that proves the chain "mini Worker + Signal over `tailscale serve` → MacBook host → phone" works end to end, including TURN absent and a push to a phone built with your own bundle ID.

## Risks

1. Mini as single point of failure. With A, a MacBook that cannot reach the mini is stuck on the retry screen at launch (`central-auth-manager.ts:124-125, 1433-1438, 2001-2022`; gate at `AppView.tsx:77`). The offline-first start is required, not optional. Routines on the mini keep running because the agent service does not depend on the account state (`application-services.ts:2768-2783` leaves the host unchanged while the service is failed); I did not confirm that routines run through a full restart with the Worker down.
2. Tailscale URL rules. HTTP is refused for `100.64/10` (`mobile-connect.ts:137-149`), so HTTPS through `tailscale serve` is required. Unconfirmed: certificate and MagicDNS behaviour on the phone.
3. `AUTH_EXPOSE_DEVELOPMENT_CODE=true` makes sign-in code visible to any caller. Only safe when the Worker is reachable from the tailnet only. If SMTP is skipped, add a tailnet ACL or a shared secret.
4. Cron-driven outbox. Revocation delivery and Signal-home checks use Worker cron (`wrangler.jsonc:22-24`). Unconfirmed whether a local runtime fires them. Without them a revoked phone can stay connected until its ticket expires.
5. Own Apple team, bundle ID and key. APNs topic and team are nightly-labs' (`wrangler.jsonc:79-80`). A build with a new bundle ID needs new associated domains (`app.json` `applinks:openbot.run`), a new `google-services.json`, and a TestFlight or direct install. Unconfirmed: whether you have an Apple Developer membership. Without one, iPhone push and Live Activity are not possible.
6. Native module package names are `run.openbot.*` (Android modules, e.g. `apps/mobile/modules/share-files/expo-module.config.json:7`, `app-lock/expo-module.config.json:7`). Changing the Android package ID touches these. iOS keychain service names are `openbot.*` (`ShareExtensionModule.swift:24`). Keep them to avoid churn unless the bundle ID change forces it.
7. Signal needs a working TURN configuration to start (required env, `remote/compose.yaml:59-60`), and mobile rejects an empty ICE list (`remote-peer.ts:1203`). If coturn is dropped, Signal still returns a TURN URL that will not answer. Unconfirmed that clients tolerate that.
8. Self-host docs assume a Linux server with Docker and a static IPv4 (`docs/self-hosting.md:29-35`). The mini is macOS. Signal runs with Bun directly (`remote/api/package.json:7-8`), so Docker is not strictly needed. I did not test it.
9. Deleting Worker commercial routes needs D1 migration care: 47 migrations in `apps/auth-api/migrations`. Do not edit shipped migrations. Add a new migration, or leave the unused tables.
10. `PRIVACY.md` lists the account service, OpenPanel and Stripe flows. `AGENTS.md` ("Documentation") requires `PRIVACY.md` to change when outbound data changes.
11. Licence: PolyForm Noncommercial must stay. Removing "commercial-license" code must not touch `LICENSE` or `NOTICE`.
12. The OpenBot Slack/Discord/Telegram/GitHub integrations will not work in the fork. UI that offers them should be hidden or removed.

## Existing tests and commands that cover this area

Commands come from `package.json` (root unless noted). `AGENTS.md` says: do not run broad checks locally; use `bun run test:changed`, `bun run test:related -- <source>` and `bun run test:desktop -- <path>`, one type-check project at a time.

| Area | Command |
|---|---|
| Narrow unit tests | `bun run test:desktop -- <path>`, `bun run test:related -- <source>`, `bun run test:changed` (`package.json:190-192`) |
| Account Worker unit tests | `bun run test:api` (runs `bun run --cwd apps/auth-api test`, i.e. `vitest run --config vitest.config.ts`) |
| Type checks | `bun run typecheck:node`, `bun run typecheck:renderer`, `bun run typecheck:api`, `bun run typecheck:contracts`, `bun run typecheck:team-client`, `bun run typecheck:mobile`, `bun run typecheck:remote` (`package.json:168-181`) |
| Desktop account start-up | `bun run test:central-auth-startup` (`scripts/central-auth-startup-stall-e2e.ts`); `scripts/central-auth-session-file-e2e.ts` (no named script found; unconfirmed) |
| Signal | `bun run test:signal` (`scripts/signal-security-e2e.ts`) |
| Control plane and tickets | `bun run test:remote-auth-events`, `test:remote-signal-homes`, `test:signal-entry-failover`, `test:invite-acceptance`, `test:host-key-handover`, `test:cloud-authorization` |
| Host key and sessions | `bun run test:host-key-rotation`, `test:team-session-revoke`, `test:team-api-routes`, `test:team-legacy-clients` |
| Mobile pairing and devices | `bun run test:mobile-connected-devices`, `test:mobile-share-sender` |
| Push | `bun run test:push-notification-away`, `test:desktop-notifications`, `test:notification-summary` |
| Messaging | `bun run test:messaging-pause-resume`, `test:messaging-discord-access`, `test:workflow-discord` |
| Billing and hosted (to delete with their code) | `bun run test:billing-snapshot`, `test:paid-account-identity`, `test:hosted-start-wait`, `test:hosted-held-resume`, `test:hosted-retention-wake`, `test:smtp-stall`, `test:keep-previous-assets` |
| Analytics redaction | `bun run test:analytics-redaction` |
| Live smoke | `bun run test:team-live` (`electron scripts/team-webrtc-live-smoke-app`) |
| Dev stack with a local account | `bun run dev`, `bun run dev:api`, `bun run dev:all`, `bun run dev:test-client`, `bun run dev:stop`; push key: `bun run dev:apns-key -- <file.p8>`; phone pairing in a simulator: `bun run dev:mobile` |
| Whole-area CI aggregate (do not run locally) | `bun run check:api` (`package.json:371`) and `bun run check` |

Colocated Vitest tests that name this area: `src/main/content-security-policy.test.ts` (asserts `OPENBOT_REMOTE_SIGNAL_URL needs OPENBOT_AUTH_API_URL.` at line 58). Others were not listed one by one.

## Data migration (item 7)

- `openbot.db`: no account column found. Evidence: `grep -nE "account|email|session_token|membership|member_id|owner" src/backend/openbot-database-schema.ts` returns only `member_id` (DM and thread tables, `:233, 325-339`) and `owner_kind/owner_id` for attachments (`:66, 291-292, 479`). `member_id` is a host-local team member ID. In `team-store.ts:79-83` the account ID is a separate optional field (`accountId?`), so removing or replacing the account does not rewrite the database. Unconfirmed: I did not trace every writer of `member_id` to prove the value is never an `accountId`. Check `src/backend/database/*` before B. `AGENTS.md` says migrations are irreversible and no backup is made; Option A needs no migration.
- `openbot-team-server-v2.json` (`application-services.ts:392`): hosts are keyed by account (`team-store.ts:136-160`, `activeAccountId`, `StoredMember.accountId`). It is "append-only - a host is never removed when its owner signs out". In A nothing changes. In B, write a reader that keeps the host key, members and invites and replaces only the owner link. Never drop `hosts` (user data with no backup). The older `openbot-team-server-v1.json` (`:390`) and `legacyImport` handling exist and must keep reading.
- `openbot-central-auth-v1.bin`: version 2 format; A keeps it. For offline-first start, add a field for the cached user and keep reading older files (`restoreStoredSession` already handles a plain token and version 2, `central-auth-manager.ts:1968-1989`).
- `servers.json` v3 (`src/main/remote-server-stored-shape.ts:1-70`): entries have `transport: "webrtc-v2"`, `apiUrl`, `fingerprint`, `role`, `memberLimit`, `hosted`. The file says an unreadable entry must be preserved. If you remove `hosted` or `memberLimit`, keep the reader tolerant of them.
- Mobile: the session in secure storage carries `apiUrl` (`mobile-auth.ts` `MobileSession`). A new account URL means every phone signs in again. The encrypted workspace cache is deleted at sign-out (`AGENTS.md`, product constraints).
- Released Team API: Option A changes no wire message. Option B must change together: the Signal ticket claims (`ticket.ts`), the `auth-init`/`auth-ready` frame transcript (`team-webrtc-host-peer.ts:416-470`), the mobile directory calls, and `remote/api` auth. In a one-user fork the only clients are this desktop and this phone, so a single coordinated change is possible. Keep `test:team-legacy-clients` as a guard for the HTTP routes you leave in place.

## Open questions

1. Do you have an Apple Developer membership, and which bundle ID should the phone app use? It decides whether iPhone push and Live Activity are possible. (Block for push.)
2. Are you willing to use a free Cloudflare account (A1) if the local Worker (A2) is not stable? Or must nothing run on Cloudflare?
3. Is the phone reachable by Tailscale at all times when away from home (Tailscale app with always-on VPN), or must the mini also be reachable without it?
4. Should the MacBook open and work when the mini is off? The report assumes yes and lists offline-first start as required.
5. Keep Slack, Discord or Telegram? If yes, you must register your own app or bot and put its secrets into your Signal.
6. Keep the Android build, or iPhone only? It decides whether the Firebase work is needed.
7. Which owner takes the Dynamic Island cut, given `live-activity-push.ts` imports `DynamicIslandCoordinator`?
8. Is the desktop auto-updater active in packaged builds? Update feed points to nightly-labs (`electron-builder.yml:21-24`). Unconfirmed: I did not find where `electron-updater` is called.
9. Do routines on the mini keep running after a restart when the Worker is down? Needs a test on the mini.
