# Commercial and phone-home removal: inventory for the personal fork

Repo: `/Users/hridyaagrawal/honey/openbot` at `de784cee2`. Research only. No code changed.
Method: `git ls-files`, `git grep`, and reading the files named below. I did not run the app, a
build, knip, or any test. Counts are `wc -l` over tracked text files (binary art excluded unless
stated). Anything marked **UNCONFIRMED** I inferred and did not observe.

## Summary

1. The fork has three kinds of upstream coupling: money (Stripe, boat servers, license seats), telemetry (OpenPanel at `analytics.openbot.run`, in desktop, web, mobile, Worker and Signal), and update/feeds (GitHub releases of `nightly-labs/openbot`, a raw blocklist on `main`, an upstream-built remote desktop runtime).
2. Cheapest safe cuts first: delete `publish:` from `electron-builder.yml` (no `app-update.yml`, so the updater stays off), stop the OpenPanel transport, and repoint or delete `BLOCKED_VERSIONS_URL`. Those three stop all automatic traffic to upstream.
3. Deletable bulk: about 34k lines in 158 files for hosted servers, billing and license; about 31k lines (plus 35 MB of art) for the openbot.run marketing site; about 10k lines for telemetry plus 95 call-site files; 163,689 lines in 1,272 files for 12 non-English locales.
4. Hidden couplings to respect: invite flow in `ServerMembersSection.tsx` has a license step; `AddServerOverlay` and the mobile `hosted-server/` route folder also hold join/scan/local flows; 44 files import `@openbot/telemetry` only for `classifyFailure`/types; "plan limits" and `FirstRunPlanStep` are provider plans, not billing (keep).
5. Recommended identity: new `appId`, `productName`, user data folder and URL scheme (side by side), one-time copy of the old data folder, no auto-update, local unsigned or self-signed builds from `bun run package`.

## Scope notes (read first)

- "OpenBot account" removal (sign-in, host registry, Signal tickets, mobile pairing) is another area. I list its coupling here only where it blocks a commercial deletion.
- `apps/auth-api` is one Worker that holds the shop, the website, the marketplace, sign-in, Signal tickets, push relays and the web client. Deleting the shop does not delete the Worker.
- The repo rule in `AGENTS.md`: do not run broad checks locally; use narrow tests, `typecheck:*`, and `biome check --write` on changed files. `bun run knip:check` is about 6 s (`docs/development-checks.md:201`), so it is the one broad check that fits that rule.

---

## Inventory

Legend: **Remove** = delete. **Replace** = keep the file, change content. **Trim** = delete part. **Keep** = a false positive.

### 1. Paid hosted servers, Stripe, plans, boat, license seats

Money flow: desktop/web UI -> `window.openbot.hostedServers|billing|license` IPC -> main services -> `api.openbot.run` Worker -> Stripe and boat. Evidence: `packages/contracts/src/ipc-endpoints.ts` groups `billing`, `license`, `hostedServers`; `packages/contracts/src/hosted-servers.ts:15-17` (boat machine sizes), `:23-27` (plan to size map).

| Path | What it does | Action | Dependents / notes |
| --- | --- | --- | --- |
| `apps/auth-api/src/server/{stripe-client,billing-*,hosted-billing,hosted-server-service,boat-client,license-service}.ts` | Stripe checkout, portal, webhooks; boat sandbox create/stop/wake; license seats | Remove | `routes/v1/stripe/webhook.ts`, `routes/v1/me/{billing,license}/*`, `routes/v2/hosting/**`, `routes/billing/return.tsx`, `worker-handler.ts` cron (`wrangler.jsonc:23` has `*/5` cron that wakes servers) |
| `apps/auth-api/src/server/hosted-site-*.ts`, `routes/v1/sites/**` | Hosted sites, limited by the server plan | Remove (see 1b) | `apps/site-router`, `migrations/0016`, `0024` |
| `apps/auth-api/migrations/00{22,23,24,28,31,35,38,41}_*.sql` + `test/{billing,hosted,license}*-migration.test.ts` | D1 schema for billing, servers, licenses | **Keep the .sql files.** Add a new drop migration only if the D1 database is kept | D1 migration order is positional; deleting history breaks `migrations/` numbering. Different DB from `openbot.db` (`apps/auth-api/AGENTS.md`, "D1 migrations run before the Worker") |
| `apps/auth-api/scripts/{billing-snapshot,hosted-held-resume,hosted-retention-wake,hosted-start-wait,paid-account-identity}-e2e.ts` | E2E for the above | Remove | Named in root `check:api` (`package.json:371`) and scripts at `:336-338,346-347`; edit those script entries |
| `apps/auth-api/wrangler.jsonc:70-72` | `HOSTED_SERVERS_ENABLED=true`, `HOSTED_SERVERS_ALLOWED_USER_IDS="*"` | Remove | |
| `scripts/hosting/**` (22 files with `scripts/stripe-*`) | boat template build, Linux hosted/self-host installer, systemd units, AppArmor | Remove (Mac-only fork). The Linux self-host path (`docs/self-hosted-server.md`) shares these | `electron-builder.yml:176-185` ships `scripts/hosting` for Linux; `package.json:99-100` `hosting:*`; `api:stripe:bootstrap` |
| `src/main/{billing-service,license-service,hosted-server-service,hosted-server-activity,hosted-server-bootstrap,hosted-server-start-retry}.ts`, `src/main/ipc/{billing,hosted-server,license}-handlers.ts` | Main-side adapters | Remove | `application-services.ts` wiring ("services.hosted" mark `:2315`); `remote-server-manager.ts:236-241` `HostedServerWakeHooks`; `central-auth-manager.ts:1602-1620` `redeemHostedServerClaim` |
| `packages/contracts/src/{billing,hosted-servers,license}.ts` | Wire and IPC types | Remove | `ipc-endpoints.ts` (imports `:35`, `:569`), `ipc-desktop-apis.ts:85-89`, `src/preload/index.ts`, `app-decoding.ts`, `mock-openbot.ts`. `scripts/verify-preload-bundle.ts` fails if the preload and `IPC_ENDPOINTS` disagree |
| `packages/team-client/src/hosted-server-wake.ts` (254 lines) | Wake a sleeping hosted server | Remove | `remote-server-manager.ts:86-88` |
| `packages/team-client/src/plan-limits.ts` | Provider usage windows (5-hour, weekly) | **Keep** | Not billing: it reads provider account usage |
| `packages/ui/src/features/billing/**` (12 files) | `BillingPanel`, `BillingDialog`, `LicenseSection`, `OrderForm`, stores | Remove | Imported by `SettingsModal.tsx:30-32,362-368` and `WebWorkspace.tsx:86-88,2384-2393`. `formatMinorMoney` from `LicenseSection` is also imported by `ServerMembersSection.tsx:52` |
| `packages/ui/src/features/servers/{HostedServerPricing,HostedServerUpsellDialog,HostedServerUpsellNotice,hosted-server-upsell-host,hosted-server-upsell.css}` | Upsell | Remove | `src/renderer/src/features/servers/hosted-server-upsell*.ts(x)` |
| `packages/ui/src/features/settings/{SettingsHostedServersTab.tsx,hosted-servers.css,stores/hosted-servers-store.ts}` | Settings tab for hosted servers | Remove | `settings-tabs.ts:25-28,156-158,195-197,214` (tabs `billing`, `hosted-servers`) |
| `src/renderer/src/features/servers/AddServerOverlay.tsx` (450 lines) + `packages/ui/src/features/servers/AddServerDialog.tsx` (704 lines) | The plus button on the server rail: sells plans and licenses | **Trim, not delete.** Keep join-by-invite and local server flows | Imports `HostedServerPricing`, license types at `AddServerOverlay.tsx:7-22`; `JoinServerDialog.tsx`, `ServerRail.tsx`, `ServerStatusDialog.tsx`, `ServerConnectionNotice.tsx` mention hosted |
| `src/renderer/src/features/servers/ServerMembersSection.tsx` | Member invites | **Trim.** Remove the license step | `:7-9` imports `License`, `licenseMonthlyAmount`; `:140-141` `licenseStep` state; `:299-301` the account service refuses a join above the license |
| `src/renderer/src/features/web-client/web-{billing,hosted-servers,hosted-server-state,hosted-server-wake}.ts`, `web-account.ts`, `web-host-lifecycle.ts` | Web client billing and wake | Remove / trim | `WebWorkspace.tsx:1019-1020,2193,2264` |
| `src/renderer/src/preview/mock-{billing,hosted-servers,license}.ts` | Preview mocks of the IPC | Remove | Must match IPC surface (`AGENTS.md`, "Surfaces to check") |
| `src/renderer/src/features/settings/license-analytics.ts`, stories `{Billing,BillingServerLifecycle,HostedServerUpsell,License,OrderForm,AddServerFlow}.stories.tsx`, `billing-server-lifecycle-story.css` | Stories and analytics | Remove | |
| `apps/mobile/src/app/(app)/hosted-server/*` | Route folder: `index`, `setup`, **`join`, `scan`, `local`** | **Trim.** Keep `join`, `scan`, `local` (re-home them) | `_layout.tsx`, `apps/mobile/src/app/(app)/_layout.tsx`, `scan-invite-screen.tsx`, `local-server-options.tsx` |
| `apps/mobile/src/features/servers/{api/hosted-servers.ts,model/hosted-server-{availability,plans}.ts,screens/hosted-server-{plans,setup}-screen.tsx}` | Mobile plan purchase | Remove | `server-drawer-content.tsx`, `server-settings-screen.tsx`, `mobile-workspace-context.tsx`, `query-keys.ts`, `workspace-types.ts`, `onboarding-flow.tsx` |
| `apps/mobile/src/features/servers/{model/plan-limits.ts,components/plan-limit-*,screens/plan-limits-screen.tsx}`, `src/app/(app)/plan-limits/*` | Provider usage limits | **Keep** | Not billing |
| `src/renderer/src/features/onboarding/FirstRunPlanStep.tsx`, `usage/plan-limit-rows.ts`, `src/backend/agent/{plan-continuation,plan-updates,usage-pricing}.ts`, `chat-plan.tsx`, `agent-plan-card-v1.ts`, `conversation-plan-v4.ts` | Provider plans, agent task plans, token price display | **Keep** | `FirstRunPlanStep.tsx:11` "the plan providers to connect". `usage-pricing.ts` is useful for the token-cost goal |
| `resources/plugin-catalog/stripe/1.0.0.json`, `apps/auth-api/src/content/plugins/stripe.ts` | A third-party Stripe MCP plugin entry | **Keep** (or drop with the plugin catalog) | Not the shop |
| `docs/{hosted-servers,multi-tenant-hosting,aws-ecs}.md` | Docs | Remove (check `aws-ecs.md` first; **UNCONFIRMED** it is hosting-only) | `scripts/check-doc-links.ts` fails on dead links |
| `packages/contracts/src/hosted-servers.ts:89` `HOSTED_SERVER_CONTACT_URL` (`mailto:hello@openbot.run`) | Sales email | Remove with the file | |
| i18n: `messages/<l>/billing.ts`, `messages/<l>/error/billing.ts` | 2 files per locale | Remove (en: 248 lines; all 13 locales: 26 files, 3,019 lines) | More keys sit inside `settings.ts`, `server.ts`, `mobile/*`. Found by `bun run i18n:check` (fails on "an English key no code names", `scripts/i18n-check.ts:11`) |

**1b. Hosted sites (publish a web page to `*.openbot.site`).** Depends on the account Worker and on the server plan's site limit (`hosted-site-service.ts:85-86,318`).

| Path | Action | Notes |
| --- | --- | --- |
| `apps/site-router/**` (6 files, 559 lines), `scripts` `sites:*` (`package.json`), `wrangler r2` bucket scripts | Remove | `typecheck:sites` script `package.json:177`; `knip.config.ts` entry for `apps/site-router` |
| `src/main/{hosted-site-service,ipc/hosted-site-handlers,team-api/route-hosted-sites}.ts`, `src/backend/agent/hosted-site-{coordinator,events}.ts`, `src/backend/database/hosted-site-event-log.ts`, `packages/contracts/src/{hosted-sites,ipc-hosted-sites}.ts`, `SettingsHostedSitesTab.tsx`, `hosted-site-timeline.ts` | Remove the feature, **keep readers of old rows** | Old `openbot.db` conversation rows have `item_type` with the `HOSTED_SITE_EVENT_ITEM_TYPE_PREFIX`; `conversation-read-store.ts:302,410` and `database/conversation-queries.ts:397,738` filter on it. Keep that constant and those filters |
| `packages/contracts/src/team-protocol/hosted-sites-v1.ts` | **Keep** (frozen) | `AGENTS.md`: "Released Team API adapters are permanent"; `knip.config.ts` ignores unused exports for `team-protocol/v*.ts`. An old host can still send it |
| `src/backend/agent/attention-registry.ts:66,988` | Trim `HOSTED_SITE_APPROVAL_METHOD` | A pending approval row could carry this method: **UNCONFIRMED** how an old row decodes. Check before removal |

Size of item 1: 158 files, 34,431 lines (auth-api 15,075; scripts 6,443; ui 5,686; renderer 2,516; contracts 1,283; docs 1,339; mobile 924; main 911; team-client 254), excluding i18n and mock overlap. Item 1b adds 29 files, 3,382 lines (site-router 559 counted again in item 2).
Overlap note: the auth-api number includes the pricing page, commercial-license page and one guide that item 2 also counts (about 1.5k lines).

### 2. Commercial license purchase, CLA, website, status page

| Path | What it does | Action | Notes |
| --- | --- | --- | --- |
| `apps/auth-api/src/{routes/pricing.tsx,routes/commercial-license.tsx,routes/commerciallicense.tsx,components/pricing/**,components/legal/CommercialLicensePage.tsx,content/commercial-license.tsx,lib/{commercial-license,pricing-offer,pricing-page}.ts,components/landing/PricingSection.tsx}` | Price and license pages | Remove | `routeTree.gen.ts` is generated: regenerate, do not hand-edit |
| `apps/auth-api/src/content/{compare,guides,news,providers,plugins}/**`, `components/{landing,compare,teams,download,changelog,providers,brand,content,contact,plugins,marketplace,agents}/**`, `routes/{index,teams,compare,guides,news,providers,plugins,marketplace,agents,download,branding,brand,changelog,contact,llms[.]txt,sitemap[.]xml}*`, `content-art/**`, `content-image*.ts`, `render-content-images.ts` | The openbot.run marketing and content site | Remove (256 text files, 31,269 lines; `content-art` is 185 files, 35 MB) | `compare/` is 17 content files + 9 components. `content/plugins` feeds `plugin-catalog.generated.ts` (`knip.config.ts` ignores it) and the **desktop and mobile plugin catalog** (`apps/mobile/.../plugin-catalog.generated.ts`, `scripts/build-plugin-catalog.ts:620` builds `shareUrl`): not pure marketing. Check before deleting |
| `apps/auth-api/src/content/{terms,privacy-policy,dpa}.tsx`, `routes/{terms,privacy,privacy-policy,dpa}.tsx` | Legal pages for the service | Remove with the Worker pages | `FirstRunFlow.tsx:41-42` links `https://openbot.run/terms` and `/privacy`: replace with local text or drop |
| `apps/auth-api/src/routes/{app,app-preview,join}.tsx`, `v1/mobile*`, `v2/remote/**`, `[.]well-known/*` | Web client `/app`, invite landing, mobile pairing, universal links | **Not commercial. Account area.** Do not delete under this item | `join` is checked by CI (`ci.yml:1166`); `apple-app-site-association` pins `ZTRDTUL87R.app.openbot.desktop` (`ci.yml:1177`) |
| `README.md:4,680-682` | Says "Buy a commercial license in Settings -> Billing" | Replace | Keep the PolyForm statement; delete the purchase sentence |
| `CLA.md`, `.github/workflows/{cla,contribution-policy,norbiai-review}.yml`, `scripts/{cla,contribution-policy}.ts`, `.github/norbiai-review-prompt.md`, `.github/review/**`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/**`, `CONTRIBUTING.md:186` | CLA assigns copyright to Synthetify Labs; contribution bots | Remove CLA files and workflows (11 files, 2,644 lines). Edit `CONTRIBUTING.md` | **Do not touch `LICENSE` or `NOTICE`.** They carry the required notices (`LICENSE:75-77`, `NOTICE:2-6`). Keep the "commercial license, contact licenses@openbot.run" line there: the license requires that notice to stay |
| `apps/status/**` (14 files, 2,980 lines), `.github/workflows/status-page.yml` (395), `scripts/status-page-smoke.ts`, `docs/status-webhooks.md`, `ISSUE_TEMPLATE/status-incident.yml` | Public status page for `api./signal.openbot.run` | Remove | `typecheck:status`, `status:build`, `status:smoke` in `package.json`; `scripts/update.ts:67,87-88,111` polls upstream |
| `scripts/{deploy-auth-api,discord-announcement,discord-release-announcement,discord-mobile-release-announcement}.ts`, workflows `{cloudflare-preview,mobile-release-announcement,release-android,release-ios}.yml` | Upstream deploy and announcements | Remove | Most workflows are gated on `github.repository == 'nightly-labs/openbot'` (`provider-cli-canary.yml:20`, `status-page.yml:41`) so they already skip on a fork: **UNCONFIRMED** for `ci.yml` and `release.yml` |
| `apps/{discord-app,slack-app,telegram-app}` | Connector app manifests pointing to `signal.openbot.run` (`slack-app/production/manifest.json:41`) | Leave. Messaging area | Needs the Signal host: other area |
| `remote/**` (34 files, 7,837 lines) | Signal, TURN, nginx, compose for `signal.openbot.run` | Leave. Remote/multi-host area | `remote/.env.production` is checked in encrypted: do not read it |

### 3. Analytics and telemetry

What leaves the machine, by surface. Evidence is the transport code; I did not capture traffic.

| Surface | Destination | Code | Gate |
| --- | --- | --- | --- |
| Desktop main (host events: turns, tools, sites, tokens, resources, inventory) | `https://analytics.openbot.run/api` | `src/main/analytics.ts:38-42` (client id and origin hard coded), `:5` `OpenPanelBase` | Packaged build. Preference file `analytics-preference-store.ts`. `ANALYTICS.md:99` says default on; first-run box default follows region (`packages/telemetry/src/analytics-region.ts:1-9`: US on, EU/UK/BR/CA off) |
| Desktop renderer (product events) | same host | `src/renderer/src/analytics.ts:37` | `window.location.origin === "https://openbot.run"` for web (`:900`, `error-reports.ts:132`) |
| Error reports | same, `/api/track` via `openPanelTransport` | `packages/telemetry/src/transport.ts:13`; queue file `openbot-error-reports-v1.json` (`application-services.ts:2795`; mobile `failure-reports.ts:21,33`) | Same preference. The name "openbot-error-reports" is a local retry queue, not a separate service |
| Mobile | same host | `apps/mobile/src/features/analytics/mobile-analytics.ts:60` (`@openpanel/react-native`, `apps/mobile/package.json:40`) | Mobile preference |
| Account Worker | OpenPanel (sales, revenue, `email_sent`, account created) | `apps/auth-api/src/{lib/analytics,server/{account-analytics,sales-analytics-delivery,account-attribution}}.ts`, `routes/v1/me/analytics.ts` | Not stopped by the desktop setting (`PRIVACY.md` says so) |
| Signal | OpenPanel every 5 min (TURN allocations, connections) | `remote/api/src/capacity-report.ts:76` | Env `OPENPANEL_TRACK_URL` |
| CSP | allows `https://analytics.openbot.run` | `src/main/content-security-policy.ts:23`, test `content-security-policy.test.ts:5-9` | Remove the host, update the test string |
| Electron crash reporter | **Off**: `crashReporter.start({ uploadToServer: false })` | `src/main/index.ts:270` | Good. No change |
| Diagnostics uploads | None found | `src/main/remote-diagnostics.ts`, `src/backend/{stderr,browser}-diagnostics.ts` write local logs only | I searched `src/main`, `src/backend`, `packages/team-client` for outbound hosts (list in section 4). **UNCONFIRMED** for `apps/mobile` native modules |
| Install ID | Random id file | `packages/telemetry/src/install-id.ts`, `src/main/analytics-install-id.ts` | Local only after removal |
| Sentry, PostHog, Segment, etc. | None as SDKs | `git grep` hits only plugin catalog entries (`content/plugins/{sentry,posthog}.ts`) | |

Files and sizes:

| Item | Files | Lines | Action |
| --- | --- | --- | --- |
| `packages/telemetry/**` | 10 | 850 | Remove last (see order). **44 files import `classifyFailure`, `FailureProperties`, `NotificationMetadata`, `safeProperties`** (e.g. `packages/ui/src/{alert,toast}.tsx`, `AddServerOverlay.tsx:10`). Keep a tiny local failure classifier if toasts need it, or inline |
| Desktop: `src/main/analytics*.ts` (7 files, `analytics.ts` 1,291), `src/renderer/src/{analytics,error-reports}.ts` (1,097 + 252), `web-analytics.ts`, `attachment-analytics.ts`, `AnalyticsConsent.tsx` (113), `mock-agent-analytics.ts`, `packages/contracts/src/{ipc-agent-analytics,ipc-host-analytics,team-protocol/{host-,}analytics-v1}.ts`, `packages/team-client/src/{agent,host}-analytics.ts` | 21 | 4,172 | Remove. IPC `getAnalyticsPreference`, `getAnalyticsDefault`, `setAnalyticsPreference` (`ipc-endpoints.ts:668-673`) go with them. `team-protocol/*analytics-v1.ts` is a **released adapter**: keep the codec, drop callers |
| Mobile `apps/mobile/src/features/analytics/**` | 9 | 980 | Remove; `@openpanel/react-native` |
| Account Worker analytics + D1 `0030_sales_analytics.sql`, `0043_user_analytics_enabled.sql` | 9 | 1,970 | Remove code, **keep migration files** |
| `ANALYTICS.md` (416), `docs/architecture/analytics.md` (176), `scripts/{analytics-redaction-e2e,backfill-openpanel-identities,openpanel}.ts`, `.agents/skills/openpanel/SKILL.md`, `scripts/signal-capacity-report-smoke.ts`, `remote/api/src/capacity-report.ts` | 8 | 1,919 | Remove; update `PRIVACY.md` (`AGENTS.md`: "PRIVACY.md when outbound data changes") |
| Call sites that call `desktopAnalytics.track`, `webAnalytics`, `mobileAnalytics` | about 48 renderer/ui files, 65 mobile files (95 files total across desktop surfaces by my grep) | edits only | Mechanical. Do this before deleting the package |
| Dependencies | `package.json:44` catalog `@openpanel/web`, `:417`, `apps/auth-api/package.json:29`, `apps/mobile/package.json:40`, `package.json:437` `tldts` | | `tldts` is also used by `src/backend/{agent/attention-registry,password-vault}.ts`: keep. `package.json:147` `analytics:backfill` script |

The redaction rule in `AGENTS.md` ("Redact secrets on every log, export, and send path") stays. `packages/logging` (`redactText`) is separate and stays. Keep `scripts/analytics-redaction-e2e.ts` out of the delete list only if you keep any send path; after removal it has nothing to test.

### 4. Auto-update and runtime downloads

How the desktop finds new versions:

1. `electron-builder.yml:21-24` `publish: {provider: github, owner: nightly-labs, repo: openbot}`. At package time electron-builder writes `app-update.yml` into the app resources from this block (**UNCONFIRMED** by a package run; this is standard electron-builder behavior).
2. `src/main/application-services.ts:3183` `updateMetadataAvailable = app.isPackaged && existsSync(join(process.resourcesPath, "app-update.yml"))`. `:3196-3203` `updatesEnabled` needs it (or the hosted installer paths). `:3208-3231` otherwise uses `createDisabledUpdateAdapter()`. So **no `app-update.yml` means updates stay off** with no code change.
3. `src/main/update-service.ts` (988 lines) drives `electron-updater` (`package.json:425` `electron-updater 6.8.11`). `:261` `allowPrerelease = false`.
4. A second reader: `src/main/host-release-service.ts:72` fetches `https://github.com/nightly-labs/openbot/releases/latest/download/<latest-mac.yml|latest.yml|latest-linux*.yml>` to show a "newer release" status for hosts.
5. `scripts/host-manager-macos.ts:160,174` calls `api.github.com/repos/nightly-labs/openbot/releases/latest` and downloads `OpenBot-<v>-arm64.dmg` for the shared app `/Applications/OpenBot.app` (`:11`). Entry points `scripts/host-manager.ts`, `scripts/openbot-host-macos.ts`, `scripts/install-host-update-agent.sh`.
6. `scripts/{install-server.sh:22,hosting/openbot-hosted-update:30}` fetch upstream releases. `nix/package.nix:24,30-31` points at upstream. `docker/*.yaml` use `ghcr.io/nightly-labs/openbot`.
7. `src/main/app-archive-watch.ts:18,84` opens `https://openbot.run/download` in a dialog.
8. Mobile: `apps/mobile/src/features/app-update/model/app-update.ts:32` changelog URL.

Provider CLI auto-download:

- `src/main/provider-runtime-manager.ts:145` checks every hour (`UPDATE_CHECK_INTERVAL_MS`), started by `application-services.ts:2150` `startUpdateChecks`. It fetches the latest release from each vendor: GitHub `openai/codex` (`provider-runtime-releases.ts:154`), npm registry for Claude, OpenCode, Cline, GitHub `earendil-works/pi` (`:76`), `MoonshotAI/kimi-cli` (`:342`), `api.meta.ai` and `lookaside.facebook.com` (`:105-131`), the ACP registry for Antigravity and Cursor (`:255`, `:297`). These are vendors, not upstream. They stay unless you want pinned CLIs only.
- **Upstream coupling:** `provider-runtime-releases.ts:45-46` `BLOCKED_VERSIONS_URL = https://raw.githubusercontent.com/nightly-labs/openbot/main/provider-runtime-blocklist.json`, read each check (`:381-390`, `provider-runtime-manager.ts:538-559`). A failed read is ignored (`if (Result.isSuccess(blocked))`), so the fork keeps working offline but trusts upstream's list when online. Upstream can also make the fork skip a version. Replace with a local read of the bundled `provider-runtime-blocklist.json` (all arrays are empty today: `provider-runtime-blocklist.json:3-15`).
- `native-runtime.lock.json` pins versions and SHA-256 per platform for codex, claude, bun, opencode, etc. It is the fallback ("offer the pinned copy again", `provider-runtime-manager.ts:211`). Keep. Its `remoteDesktop.artifactRelease` (`:387-393`) names `nightly-labs/openbot` and a tag; `scripts/install-remote-desktop-runtime.ts:45-56,111-118` downloads that release at build time (`prepare:remote-desktop-runtime` is in `package` and `dist:mac`). Hash-pinned, so it is safe, but **a build of the fork needs upstream's release to stay online**. Either keep it (state the dependency), or rebuild the runtime in the fork (`.github/workflows/remote-desktop-runtime.yml`, 630 lines) and change the repository.

What must change so the fork never installs an upstream build:

| Change | Where | Effect |
| --- | --- | --- |
| Delete the `publish:` block (or point it at the fork repo) | `electron-builder.yml:21-24` | No `app-update.yml`; `updatesEnabled` false (`application-services.ts:3183-3203`). Also decide `electronUpdaterCompatibility` (`:10`) |
| Remove `electron-updater` after that | `package.json:425`; `update-service.ts`, `hosted-update-adapter.ts`, IPC `update-handlers.ts`, UI `packages/ui/src/features/updates/**` | Optional second step. Check `host-update-coordinator.ts`, `requested-update.ts` first: they serve admin-requested restarts on joined servers (`host-update-v1`, released protocol) and the multi-host area may need them |
| Point or delete `host-release-service.ts:72` | | Stops the GitHub poll |
| Replace `BLOCKED_VERSIONS_URL` | `provider-runtime-releases.ts:45-46` | Stops reliance on upstream `main` |
| Remove `scripts/host-manager-macos.ts:160,174` fetch, or point to a local DMG path | | The Mac mini host manager would otherwise stage upstream DMGs |
| `scripts/{merge-mac-update-manifests,verify-update-artifacts}.ts`, `scripts/{prepare-release,release-preflight}.ts`, `release.yml` (1,317 lines) | | Remove with the publish flow |
| Fork update path | | Rebuild and copy the app to the MacBook and the Mac mini (`bun run package`), or add a sync script. macOS auto-update needs a Developer ID signature (**UNCONFIRMED** for a self-signed key) |

### 5. Branding, signing, URL schemes

Current values:

- `electron-builder.yml:1-2` `appId: app.openbot.desktop`, `productName: OpenBot`; `:3` copyright line for Synthetify Labs; `:4-8` scheme `openbot`; `:93-97` `notarize: true`, `hardenedRuntime: true`; `:130-131` entitlements; `:134` `ElectronTeamID: ZTRDTUL87R`.
- `build/entitlements.mac.plist` has `com.apple.developer.associated-domains` `applinks:openbot.run` and `com.apple.developer.team-identifier ZTRDTUL87R`.
- `electron-builder.windows-signing.yml` (Azure signing, `SYNTHETIFY LABS` publisher name; `:11-13`). Windows is out of scope for a Mac fork: remove.
- `src/main/index.ts:261` `app.setName("OpenBot")`; `:264` single instance lock; `:932` `setAsDefaultProtocolClient("openbot")`; `deep-link-router.ts:44` `MCP_OAUTH_REDIRECT_URL = "openbot://mcp-auth"`; `application-services.ts:1443,1483` falls back to a loopback listener for servers that refuse `openbot://`.
- Mobile: `apps/mobile/app.json:9,12,14,23` scheme `openbot`, bundle id `run.openbot.mobile`, `applinks:openbot.run`.
- Packaged user data folder follows the app name (Electron default `~/Library/Application Support/<name>`; the code only overrides it for dev: `index.ts:247-259`).
- `scripts/{host-manager-macos.ts:11,build-host-installer.ts:51-54,install-host-update-agent.sh:78,verify-macos-package.ts}` hard-code `OpenBot.app`.
- `package.json:1-20` name, author (`Norbert Bodziony`), repo and bug URLs.

**Recommendation: side by side, with a new identity.** New `appId`, `productName`, URL scheme and user data folder; a one-time copy of the old data folder; no auto-update.

Why not "replace upstream under the same id":

- The same `productName` shares the data folder with upstream. A migration of `openbot.db` runs on first launch and `AGENTS.md` says no backup is made, so you cannot go back to the upstream app.
- The same `openbot://` scheme and the same Keychain and single-instance names make the OS pick one app for invite and OAuth links.
- Any stray upstream update would overwrite the fork. Removing `publish` stops that, but a separate id makes it impossible.

What the rename touches (each needs a check, none done): `electron-builder.yml` (`appId`, `productName`, `protocols`, `copyright`, `publish`, `mac.extendInfo.ElectronTeamID`, `mac.notarize`), `build/entitlements.mac.plist` (drop associated-domains and team identifier), `index.ts:261,932`, `deep-link-router.ts:44` plus its tests, `host-manager-macos.ts:11`, `update-sibling-instances.ts` (matches the executable name), macOS scripts above, `package.json` metadata, mobile `app.json` scheme and bundle id (only if the phone app stays), `build/installer.nsh` (Windows, remove). Keep `LICENSE` and `NOTICE`; the `copyright:` line in `electron-builder.yml:3` can name the fork's maintainer in addition, but leave the upstream required notices in the two files.

Signing for the two Macs (inference from macOS behavior, **UNCONFIRMED** in this repo):

- `bun run package` already builds unsigned (`--config.mac.identity=null --config.mac.notarize=false`, `package.json` line with `"package"`), so a local build needs no Apple account.
- Computer Use needs Screen Recording and Automation grants. macOS ties grants to the code signature. An ad-hoc signature changes on every build, so grants may reset each rebuild. A stable self-signed code-signing certificate on each Mac avoids that. The entitlements `associated-domains` and `team-identifier` are restricted ones and can stop a locally signed app from launching: remove them from the plist.

### 6. Size of the removal and deletion order

Estimated text lines (files), excluding i18n unless stated:

| Item | Files | Lines | Notes |
| --- | --- | --- | --- |
| A. Hosted servers, billing, license | 158 | 34,431 | +3,019 lines of i18n across locales (26 files) |
| A2. Hosted sites + site-router | 29 | 3,382 | 559 of it is site-router |
| B. Website, marketing, legal pages | 256 (+185 art files, 35 MB) | 31,269 | overlaps A by about 1.5k lines |
| B2. CLA, bots, status page | 29 (11 + 18) | 7,264 | |
| C. Telemetry | 57 | 9,891 | plus about 95 call-site files edited |
| D. Update and release flow | about 14 | 2,471 in `src/main` update files + 7,026 in renderer/ui update files (includes shared UI; not all removable) | Optional deep cut |
| E. i18n, non-English | 1,272 | 163,689 | 12 locales |
| Total deletable, rough (A, A2, B, B2, C, E; D not counted) | about 1,800 files | about 247,000 lines (sum 249,926, minus about 2,000 of overlap); about 83,000 without i18n | Of 7,024 tracked files |

Dependency order (delete leaves first; each step ends with the commands in the next section):

1. **Stage 0, stop the traffic (no deletions).** `publish:` out of `electron-builder.yml`; `BLOCKED_VERSIONS_URL` to a local read; make the OpenPanel send a no-op (one line each in `src/main/analytics.ts`, `src/renderer/src/analytics.ts`, mobile). This alone ends every automatic upstream call from the desktop. Remove `analytics.openbot.run` from the CSP and its test.
2. **i18n first.** Biggest cut, no feature coupling. Cut `APP_LANGUAGES` to `["system","en"]`, delete 12 locale folders and the loaders (see section 7). Later steps then touch only the English catalog.
3. **Hosted sites** (leaf of the shop, and a leaf of the server plan). Keep old-row readers.
4. **License UI and seats**: `LicenseSection`, `license-*`, then the license step in `ServerMembersSection.tsx`. Leave the invite flow.
5. **Hosted servers and billing UI**: renderer, ui, web client, mobile screens; trim `AddServerOverlay`/`AddServerDialog` and the mobile `hosted-server/` folder to join/scan/local.
6. **IPC and contracts**: remove endpoints from `ipc-endpoints.ts`, `ipc-desktop-apis.ts`, `src/preload/*`, `app-handlers`, `mock-openbot.ts`, then `main/*-service.ts` and handlers. Run `bun run build && bun run verify:preload` after each group.
7. **Main services and team-client wake code**: `remote-server-manager.ts` `HostedServerWakeHooks`, `central-auth-manager.ts` claim redeem.
8. **Telemetry**: call sites first, then `src/main/analytics*.ts`, mobile analytics, then `packages/telemetry` last, then the OpenPanel dependencies and `ANALYTICS.md`.
9. **Account Worker shop code and migrations rule**: delete handlers and services, keep migration files. Then marketing pages, `content-art`, regenerate `routeTree.gen.ts`.
10. **Workflows, `apps/status`, CLA, release scripts, docs, README, PRIVACY.**
11. **Rename and signing** last, after the code is smaller (one commit, easy to review).

How to use knip after each step (`knip.config.ts`, `docs/development-checks.md:200-209`):

- Run `bun run knip:check` (about 6 s). It reports unused files, exports, types, dependencies and unresolved imports per workspace. After deleting a feature, the files that only it used show as unused files; delete them, run again until it is clean.
- `bunx knip --fix --fix-type exports,types` removes unused `export` keywords (the docs warn to check the diff).
- Frozen codecs are exempt: `knip.config.ts` ignores `packages/contracts/src/team-protocol/v*.ts`, `*-v*.ts` and `provider-aware-codec.ts`. Callers of those can go; the files stay.
- Blind spots: dynamic and string loads. `scripts/**/*.ts` are all entries, so a script that imports a deleted file shows as an unresolved import (good). `package.json` script entries pointing at deleted files are **not** caught by knip: grep `package.json` after each delete (`api:*`, `hosting:*`, `sites:*`, `status:*`, `analytics:backfill`, `test:billing-snapshot`, `test:paid-account-identity`, `test:hosted-*`).
- `bun run i18n:check` finds English keys that no code names; run it after each UI deletion.
- `bun run check` is broad (`package.json:368-371`) and does **not** contain knip. CI runs knip as `knip:check` (`development-checks.md:105`). Per `AGENTS.md`, do not run `bun run check` locally.

### 7. i18n

Locales (13): `en` (source), `de`, `es`, `fr`, `it`, `ja`, `ko`, `nl`, `pl`, `pt` (Brazilian), `ru`, `tr`, `zh` (Simplified). `docs/i18n.md` lists them. Each has 106 files under `packages/i18n/src/messages/<locale>/`.

| Part | Files | Lines |
| --- | --- | --- |
| `en` | 106 | 14,258 |
| 12 other locales | 1,272 | 163,689 (de 13,802; es 13,603; fr 13,684; it 13,477; ja 13,322; ko 13,295; nl 13,621; pl 14,321; pt 13,389; ru 14,385; tr 13,520; zh 13,270) |
| Code in `packages/i18n/src/*.ts` | 16 | 1,098 |
| Total | 1,396 | 179,075 |

An English-only fork removes 1,272 files and 163,689 lines (91.4% of the package), and shrinks the desktop renderer bundle, because `app-catalogs.ts` imports all 13 catalogs (`:3-15`) and `mobile-catalogs.ts` does too.

Code that assumes several locales (all must change together):

| File | Assumption |
| --- | --- |
| `packages/contracts/src/app-language.ts:10-25` | `APP_LANGUAGES` lists 14 tags. Doc comment: "Add a language, never rename a tag." Cut to `["system","en"]` |
| `packages/i18n/src/locale.ts:4-18` | `TRANSLATED_LOCALES`; `resolveLocale`, `formatLocale` match the system language subtag (`:32-37`). Keep the functions, shrink the list |
| `packages/i18n/src/languages.ts` | Language selector rows; `LABELS` is `Record<AppLanguage,...>` so it must shrink with the type |
| `packages/i18n/src/{app-catalogs,source-catalogs,format-catalogs}.ts`, `mobile-catalogs.ts` | static imports of every locale |
| `packages/i18n/src/lazy-catalogs.ts`, `mobile-catalogs.native.ts`, `apps/auth-api/vite.config.ts:112-122` | lazy loaders per locale, and the Vite alias that swaps them in. With English only, delete `lazy-catalogs.ts` and the alias, and `knip.config.ts` entry `src/lazy-catalogs.ts` (`knip.config.ts`, workspace `packages/i18n`) |
| `packages/i18n/src/source-matcher.ts`, `source-text.ts` | Reverse-maps English text to keys for other locales. Becomes a no-op; do not delete `sourceText(key)` (all errors use it; `AGENTS.md`, "Interface text") |
| `packages/i18n/src/plural.ts`, `format.ts`, `message.ts` | Plural rules per language; English only needs `one/other` |
| Language UI: `packages/ui/src/features/account/LanguageWheel.tsx`, `src/renderer/src/features/onboarding/{LanguageStep,language-step}.ts(x)`, mobile `settings/language.tsx` + `language-settings-screen.tsx` + `app-language.ts` | A language picker and a first-run language step. Remove the step and the setting. Dictation language is separate (`speech-language.ts`): keep |
| `src/main/{language-preference-store,language-service}.ts`, `src/preload/app-decoding.ts:208`, `src/main/ipc/app-inputs.ts:154` | A saved `de` or other tag reads back as the system default: `language-preference-store.ts:23` returns the default for an unknown tag. **Safe for old data.** The IPC input check at `app-inputs.ts:154` rejects unknown tags: fine once the picker is gone |
| `apps/auth-api/src/lib/request-locale.ts:1,34`, `src/router.tsx`, `routes/app-preview.lazy.tsx:1-12`, `content/compare/comparison.ts` | Worker picks a locale from `Accept-Language`. Goes with the site |
| `scripts/{i18n-check,i18n-e2e,i18n-fit-e2e}.ts` (843 lines), CI step `ci.yml:143` and `:826-827` | `i18n-check` loops over `TRANSLATED_LOCALES`; keep it for the English-only unused-key check. `i18n-e2e` and `i18n-fit-e2e` test other languages: remove |
| `.storybook/preview.tsx`, `docs/i18n.md`, `docs/development-checks.md`, `CONTRIBUTING.md` (Translations section) | Mention locales |

---

## Deletion order (short form)

0. Stop traffic: `publish`, blocklist URL, OpenPanel no-op, CSP host.
1. i18n to English only.
2. Hosted sites.
3. License and seats (including the `ServerMembersSection` license step).
4. Hosted servers and billing UI, then IPC and contracts, then main services.
5. Telemetry call sites, then `packages/telemetry`.
6. Account Worker shop code and marketing site (keep D1 migration files).
7. Workflows, status, CLA, release scripts, docs, README, `PRIVACY.md`.
8. Rename and signing.

## Risks

1. **`openbot.db` migrations must keep working (non-negotiable, `AGENTS.md`).** My search of `src/backend` for tables named hosted, billing, license, analytics, stripe or boat found none, so the commercial features add no tables to `openbot.db`. The only persisted trace in the user's database is hosted-site rows inside conversation messages (`item_type` prefix). Do not delete `HOSTED_SITE_EVENT_ITEM_TYPE_PREFIX` or its filters (`conversation-read-store.ts:302,410`, `database/conversation-queries.ts:397,738`). `src/backend/openbot-database-schema-history.json` and the schema parity test run on any change to a schema file. Leftover JSON files (analytics preference, install id, `openbot-error-reports-v1.json`, update preference `openbot-update-preference-v1.json`) can stay unread. I did not check whether any agent, routine or workflow definition stored in the database refers to hosted-site tools: **UNCONFIRMED**.
2. **Trust boundary (non-negotiable).** Keep `src/main/trusted-ipc.ts` and `.test.ts`, `src/main/trusted-renderer.ts`, `content-security-policy.test.ts`, the preload decoding tests (`src/preload/*-decoding.test.ts`), and `scripts/verify-preload-bundle.ts`. Removing IPC groups will force edits to `app-decoding.test.ts`, `team-decoding.test.ts` and the `HAND_WRITTEN_METHODS` list in `verify-preload-bundle.ts`; edit them to match, do not weaken them. Narrow the CSP only by removing hosts; do not add `unsafe-*`. Run `bun run build && bun run verify:preload`.
3. **Released Team API adapters are permanent.** `team-protocol/{hosted-sites-v1,analytics-v1,host-analytics-v1,agent-plan-card-v1,conversation-plan-v4}.ts` must stay. Remove callers only.
4. **`ServerMembersSection` license step.** Removing the license also removes the gate the account service applies to joins. If you keep the account Worker for a while, it still refuses joins above a license. Decide the order with the account-removal area.
5. **Shared flows inside "hosted" names.** `AddServerOverlay`, `AddServerDialog`, mobile `hosted-server/{join,scan,local}`. A blanket delete removes join and local server.
6. **Telemetry package is also a type package.** 44 files import it for `classifyFailure` and types. Deleting the package first breaks typecheck in `packages/ui` and desktop.
7. **Generated files.** `apps/auth-api/src/routeTree.gen.ts`, `plugin-catalog.generated.ts`, mobile `plugin-catalog.generated.ts`. Regenerate; do not edit.
8. **Build-time dependency on upstream.** `native-runtime.lock.json:387-393` remote desktop runtime artifact comes from `nightly-labs/openbot`. If upstream deletes that release, `bun run package` fails.
9. **CI.** Many workflows are tied to upstream secrets and repo name. I did not read `ci.yml` and `release.yml` fully: **UNCONFIRMED** that they skip on a fork. Plan to prune them.
10. **License.** Keep `LICENSE`, `NOTICE` and PolyForm Noncommercial 1.0.0. Required notice lines name Synthetify Labs and `licenses@openbot.run`; they must stay even though the purchase UI goes. Check any new dependency stays compatible.
11. **Signing and TCC.** See section 5. A restricted entitlement without a profile can stop launch. Ad-hoc rebuilds can reset Computer Use grants.

## Commands (exact, from `package.json` and docs)

From the worktree root, one at a time (`AGENTS.md`: one test worker, no broad checks):

```
bun install --frozen-lockfile
bun run knip:check
bunx knip --fix --fix-type exports,types
bun run i18n:check
bun run i18n:check --fix
bun run typecheck:node
bun run typecheck:renderer
bun run typecheck:contracts
bun run typecheck:api
bun run typecheck:mobile
bun run typecheck:i18n
bun run typecheck:team-client
bun run typecheck:status
bun run typecheck:sites
bun run test:changed
bun run test:related -- <source file>
bun run test:desktop -- <test file>
bun run test:api
bun run build && bun run verify:preload
bun run check:ui
bun run check:doc-links
bun run check:agent-context
biome check --write --max-diagnostics=none <changed paths>
bun scripts/staged-typecheck.ts --dry-run
bun run package
bun run package:verify
bun run dist:mac
```

Broad commands that `AGENTS.md` leaves to CI: `bun run check`, `bun run check:desktop`, `bun run check:desktop:static`, `bun run check:api`, `bun run typecheck`, `bun run lint`, `bun run format`, `bun run test`.

`package.json` scripts to delete with their files: `api:*`, `hosting:template`, `hosting:setup`, `status:build`, `status:smoke`, `sites:*`, `api:stripe:bootstrap`, `remote:*` (account/Signal area), `env:*`, `analytics:backfill` (`:147`), `test:billing-snapshot`, `test:paid-account-identity`, `test:hosted-start-wait`, `test:hosted-held-resume`, `test:hosted-retention-wake` (`:336-338,346-347`), `typecheck:status`, `typecheck:sites`, `release:*`, and the matching names inside `check:api` (`:371`).

## Open questions

1. Does the user carry data from an installed upstream OpenBot? That decides whether the one-time copy script for the old data folder is in scope. Recommendation: yes, copy, with the upstream app closed.
2. Product name, bundle id and URL scheme for the fork (for example `app.<handle>.openbot`). I used placeholders only.
3. Keep the phone app? It pins `run.openbot.mobile`, scheme `openbot`, and `applinks:openbot.run`, and mobile pairing needs the account Worker and Signal. This decides whether `apps/mobile` is trimmed or deleted.
4. Keep the web client at `/app` and the join page `/join`? They are served by `auth-api` and are not commercial. They decide whether the Worker survives at all.
5. Keep the plugin catalog (`content/plugins`, `plugin-catalog.generated.ts`)? It sits in the marketing tree but feeds the desktop and mobile catalog.
6. Keep `host-update-coordinator.ts` and `requested-update.ts` (admin-requested restart on a joined server, released `host-update-v1`) for Mac mini failover version sync, or replace with a plain script?
7. Rebuild the remote desktop runtime in the fork, or keep downloading upstream's pinned artifact?
8. Linux and Windows: drop them (removes `scripts/hosting`, `electron-builder.windows-signing.yml`, AppImage, nix, docker)? I assumed yes for a MacBook plus Mac mini fork.
9. Does a hosted-site approval row (`openbot/hosted-site-mutation`, `attention-registry.ts:988`) persist across restarts in `openbot.db`? I did not check.
