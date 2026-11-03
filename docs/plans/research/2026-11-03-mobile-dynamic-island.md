# Mobile app and Dynamic Island research

Repo: `/Users/hridyaagrawal/honey/openbot`, commit `de784cee2`. Read-only research. No code was changed.
Convention: "(unconfirmed)" marks a claim I could not verify. I say where I looked.

## Summary

1. The mobile app is Expo SDK 58 / React Native 0.88 with no committed `ios/` folder. `bun mobile:ios` runs prebuild and `expo run:ios`. `node_modules` is not installed in this checkout, so nothing was built or typechecked.
2. The phone cannot reach a host without the OpenBot account Worker. Pairing, email sign-in, the host directory, session tickets and the Signal URL all come from the Worker. There is no LAN or direct mode. This blocks the "remove the account" goal and needs its own decision.
3. Live Activity and Dynamic Island exist in three places: an iOS Live Activity (`expo-widgets` target), a macOS notch overlay window in the desktop app, and a host-side sender that pushes Live Activity updates through the Worker to Apple. A coordinator class in `@openbot/team-client` is shared with normal desktop turn state, so removal is not a plain delete (see inventory).
4. Normal notifications share the Live Activity secret, seal code, registration hook and one `liveActivityShows` hook. They also need the Worker relay today. Without that relay, backgrounded phones get no push. Recommendation: ship foreground-only first. Add a direct APNs sender on the host later, only with a paid Apple account.
5. A free Apple account cannot give this app its extensions (App Groups), push or associated domains (from memory, unconfirmed per capability). The existing Apple identities on this Mac belong to Mukesh Agrawal's team, not obviously to the user. Bundle id `run.openbot.mobile` and group `group.run.openbot.mobile` are nightly-labs names and must change.

## Mobile architecture

### Versions and structure (evidence: `apps/mobile/package.json`, `apps/mobile/README.md:1-12`)

- Expo `~58.0.17`, React Native `0.88.0`, React `19.3.0`, Expo Router `~58.0.25`, TypeScript 7 via `tsrs` (`scripts/type-checker.ts:1-30`), Biome, Bun `1.4.2` (`package.json:77` root, `packageManager`). Node `>=24` (`.nvmrc` = 24).
- CNG: `ios/` and `android/` are generated and ignored. `apps/mobile/ios` does not exist now.
- Skia `2.14.0`, `heroui-native`, `uniwind`, `@legendapp/list`, `expo-updates ~58.0.18`, `expo-dev-client`, `@openpanel/react-native` (analytics).
- Source layout: `src/app` (routes), `src/features/{auth,agents,chat,live-activity,push-notifications,servers,settings,share,workspace,...}`, `src/shared`. See README "Source structure" (`README.md:264-291`).
- Local native modules (`apps/mobile/modules/*`, each with `ios/` podspec and Swift): `app-lock`, `composer-paste`, `quick-actions`, `share-extension`, `share-files`, `speech` (sherpa-onnx download at pod install, `fingerprint.config.js`), plus Android-only `android-notifications`.
- Config plugins (`apps/mobile/plugins/`): `with-rocketsim` (debug sim only), `with-workspace-bundle-inputs`, `with-notification-sounds`, `with-share-target`, `with-notification-service`.
- A hidden Expo DOM component (`src/features/workspace/components/remote-team-bridge.dom.tsx`) owns the browser `RTCPeerConnection`. No native WebRTC module (`README.md:~108-113`).

### iOS targets, bundle ids, groups, entitlements (evidence: `apps/mobile/app.json`)

| Target | Bundle id | Where | Needs |
| --- | --- | --- | --- |
| App | `run.openbot.mobile` | `app.json:12` | associated domain `applinks:openbot.run` (`app.json:14`), push (`aps-environment` from `expo-notifications`, `app.json:88`; unconfirmed, plugin source not installed), Communication Notifications entitlement (`plugins/with-notification-service.js:~104-105`), App Group, shared keychain group `$(AppIdentifierPrefix)run.openbot.mobile.share` (`plugins/with-share-target.js:35-37`) |
| Widgets / Live Activity extension | `run.openbot.mobile.ExpoWidgetsTarget` | `app.json:209-214`, plugin `expo-widgets` with `enablePushNotifications: true`, `frequentUpdates: true` | App Group `group.run.openbot.mobile`, push for activity tokens |
| Notification Service Extension | `run.openbot.mobile.NotificationService` (`OpenBotNotificationService`) | `app.json:218-223`, `plugins/notification-service/NotificationService.swift` | App Group |
| Share extension | `run.openbot.mobile.ShareExtension` (`expo-sharing-extension`) | `app.json:126-129`, `plugins/share-extension/*.swift`, `plugins/with-share-target.js` | App Group `group.run.openbot.mobile`, shared keychain group |

- The only widget target is the Live Activity. I found no Home Screen widget definition. `src/features/live-activity/agent-live-activity-widgets.ios.tsx` builds one `LiveActivity` through `ExpoWidgetsModule.LiveActivityFactory` (line ~490).
- Team and topic of the upstream project: `APNS_TEAM_ID 8A47NKRZSJ`, `APNS_TOPIC run.openbot.mobile` (`apps/auth-api/wrangler.jsonc:79-80`).
- Other tied-to-upstream config: `owner: "openbot"` (`app.json:236`), EAS `projectId eeec730f-...` (`:233`), `updates.url https://u.expo.dev/eeec730f-...` (`:241`), `runtimeVersion` policy `fingerprint` (`:237`). A personal build must drop `updates` and `owner` or create its own EAS project. `expo-updates` with no valid URL does not need to run in a local build (unconfirmed; check at build time).
- `NSLocalNetworkUsageDescription` and `NSAllowsLocalNetworking` already exist (`app.json:16-19`).

### EAS (evidence: `apps/mobile/eas.json`)

Three profiles: `development` (dev client, internal), `preview`, `production` (`autoIncrement`, remote version source). All pin `bun 1.4.2`. A local EAS build still needs an Expo login and a project the user owns (`README.md:336-372`). A TestFlight route needs a paid account plus an App Store Connect API key (`README.md:375-450`, GitHub workflow `release-ios.yml`). Not needed for a personal device install.

### How it builds locally

- `bun mobile:ios` -> `apps/mobile` `bun ../../scripts/mobile-ios.ts` (`scripts/mobile-ios.ts`). It runs `expo prebuild --platform ios --no-clean`, reinstalls pods if stale, then `expo run:ios` with DerivedData in `apps/mobile/ios/DerivedData`. It refuses to run if `node_modules/expo` is missing (`scripts/mobile-ios.ts:9-11`).
- Expo arguments pass through: `bun mobile:ios -- --device "<name>"` selects a device (`README.md:~85-95`). For a physical iPhone use `--device` and a Release configuration if the user wants no Metro: `--configuration Release` (Expo CLI flag; unconfirmed here).
- Alternative: `bunx expo prebuild --platform ios` then open `apps/mobile/ios/OpenBot.xcworkspace` in Xcode, set team and signing, run on the device (workspace name unconfirmed until prebuild runs).

## Personal build requirements

Local environment seen on this MacBook (evidence: shell probes):

- Xcode 27.0 (27A266a). README wants 27.1+ only for iPhone Duo layout; Expo SDK 58 needs 26.4+ (`README.md:378-384`). Fine for a personal iPhone.
- Node v26.7.0 (repo pins 24; `engines >=24`). Bun **1.3.14**, repo pins **1.4.2** (`package.json:77`). `bun install --frozen-lockfile` may differ; install Bun 1.4.2 first. Fingerprint matters only for OTA.
- CocoaPods present (`pod --version` printed only a gem warning; version unconfirmed).
- `security find-identity` shows: `Apple Development: Mukesh Agrawal (HSLSDPZZDT)`, `Apple Distribution: Mukesh Agrawal (DV6NC6KRYL)`, `Developer ID Application: Mukesh Agrawal (DV6NC6KRYL)`. Distribution and Developer ID certs imply a paid team `DV6NC6KRYL`. Whose account this is, and whether the user may use it, is an open question.
- `xctrace` lists "Mamata's iPhone", "Mukesh's iPhone", an iPad and this MacBook. The user's own iPhone is not obviously among them.

What a personal build needs:

1. Own bundle id (for example `com.<you>.openbot`) in `app.json` `ios.bundleIdentifier`, plus matching extension ids, App Group id and share keychain group. Change in `app.json` (lines 12, 126-129, 211-212, 221-222) and the hard-coded copies: `src/features/push-notifications/push-notifications-native.ios.ts:6` (`APP_GROUP`), `scripts/dev-mobile.ts` (`MOBILE_BUNDLE_ID = "run.openbot.mobile"`), the Android `package` (`app.json`), and `apps/auth-api` APNs vars (only if the Worker stays).
2. Apple team: select in Xcode or set `ios.appleTeamId` in `app.json` (Expo config field; unconfirmed in this repo).
3. Remove `associatedDomains` (`app.json:14`). `openbot.run` hosts the apple-app-site-association for the upstream team only, so it cannot work for another team.
4. Remove or drop `owner`, `extra.eas.projectId`, `updates.url`, and `runtimeVersion` if no EAS project is used.
5. Free vs paid account (from Apple's membership page via WebFetch, plus memory):
   - Confirmed from Apple's page: free "Personal Team" gives on-device Xcode testing only, up to 10 App IDs and 3 devices, 3 apps per device, and every profile expires after 7 days (rebuild and reinstall weekly). Certificates/Identifiers/Profiles, TestFlight and App Store Connect need the paid program.
   - From memory, unconfirmed per capability: a Personal Team cannot enable Push Notifications, App Groups, Associated Domains or Communication Notifications. Each extension also uses its own App ID. This app has four App IDs (app, widgets, notification service, share), which fits the 10 ID limit only without other apps.
   - Consequence on a free account: drop the `expo-widgets`, `with-notification-service`, `with-share-target` plugins, `associatedDomains`, `aps-environment` and the communication entitlement. Keep App Groups only on a paid account. The Dynamic Island removal already removes the `expo-widgets` target.
   - Paid account ($99/yr): everything works with own ids, including push, if the user wants direct APNs (see below). A paid account also gives 1-year profiles for Development and Ad Hoc.
6. Notification sounds, speech models and Skia need no account.

## How the phone connects to a host today

Evidence for each step is in the file cited.

1. **Mobile Connect QR / link.** The desktop calls `POST /v1/mobile-auth/ticket` on the account Worker (`src/main/central-auth-manager.ts:356-376`) and builds `openbot://mobile-connect?api=<origin>&ticket=...&host=<id>&fingerprint=<key>` (`packages/contracts/src/mobile-connect.ts`, `createMobileConnectUrl`). The phone scans it (`apps/mobile/src/app/scan-qr-code.tsx`), calls `POST /v1/mobile-auth/redeem` at the `api` origin (`apps/mobile/src/features/auth/api/mobile-auth.ts:73-107`), validates the host fingerprint and stores the session in SecureStore. A permanent link variant exists (`createMobileConnectLink`, `central-auth-manager.ts:415-446`). The API origin can be `http://` only for loopback or private LAN hosts (`isMobileConnectDevelopmentHost`).
2. **Email sign-in.** `POST /v1/auth/email/start` and verify, on `OPENBOT_CONTROL_PLANE_ORIGIN` = `https://api.openbot.run` (`mobile-auth.ts:120-124`, `packages/contracts/src/invite-links.ts:5`). A debug build can override with `EXPO_PUBLIC_OPENBOT_API_URL` (`__DEV__` only).
3. **Host directory, sessions, tickets.** The phone's `RemoteTeamDirectoryClient` (`packages/team-client/src/remote-directory.ts`) calls `/v2/remote/hosts/`, `/v2/remote/sessions/` and issues tickets. Responses carry a `signalUrl` that must be `wss:` (or `ws:` to a dev host) (`packages/contracts/src/remote-control-plane.ts`).
4. **Signal and WebRTC.** The DOM bridge (`remote-team-bridge.dom.tsx`, `packages/team-client/src/remote-peer.ts`) opens a WebRTC peer through Signal using that ticket. Data channels carry the Team API. STUN/TURN come from the Worker/Signal (`remote/` folder: coturn, nginx, api).
5. **Encrypted workspace cache.** `apps/mobile/src/features/workspace/model/workspace-cache.ts` keeps an encrypted copy per server and deletes it on sign-out, session expiry and server removal (`AGENTS.md` product constraints, README paragraph "The phone keeps an encrypted copy"). It is local to the phone. It does not call the Worker. It also caches the last server list so servers connect before the Worker answers.

Dependence on the OpenBot Worker: steps 1 to 4 are all Worker-dependent. The host side registers with the Worker (`/v2/remote/hosts/register`, machine token). Self-hosting the Worker is documented (`docs/self-hosting.md`) and needs Cloudflare Workers + D1 + R2, a Linux box with Docker, SMTP and TURN. A Worker-less LAN mode does not exist. That is a large design item for the planner (outside this area; flagged in Open questions). The pairing code in `scripts/dev-mobile.ts` pairs the simulator with a local Worker via CDP, never printing the ticket.

## Dynamic Island inventory

Naming note: the desktop feature is also called "MacBook notch" (`macBookNotch*` settings, `settings.notch.*` strings, `surface=dynamic-island`).
Scope: remove the desktop island, the iOS Live Activity (the island on the phone), and the host sender. Keep normal notifications.

### A. iOS Live Activity (phone)

| Path | What | Action | Shared with / notes |
| --- | --- | --- | --- |
| `apps/mobile/src/features/live-activity/agent-live-activity.ios.tsx`, `agent-live-activity.tsx`, `agent-live-activity.types.ts`, `agent-live-activity-widgets.ios.tsx` (549 lines) | Loader and the SwiftUI layout string run by the widget | Remove | Uses `plush-picture` from agents (keep that) |
| `.../live-activity/use-live-activity.ts` (757 lines) | Starts, updates, ends the activity; registers the push token; owns the secret | Remove | Imports `liveActivityHostKeys`, `loadLiveActivitySecret`, `resetLiveActivitySecret` (move to a neutral module, see below), `useLiveActivitiesPreference`, `usePushEnvironment` |
| `.../live-activity/model/live-activity-sync.ts`, `-link.ts`, `-open.ts` | Activity sync, deep link, open action | Remove | `live-activity-link.ts` is imported by `src/app/+native-intent.tsx:3` and `src/app/(app)/_layout.tsx:18` (`isLiveActivityLink`, `setLiveActivityNavigator`); edit both |
| `.../live-activity/model/live-activity-host.ts` | Zustand store: server that owns the activity and its start time | Remove | Read by `use-push-notifications.ts` for `liveActivityStartedAt` (send `null`) |
| `.../live-activity/model/live-activity-keys.ts` (75 lines) | Phone secret in keychain and per-host key derivation | **Keep, move** | Used by `use-push-notifications.ts:15,19` to seal normal notifications. Rename (for example `features/push-notifications/push-secret.ts`) |
| `apps/mobile/src/features/settings/model/live-activities.ts` | "Show agent activity" preference | Remove | Read by `use-push-notifications.ts`, `notifications-settings-screen.tsx` |
| `apps/mobile/src/features/settings/screens/notifications-settings-screen.tsx:11,33,58-60,109-130` | Live Activities toggle row and the "sound available while Live Activity on" logic (`soundAvailable`, line 39) | Edit | Keep the notification sections |
| `apps/mobile/src/features/push-notifications/use-push-notifications.ts:15-17,57-58,152-156,176-183` | `activitySound`, `liveActivityStartedAt`, `useLiveActivityHost`, `useLiveActivitiesPreference` | Edit | Normal notifications live here; keep the hook, drop Live Activity inputs |
| `apps/mobile/src/features/workspace/context/mobile-workspace-context.tsx:42,117,654-676` | Wires `useLiveActivity` and `LIVE_ACTIVITY_PUSH_CAPABILITY` | Edit | Only remove the Live Activity wiring (`applyLiveActivityEvent`, `supportsLiveActivityPush`). The `postLiveActivityAction` callback is reused by `usePushNotifications` (rename it) |
| `apps/mobile/app.json:209-216` | `expo-widgets` plugin (creates `ExpoWidgetsTarget`) | Remove | Drops the extension target and its App ID |
| `apps/mobile/package.json:81` | `expo-widgets ~58.0.22` dependency | Remove | Also check `@expo/ui` (still used by other screens), `bun.lock` |
| `apps/mobile/src/features/analytics/events.ts:75,79`, `analytics-core.ts:44` | `live_activity_action` event, `live_activities_toggled` action | Remove | Edit `ANALYTICS.md:40,171` too |
| `packages/i18n/src/messages/*/mobile/liveActivity.ts` (13 locales), `mobile.ts` import (`en/mobile.ts:10,38`) | Strings (`mobile.liveActivity.*`) | Remove | `packages/team-client/src/live-activity-text.ts` reads them; `liveActivityIslandText` also used by the desktop; remove together |
| `packages/i18n/src/messages/*/mobile/settings.ts` (`mobile.settings.liveActivities.*`, lines 86-90 en; sound footer line 116 en) | Settings strings | Remove the Live Activity keys; reword sound footer | 13 locales; `bun run i18n:check` enforces parity |
| `packages/i18n/src/messages/*/error/team.ts` (`error.team.liveActivityUnsupported`, `en:89`) | Host error when no sender | Remove with the host route | |
| `apps/mobile/CHANGELOG.md`, `changelog.d/t3-84cd6121.md` | Release notes | Leave (history) | |

### B. Desktop Dynamic Island (macOS notch overlay)

| Path | What | Action | Shared with / notes |
| --- | --- | --- | --- |
| `src/main/dynamic-island-window.ts` (469) | Always-on-top overlay window controller, notch geometry, display reconcile | Remove | `main-window.ts:51` imports `dynamicIslandNotchSizeForDisplay` |
| `src/main/dynamic-island-actions.ts` (87) | Critical actions: answer prompt, approve, send, stop | Remove | |
| `src/main/dynamic-island-preference-store.ts` (72) | Reads/writes `openbot-dynamic-island-preference-v1.json` (`version 3`) | Remove | File name defined at `src/main/application-services.ts:387`. The user's file exists with `"enabled": false` (read this session). Leave the file on disk; it is harmless |
| `src/main/ipc/dynamic-island-handlers.ts`, `src/main/ipc/app-inputs.ts:13-15,63-66,232-253`, `src/main/ipc/AGENTS.md` | IPC handlers and input guards | Remove / edit | |
| `src/main/application-services.ts:199-200,245-249,387,446,657,965-990,3565` | Construction, `TEARDOWN_ORDER.dynamicIsland`, `createDynamicIslandWindow`, `loadDynamicIslandRenderer` | Edit | |
| `src/main/index.ts:74,662,717,1270,1412,1452,1489-1508,1733` | IPC registration, initialize, display and power listeners, destroy | Edit | |
| `src/main/main-window.ts:51,269,588-620,815,869-880` | `createDynamicIslandWindow`, `loadDynamicIslandRenderer` (`?surface=dynamic-island`), overlay exclusions, comment at line 269 about a hidden renderer that owns the island coordinator | Edit | The "hidden renderer must outlive the visible window" behavior at `:269` is tied to the island; re-check whether it is still needed |
| `src/main/mac-panel-activation.ts` (+ `koffi` dependency `package.json:429`, `electron-builder.yml:40-42` `asarUnpack @koromix/koffi-*`, `scripts/verify-macos-package.ts:~64`) | Private `_setPreventsActivation:` so the island panel never activates the app | Remove if no other caller | grep shows callers only in `main-window.ts` (island). Confirm other panels (rim overlay, computer-use highlight) before dropping `koffi` |
| `src/main/mac-haptic-feedback.ts` + `application-services.ts:235,532` | Force Touch haptic for island clicks | Remove if unused | Only the island caller found (grep) |
| `src/main/computer-use-target-window.ts:~114` | Comment excludes island overlays from window picking | Leave comment-free edit if code is generic | Window code is generic; check test |
| `src/preload/index.ts:243-247,773-785`, `src/preload/dynamic-island-decoding.ts` | Preload bridge and decoders | Remove | `verify:preload` script checks channel coverage |
| `packages/contracts/src/ipc-dynamic-island.ts`, `ipc.ts:50`, `ipc-endpoints.ts:286-292,905-920,1979`, `ipc-desktop-apis.ts:54` | Types, endpoints group `dynamicIsland` | Remove | Also `src/main/ipc-channel-coverage.test.ts` and `src/main/trusted-ipc.test.ts:137-147` |
| `src/renderer/src/features/dynamic-island/*` (5 files, 683 lines: `DynamicIslandSurface.tsx`, `dynamic-island-bridge.tsx`, `dynamic-island-context.tsx`, `dynamic-island-port.ts`) | Overlay renderer, bridge, provider | Remove, but see "coordinator" below | `dynamic-island-context.tsx` is a provider used by `turns.tsx` |
| `src/renderer/src/helper.tsx:7,13-35`, `app-providers.tsx:26-27,117,141,199-201` | `surface=dynamic-island` entry; provider and bridge mounts | Edit | |
| `src/renderer/src/turns.tsx:23,38-40,75-82` | `const { dynamicIslandCoordinator } = useDynamicIsland(); seed = coordinator.serverState(id)` seeds `activeTurns`, `turnProgress`, `queues`, `failedTurns`, pending prompts and approvals after a server switch | **Edit, keep behavior** | **Hidden coupling.** The coordinator is the cross-server memory of per-server turn state. Removing it needs a replacement store, or accept an empty seed after a switch (behavior change). Planner decision |
| `src/renderer/src/features/agents/agent-event-bridge.tsx:4,405` | Imports `reconcileQueuesWithRuntimeWork` from the coordinator module | Edit | Pure helper used in normal runtime reconcile. Move to a neutral module in `team-client` |
| `src/renderer/src/answered-prompts.tsx:22`, `features/servers/server-scope.tsx:53-56,451`, `features/servers/server-switch.tsx:23-62` (`pendingIslandAction`), `features/conversation/conversation-context.tsx:157` | Comments and a pending island-action signal in server switch | Edit | `pendingIslandAction` is island only |
| `src/renderer/src/features/settings/SettingsDynamicIslandTab.tsx` (305), `SettingsModal.tsx:7,51,55,70-71,174-201,332-340`, `settings-tabs.ts:22,135-137,213-225`, `settings-modal.css:3,72-73`, `settings-context.tsx:74,201,362-404,597-628`, `settings-port.ts:5,39-45`, `SettingsPage.tsx:12,88`, `global-search-sources.ts:19,113,153` | Settings tab, geometry signal, save logic, search entry | Remove / edit | |
| `packages/ui/src/features/settings/app-settings.ts:39-49,83` | `macBookNotch*` fields (8 settings) | Remove | In `generalSettings` defaults; check zero-filled settings test (`test:zero-filled-settings`) |
| `packages/ui/src/dynamic-island.tsx`, `dynamic-island-identity.tsx`, `features/dynamic-island/*` (`OpenBotDynamicIsland.tsx`, `*-motion.ts`, `idle-greeting-motion.ts`, 2 CSS), `packages/ui/package.json:12,26,198-199,415-416`, `src/index.ts`, `styles/primitives.css`, `features/browser/dock-motion.ts` | Shared UI | Remove | `dock-motion.ts` mentions the island; check it only imports shared motion helpers |
| `packages/brand/src/tokens.css`, `tokens-light.css`, `packages/contracts/src/app-logo-color.ts:2` | Island color tokens, logo-color doc | Edit (tokens), comment | |
| `src/renderer/src/preview/mock-openbot.ts:81,94-95,485-486,1219-1234` | Mock IPC | Edit | Required: AGENTS.md says IPC changes update the preview |
| `src/renderer/stories/DynamicIsland.stories.tsx`, `DynamicIslandDisplayComparison.tsx` | Storybook | Remove | |
| `packages/i18n/src/messages/*/island.ts` (13 locales), `settings.ts` keys `settings.notch.*`, `settings.tab.dynamicIsland.*`, `settings.logoColor.description` (`en/settings.ts:21,150-190`) | Strings | Remove / reword | `i18n:check` must stay green; remove the island namespace from the catalog index |
| `scripts/dev-automation/bench-scenarios.ts:10,525-540`, `cdp-client.ts:243,262`, `page-url.ts:35` | Bench scenarios `s12-island-on/off`, target filtering | Edit | CDP filter text refers to island popups; reconsider |
| `src/backend/agent/attention-registry.ts:850` | Comment only | Edit comment | |
| `docs/ARCHITECTURE.md`, `docs/architecture/{agents,channels-and-messaging,servers,structure}.md`, `docs/ui-foundation.md`, `packages/team-client/AGENTS.md`, `README.md`, `plans/009-https-session-end-closes-browser-view.md`, `.agents/skills/release-upgrade-safety/references/*` | Docs | Edit | `.storybook/preview.css` also mentions it |

### C. Shared presentation and host-side Live Activity sender

| Path | What | Action | Shared with / notes |
| --- | --- | --- | --- |
| `packages/team-client/src/dynamic-island-coordinator.ts` (606) | Per-server runtime: turns, queues, prompts, approvals, failures, plus presentation | **Split.** Keep the state part, drop the presentation part | Used by `turns.tsx`, `agent-event-bridge.tsx` (helper), `src/main/live-activity-push.ts`, `use-live-activity.ts`. Unit coverage only through `scripts/live-activity-*-e2e.ts` |
| `packages/team-client/src/dynamic-island-presentation.ts` (357) | Builds island presentations and the attention count | Remove | Used by the coordinator and `live-activity-props.ts` |
| `packages/team-client/src/live-activity-props.ts` (584), `live-activity-text.ts` (460) | Builds Live Activity props and text | Remove | `live-activity-props` imports `message-summary` |
| `packages/team-client/src/message-summary.ts` (200) | Summary text for notifications | **Keep** | Imported by `agent-notifications.ts` (desktop, web and phone notifications) |
| `packages/team-client/src/live-activity-seal.ts` (118) | HMAC keystream sealing, base64url, nonce | **Keep, rename** | Imported by `push-notification-seal.ts`, `src/main/push-notifications.ts`, `use-push-notifications.ts` |
| `packages/team-client/package.json:32-35` | Exports | Edit | |
| `src/main/live-activity-push.ts` (426) | Host service: holds phone push tokens, seals Live Activity updates, sends via Worker | Remove | Types referenced by `host-service.ts:60,202,274,363-384,493,531-544,1646-1659,1861`, `team-api-server.ts:271,1095,1723,2228`, `push-notifications.ts:7,~65` |
| `src/main/team-api/route-live-activity-push.ts` (67) | `POST` register/remove route (capability `live-activity-push-v1`) | Remove | Registered at `team-api-server.ts:1095` |
| `src/main/central-auth-manager.ts:922-960` `sendLiveActivityPush` | Calls `POST /v2/remote/hosts/:id/live-activity` | Remove | `sendPushNotification` (next to it, `:969-995`) stays for now |
| `src/main/application-services.ts:2662` | Wires `sendLiveActivityPush` | Edit | `2663` wires `sendPushNotification`; keep or replace (see push options) |
| `packages/contracts/src/live-activity-relay.ts`, `src/team-protocol/live-activity-push-v1.ts`, `current.ts:69,218,335`, `optional-routes.ts:54,133`, `fixtures/v9/client-capabilities.json`, `host-compatibility.json`, `package.json:7,158` | Wire contracts and fixtures | Remove **with care** | AGENTS.md: "Released Team API adapters are permanent." Safer: keep the capability constant and codec so older phones decode, but stop advertising it on the host (the host already omits it when `liveActivityPush` is undefined, `team-api-server.ts:2228`). A fork with one user can delete, but fixture tests will fail until fixtures are regenerated. Planner decision |
| `apps/auth-api/src/routes/v2/remote/hosts/$hostId/live-activity.ts`, `src/server/live-activity-relay.ts`, `routeTree.gen.ts`, `request-auth.ts`, `README.md`, `.env.example:33-36`, `wrangler.jsonc:79-80,273-274`, `vite.config.ts`, `dev-apns-proxy.ts` | Worker relay and APNs sender | Out of my area (Worker removal). Note: the `notification.ts` route and the same `live-activity-relay.ts` file also relay normal notifications | |
| `scripts/dev-apns-key.ts`, `package.json:113` `dev:apns-key`, `scripts/deploy-auth-api.ts` | Dev APNs key helper | Remove with the Worker | |
| `scripts/live-activity-{autolink,code-span,ice-away,inline-fence,server-mute}-e2e.ts` | Live Activity e2e scripts | Remove | **Not wired in `package.json` or `ci.yml`** (grep found no reference). `computer-activity-e2e.ts`, `notification-summary-e2e.ts`, `push-notification-away-e2e.ts`, `desktop-notifications-e2e.ts` mention Live Activity and ARE wired (`ci.yml:347-359`); edit them, do not delete |
| `PRIVACY.md:187,612,1491-1590` ("iPhone Live Activity" section), `ANALYTICS.md:40,171`, `CHANGELOG.md` | Docs | Edit PRIVACY and ANALYTICS; leave CHANGELOG history | |
| `docs/architecture/servers.md`, `channels-and-messaging.md` | Notes on Live Activity | Edit | |

### Analytics events

- Mobile: `live_activity_action` (`started`, `ended`), and `notification_settings_action` value `live_activities_toggled` (`apps/mobile/src/features/analytics/events.ts:75,79`).
- Desktop: I found no island analytics events (grep in `src/main/analytics*.ts`, `packages/telemetry`, `src/backend`). The user's analytics preference file exists. Analytics itself is another agent's area.

### What shares code with normal notifications (do not break)

- `live-activity-seal.ts`, `live-activity-keys.ts` (phone secret and per-host key), `message-summary.ts`: used by `push-notification-seal.ts`, `push-notifications.ts`, `use-push-notifications.ts`, and desktop notification text.
- `push-notifications.ts` (608 lines) has a `liveActivityShows(...)` option (line ~110) and `LiveActivityRelayPush["alert"]` types. Set to `() => false` or remove the option.
- `use-push-notifications.ts` registers with the host: iPhone payload carries `liveActivityStartedAt` (frozen `push-notifications-v1` schema); send `null`. Sound logic has `activitySound`. Replace with `false`.
- `notification-matrix.tsx`, `server-notification-settings.tsx`, `use-synced-notification-levels.ts`, `notification-level-segments.tsx`, `NotificationService.swift` (agent sender avatar and sealed open), `OpenBotMessagingService.kt` and `SealedNotification.kt` (Android): all normal notifications, keep.
- `desktop-notifications.ts`, `renderer-forwarders.ts`, `agent-notification-level-store.ts`, `notification-preference-store.ts`, `openbot-notification-preference-v1.json` (user has it): normal desktop notifications, keep.
- `openbot-push-notifications-v1.json` (`application-services.ts:373`, `PushNotificationStore`): phone registrations for normal notifications. Not Live Activity. It does not exist in the user's `~/Library/Application Support/OpenBot` (ls this session), so no phone ever registered. Live Activity registrations are in memory only (`live-activity-push.ts` doc comment).

Recommended removal order: (1) phone side and `app.json` plugin and dependency, (2) host sender and route and Worker call, (3) coordinator split, (4) desktop island window, IPC, renderer, settings, UI package, (5) i18n and docs, (6) fixtures and contracts. Run `i18n:check`, preload verify and the mock-openbot preview types at the end.

## Push options and recommendation

Today (evidence: `src/main/central-auth-manager.ts:969-995`, `apps/auth-api/src/server/live-activity-relay.ts:91-130`):

- The host seals content (`push-notification-seal.ts`), posts it to `https://api.openbot.run/v2/remote/hosts/:hostId/notification` with its machine token, and the Worker forwards it to APNs (`api.push.apple.com` or `api.sandbox.push.apple.com`, chosen by the phone's `environment`, `live-activity-relay.ts:118-125`) using nightly-labs' `.p8` key and topic `run.openbot.mobile`. Android goes through Firebase (`google-services.json` is in the repo; sender key lives on the Worker). A fork cannot use that relay: the topic and key belong to the upstream Apple team.
- The phone shows nothing while the app is on screen: the host sends nothing then (`use-push-notifications.ts:~40`, the app shows events itself, and `notification-taps.native.ts:32-43` suppresses a banner for the open chat).
- iOS suspends the app and its WebRTC connection a few seconds after it leaves the foreground. The host notices after about 30 s and sends held events (`push-notifications.ts` `HELD_EVENT_MS`). So **local notifications created by the app cannot cover a backgrounded phone**: no process is alive to receive events. Only APNs wakes it.

Options:

| Option | Needs | Pros | Cons |
| --- | --- | --- | --- |
| A. Foreground only (no push) | Nothing | Zero Apple capabilities, works on a free account, least code | No alerts when the phone is locked or app closed. Agents finish silently |
| B. Direct APNs from the user's host | Paid Apple account, own `.p8` key (APNs auth key) for the team, own bundle id as topic, `aps-environment` entitlement, token `environment` sent by phone already | Keeps sealed content, no third party, small code: replace `sendPushNotification` in `central-auth-manager.ts` with an HTTP/2 APNs client in `src/main` (port of `ApnsRelaySender` in `apps/auth-api/src/server/live-activity-relay.ts`, which builds an ES256 JWT with `jose`). Host stores the `.p8` locally (envsync or a keychain item) | Needs a paid account. Both hosts (Mac mini and MacBook) each need the key. A dev-signed build gets sandbox tokens, so the sender must honor `environment` |
| C. Third-party push (ntfy, Pushover) | Account or self-hosted ntfy | No Apple capability, works on a free account | Content leaves the user's machines unless self-hosted, no deep link or avatar, new code on both sides |
| D. Silent background fetch / BGTask | Background modes | | Unreliable on iOS, cannot be relied on for timely alerts. Not recommended |

**Recommendation:** ship A first (remove registration and the Worker call; leave Android out). If the user wants lock-screen alerts, add B as a later phase, only after confirming a paid account and which team/bundle id will be used. B reuses existing sealing and keys, so the work is one sender module plus a settings field for the key path. Keep the `push-notifications-v1` registration route and store as they are. Do not keep Live Activity: it needs `expo-widgets`, App Groups and a second APNs topic, and the user is dropping it.

Android push needs Firebase and `google-services.json` (`apps/mobile/app.config.js` makes it optional). Out of scope for an iPhone personal build.

## Commands

Run from the repository root `/Users/hridyaagrawal/honey/openbot`. AGENTS.md says not to run broad checks locally: run one check at a time, with one worker, and leave full checks to CI. I did not run any of these.

```sh
bun install --frozen-lockfile                 # needs Bun 1.4.2; this Mac has 1.3.14
bun run mobile                                # expo start (Metro)
bun run mobile:go                             # expo start --go --clear
bun run mobile:go:tunnel                      # same with a tunnel
bun mobile:ios                                # prebuild + expo run:ios (simulator by default)
bun mobile:ios -- --device                    # pick a connected iPhone (Expo CLI)
bun mobile:ios:rocketsim                      # simulator with RocketSim Connect
bun mobile:android                            # expo run:android
bun run dev:mobile                            # scripts/dev-mobile.ts: dev desktop stack + iOS sim + auto-pair via CDP (--pair-only, --simulator=<id>)
bun run mobile:lint                           # biome check apps/mobile/src
bun run mobile:typecheck                      # mobile-codegen.ts + tsrs/tsc --noEmit (AGENTS.md says do not run routinely)
bun run mobile:doctor                         # expo-doctor
bun run typecheck:team-client                 # one-package typecheck, for the coordinator split
bun run typecheck:contracts
bun run typecheck:renderer                    # src/renderer + packages/ui
bun run typecheck:node                        # src/main, backend, preload, scripts
bun run typecheck:i18n
bun run i18n:check                            # key parity across 13 locales
bun run test:related -- <source file>         # vitest related, one worker
bun run test:changed                          # tests that import changed files, vs origin/main
bun run test:desktop -- <path>                # one vitest file
bun run test:push-notification-away          # wired in ci.yml:351
bun run test:notification-summary            # ci.yml:359
bun run test:computer-activity               # ci.yml:355
bun run test:desktop-notifications           # ci.yml:347
bun run test:mobile-share-sender             # share extension page
bun run verify:preload                       # after removing the IPC group
bun run knip:check                           # dead exports after removal
bun run mobile:ios:build:local               # EAS local production build to /private/tmp/openbot-testflight.ipa (needs Expo login + paid account; not for personal use)
```

Mobile has no unit test script of its own. Mobile logic tests are Vitest files under `apps/mobile/src/**` picked up by the root `vitest.config.ts` and `test:related` (20 `*.test.*` files exist across mobile, team-client, ui, renderer, main; only `src/main/trusted-ipc.test.ts` mentions the island). Live Activity coverage is in `scripts/live-activity-*-e2e.ts`, which are not run by CI or `package.json`.

## Open questions

1. **Worker dependence.** The phone needs `api.openbot.run` (Worker) for sign-in, host directory, ticket and Signal. "Remove the OpenBot account and paid servers" and "Mac mini + MacBook hosts" imply a Worker-less direct path (LAN, Tailscale or a user-run Worker). This research found no existing direct mode. Which path does the user want? It decides how much of `central-auth-manager.ts` and the mobile auth stack changes.
2. **Apple account.** Is there a paid Apple Developer Program account for the user? The keychain here has certs for `Mukesh Agrawal` (teams `HSLSDPZZDT` cert user id, `DV6NC6KRYL`). Is the user allowed to use that team? The user's own iPhone is not in the `xctrace` list (maybe not yet paired).
3. **Bundle id and App Group names** for the fork.
4. **Do they still want the share extension and the Notification Service Extension?** Both need App Groups. On a free account they must go; on paid they can stay.
5. **Coordinator split.** `DynamicIslandCoordinator.serverState()` seeds renderer turn state after a server switch (`turns.tsx:75-82`). Do we extract a plain per-server turn store, or accept an empty seed? Needs a design decision and a regression check on server switching.
6. **Frozen protocol.** Delete `live-activity-push-v1` (breaks released-adapter rule and fixtures) or stop advertising it? The AGENTS.md rule targets released clients; this fork has one.
7. **Android.** Keep or remove? Not in the stated goals; removal of FCM, `google-services.json` and `modules/android-notifications` is optional.
8. **Unconfirmed items:** the exact entitlements that `expo-widgets` and `expo-notifications` plugins add (plugin source is not installed); the free-account capability list (only the 7-day, 10 ID, 3 device limits were confirmed from Apple's page); `expo-updates` behavior with a missing `updates.url`; Release-config flags for `expo run:ios --device`.
9. **Local tool versions.** Bun 1.3.14 vs required 1.4.2. Install the pinned Bun before `bun install --frozen-lockfile`.
