# Progress

Upstream base: `de784cee2` (nightly-labs/openbot, 2026-11-03). Remote `upstream`. Branch `personal`.

Plan: `docs/plans/2026-11-03-personal-openbot.md`. Research: `docs/plans/research/`.

## Done
- 2026-11-03: Cloned. Six research reports written and spot-checked against the code. Plan written. No code changed.
- 2026-11-03: Plan revised per Hridya: name Hive (`dev.hridaya.hive`); accounts stay on the mini, nothing to upstream; Dynamic Island dropped from scope; Copilot a first-class provider with a multi-account spike; new Phase 4 fallback chains (Codex#1 → Codex#2 → Copilot, host default chain, failover on start failures); Phase 7 is Android (ntfy on the mini for notifications, build on `win-pc`).

## Next
- Phase 1 (branch `phase/1`), Phase 2 (`phase/2`) and Phase 3 (`phase/3`) run in parallel worktrees, each a Sonnet 5.5 delegate. Phase 1 builds a headless token harness (`tools/token-baseline/measure.ts`, real Codex, temp data folder) and measures the baseline on tag `hive-phase0`, so Task 0.4 does not wait for the GUI sign-in. The lead merges in plan order: 1, then 2, then 3.
- Merge-time checks still open: look at the chat timeline on the mini (slop cut refactored its rows), and run the 7 `browser-*-e2e.ts` drivers on the mini (they now share `scripts/browser-fixture-runner.ts`).

## Evidence
- Spot checks: `AppView.tsx:77`, `listen-loopback.ts:35`, `electron-builder.yml:21-24`, `acp-agent-presets.ts:20`, `server-mode.ts:53`, `ipc-agents.ts:45-47`, `turns.tsx:75`, `provider-runtime.ts:2364-2370`.
- Open conflict: R-tokens says one Codex app-server per agent; the code shares one for default agents. Task 1.1 settles it.

- 2026-11-03: Added Task 1.9 (minimal tool descriptions with a tool-choice eval), Task 6.5 (one agent list across hosts, move agents), Phase 8 (performance hill-climb with a scoreboard and budgets), Phase 9 (WhatsApp through Baileys on the mini). ntfy may run on the mini or the Windows PC.

## Blocked on Hridya
- Mac mini permission prompts (Hive Downloads, Hive local network, `cua-spacesd` controlling System Events): Hridya approved all three on 2026-11-03. Resolved.
- Task 0.4 (steps 1 to 3): the packaged Hive needs an account sign-in (`AppView.tsx:77`), Codex connected on the mini, and an agent `Probe`. Nothing can drive the Hive window on the mini today (see Phase 0 evidence). Need Hridya for the sign-in. Not started: no baseline numbers yet.
- Copilot browser sign-in (Task 3.1), and a second GitHub login if Task 3.3 runs.
- Second Codex account sign-in (Task 4.1).
- Install the ntfy app on the phone (Task 7.3).
- WhatsApp QR scan, and which number (Task 9.1).

## Answered
- Phone is Android; iOS out of scope. Copilot plan: Pro via GitHub Education. Name: Hive.

## Slop cut (2026-11-03, merged as d1e92e4d7)
Hridya asked to cut slop across the whole codebase before the plan. Eight Sonnet 5.5 delegates, one per area (main, backend, renderer, ui, contracts+preload+small packages, mobile, auth-api+remote, scripts+tools), behavior unchanged. They skipped Phase 2 deletion targets, provider-facing prompt and tool text, migrations, Team API protocols, the trust boundary and Dynamic Island code.
- Result: 179 files, +900 -3545. Most of it is duplicated e2e helpers (about 2,080 lines in `scripts/`). knip found almost no dead code: upstream's lint rules keep it lean. Most remaining bulk is Phase 2's commercial code.
- A thermo-nuclear review (fresh Sonnet 5.5) found: `i18n:check` failure (orphaned `settings.agentSelect.*` keys), removed Dynamic Island exports, a cross-feature path helper in the mobile workspace cache, a lost real-clock `waitFor`, vague names. All fixed in 281b61a38.
- Evidence: on the merged `personal`, `typecheck:node`, `typecheck:renderer`, `typecheck:contracts`, `i18n:check` exit 0; `typecheck:api`, `typecheck:storybook` exit 0 on `slop/all`; the pre-commit hook passed the mobile typecheck; `usage-read-pacing-e2e` PASS; area e2e and related vitest runs listed in each delegate report passed. Tag `hive-phase0` marks the Phase 0 build before the cut (for the Phase 8 bench baseline). The cut changes no text sent to providers, so token numbers are the same on both.

## Phase 0 (2026-11-03)

### Task 0.1
Done before this session. Bun 1.4.2 at `~/.bun/bin/bun`. `bun install --frozen-lockfile` passed.

### Task 0.2: partly proven
- Mini setup: repo cloned to `~/honey/openbot` from a bundle of `personal`; `bun install --frozen-lockfile` passed (1456 packages). The mini has Node only in `/opt/homebrew/bin` (v25.6.0). Add it to PATH for `bun run dev`. Without it, the auth-api Vite config fails ("Cannot find package 'vite-module-runner:import-meta-resolve'").
- `bun run dev` on the mini starts all three services (api, remote, app). Renderer answers `http://localhost:5173/` with 200. The Electron main process is alive: `sample` shows its main thread idle in the event loop.
- NOT proven: that the window shows the sign-in screen. The Chrome DevTools port 9334 listens but returns an empty reply to `curl` (also with `--noproxy '*'`), so `bun run dev:automation snapshot` fails ("No dev app answers on 127.0.0.1:9334"). Both dev runs behaved the same. Stage Manager hides the app window on the mini's shared screen. Cause unknown.
- Dev profile folder (from `bun run dev:status`): `~/Library/Application Support/OpenBot Dev wt-24f9a80facd5fda061ac5dc9f2c73c80e02285a8a4c092f338cdf5263fcb9e60` on the mini. Profile name `OpenBot Dev wt-<hash of the worktree path>`; it is separate from the packaged `OpenBot` and `Hive` folders. This is the mini's folder, not the MacBook's.
- `bun run dev:stop` ran; `dev:status` then shows no stacks and no instances.

### Task 0.3: done, with one step partly proven
- Added `packages/contracts/src/app-url-scheme.ts` (`APP_URL_SCHEME`, `APP_URL_PROTOCOL`) and the export in `packages/contracts/package.json`. Code literals of `openbot://` and `"openbot:"` now use it (contracts links, mobile link checks, main deep-link router, Live Activity URL, preview mock). Comments, stories and test fixtures say `dev.hridaya.hive://` as text.
- Step 3 grep: `git grep -n "openbot://" -- src packages apps/mobile/src` returns 0 lines (was more than 20 code lines plus comments).
- Checks (MacBook, through the lock): `typecheck:contracts`, `typecheck:node`, `typecheck:renderer` exit 0; `typecheck:team-client` printed no errors (exit code not captured). `vitest run --changed main --maxWorkers=1`: 49 files, 949 tests passed. `biome check --write` on the changed files: no errors left (it fixed import order in 7 files). `typecheck:mobile` passed in the pre-commit hook, which runs every `typecheck:*` project when the root `package.json` changes (also contracts, node, renderer, team-client, remote, status, telemetry; the commit succeeded).
- `bun run package` on the mini: exit 0. `dist/mac-arm64/Hive.app` exists. `CFBundleIdentifier=dev.hridaya.hive`, `CFBundleName=Hive`, URL scheme `dev.hridaya.hive`, no `ElectronTeamID`, no `Contents/Resources/app-update.yml`.
- Step 5 on the mini: Hive launched (process `Hive.app/Contents/MacOS/Hive`). `~/Library/Application Support/Hive` was created and holds its own `openbot.db`. The upstream `~/Library/Application Support/OpenBot/openbot.db` exists on the mini; `stat -f %m` was 1793711476 before and 1793711476 after (also after the dev runs). Nothing else there was read. `open "dev.hridaya.hive://"` brought Hive to the front (`lsappinfo front` named Hive right after the call). `lsregister` lists the scheme under `Hive.app`. Hive was then stopped with `kill <pid>`.
- Windows files `electron-builder.windows-signing.yml` and `build/installer.nsh` deleted as the plan says. Not updated, left for Task 2.8: `.github/workflows/*`, `scripts/verify-windows-package.ts`, and comments that name them. `scripts/verify-macos-package.ts`, `build-host-installer.ts`, `nix/package.nix` still look for `OpenBot.app`; `bun run package:verify` needs the `Hive.app` path as an argument until then.
- `fork.config.json` from decision D1 was not created. The values live in `APP_URL_SCHEME` and `electron-builder.yml`. Decide in Task 2.x if one file is worth it.
- `src/main/index.ts` also changed `app.setName("OpenBot")` to `"Hive"`. Windows `setAppUserModelId("app.openbot.desktop")` and Linux file names are unchanged (no Windows or Linux use).

### Task 0.4: tools done, baseline not measured
- Moved `breakdown.py` and `q.py` to `tools/token-baseline/` (the rename landed in the Task 0.3 commit, because `git mv` had staged it); wrote `tools/token-baseline/README.md`. `q.py` took a hardcoded path to the upstream database; it now takes the database path as its first argument and opens it read-only. The README query reads the first request per session with `json_extract(tokens_json, '$.uncachedInput')`. Key names checked in `src/backend/agent/usage-collection.ts:69` and `packages/contracts/src/ipc-agent-analytics.ts:11-12`. The query was run on a fake database only. `rollout.py` stays in `docs/plans/research/measure/` (not in the plan's move list).
- Baseline: pending (see Blocked). For reference only, R-tokens M1 measured 55,217 to 61,370 on upstream OpenBot.

### Task 0.5
`bun run package` runs `prepare:remote-desktop-runtime`. It downloads the remote desktop runtime from the GitHub release of `nightly-labs/openbot` (tag `remote-desktop-runtime-ec62decaa9803abc6e1bd5fd9fddebae0aa5cac4540348d0d62229d1a37b3bb0`, `native-runtime.lock.json:387-393`; fetch at `scripts/install-remote-desktop-runtime.ts:45-56`). A hash pins the artifact, so a changed file is refused. The risk: if upstream deletes that release, a clean build fails. The mini's clean checkout built with it on 2026-11-03 ("Installed the pinned darwin-arm64 remote desktop runtime" in the package log). The build also fetches `sherpa-onnx-darwin-arm64@1.13.8` (`prepare-voice`). I did not check where that comes from. Mitigation if upstream removes the release: keep `build/remote-desktop-runtime` from a good build and copy it to the new checkout. Do not rebuild the runtime now.

## Phase 7 (branch `phase/7`, 2026-11-03)

### Task 7.1: done (d9893fddc)
- `apps/mobile/app.json`: name `Hive`, slug `hive`, scheme and `android.package` `dev.hridaya.hive` (the iOS bundle id stays as upstream has it). `updates` is `{ "enabled": false }`: the upstream `updates.url`, `owner` and EAS `projectId` point at nightly-labs' Expo account, so a release build would have checked their OTA server. Deleted `apps/mobile/google-services.json`. `eas.json` lost the `production` build and `submit`. Deleted `android:release:play` (mobile and root `package.json`).
- Left alone: Kotlin package names `run.openbot.*` in `modules/*` (internal, the build does not need them changed), `.github/workflows/release-android.yml` and `fastlane/Fastfile` (Task 2.8), README Play sections.
- Check: pre-commit ran every `typecheck:*` project (including mobile): pass.

### Task 7.3 (Steps 1 to 4): done (7d00ea989). Step 5 blocked on Hridya.
- **Surprise:** the plan says `brew install ntfy`. That formula and the official darwin release are client-only (`noserver` build tag; `ntfy serve`, `user`, `token` do not exist). On the mini I built the server from the v2.37.1 source: `go build` needs `mkdir server/docs server/site; touch server/docs/index.html server/site/app.html` first (the Makefile target `cli-deps-static-sites`), cgo, and `SDKROOT=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX15.4.sdk` (the macOS 27 SDK `.tbd` files use `arm64e.x1-macos`, which this machine's `ld` does not know). Binary: `~/.hive-ntfy/bin/ntfy` on the mini. I uninstalled the brew client I had installed.
- Mini setup (undo list): `~/.hive-ntfy/` (binary, `server.yml`, `data/` with `user.db`, `cache.db`, `token.txt`, `phone-password.txt`, `topic.txt`, source in `dl/`); launchd agent `~/Library/LaunchAgents/dev.hridaya.hive.ntfy.plist` (label `dev.hridaya.hive.ntfy`, `RunAtLoad`, `KeepAlive`); `tailscale serve --bg --https=10000 http://127.0.0.1:2586` (tailnet only; undo: `tailscale serve --https=10000 off`). Port 10000, not 443, 445, 8443 (already used) or 8446/8447 (another phase). No Funnel.
- Server config: listens on `127.0.0.1:2586`, `behind-proxy`, `auth-default-access: deny-all`. One user `hive` (role `user`) with read-write access to the one topic only. One access token (label `hive-host`).
- Secrets in envsync (values not in git or in this file): `HIVE_NTFY_TOKEN` (host and curl), `HIVE_NTFY_PASSWORD` (the password of user `hive`, for the phone app login). The topic is not a secret: `hive-77761ebe234f05b3`.
- Step 1 evidence, from the MacBook: with token `200`; no token `403`; with token on another topic `403`.
- Steps 2 to 4: `scripts/push-notification-away-e2e.ts` got a fake ntfy HTTP endpoint and a sixth step. First run FAILED (`Cannot find module '../src/main/ntfy-notifier'`). After the implementation all six steps PASS (`.openbot-build/push-notification-away-e2e/report.json`: the five existing away, level and resend cases and the new one: one POST, `Authorization: Bearer <token>`, title `Agent A`, message the answer, `click` link with `server` and `agent`, zero relay sends). The real sender also posted to the real ntfy server on the mini over Tailscale and the message read back (non-ASCII title intact); a wrong token fails.
- Design: `src/main/ntfy-notifier.ts` (`ntfyConfigFromEnvironment`, `createNtfySender`: JSON publish, so non-ASCII titles need no header encoding). `PushNotificationService.#send` sends Android registrations to the `ntfy` option when set, with the same resend delays. Everything before it (away, mute, levels, preview, hidden agents) is upstream's code, unchanged. The host reads `HIVE_NTFY_URL` (server base URL), `HIVE_NTFY_TOPIC`, `HIVE_NTFY_TOKEN` from its environment (`application-services.ts`). I did not add settings UI: environment variables need no migration and match the plan's "one URL setting" for a single user.
- **Gap the plan missed:** without Firebase, the Android app never gets a device token, so it never registered with the host (`use-push-notifications.ts`: `deliverable && !token` returns) and the host would never know the phone is away. Fix in `android-push-notifications.android.ts`: when `getDevicePushTokenAsync` rejects, use a fixed placeholder token. The host ignores it when ntfy is set. Consequence: Hive on the phone must still be allowed to show notifications (Android permission), or it does not register.
- Tap: the notification carries `dev.hridaya.hive://live-activity?server=<id>&agent=<id>`, which the app's existing link handler opens as a chat (`live-activity-link.ts`). Not yet tried on a device.
- `PRIVACY.md` has a new section "Android notifications through ntfy".
- To turn it on for the host on the mini: set `HIVE_NTFY_URL=https://hridyas-mini.tail59dec9.ts.net:10000`, `HIVE_NTFY_TOPIC=hive-77761ebe234f05b3`, `HIVE_NTFY_TOKEN=$(envsync get HIVE_NTFY_TOKEN)` in the environment of the Hive host process on the mini (Phase 6 decides how that process starts). The token also sits in `~/.hive-ntfy/data/token.txt` on the mini (mode 600).

### Task 7.2: build and install done, pairing left for the lead
- On `win-pc` (repo copy at `D:\hive7` from `git archive` of `phase/7`, short path on purpose; `C:` is 96% full): `bun install --frozen-lockfile` 1454 packages (bun there is 1.4.0, the lockfile accepted it), then `bun run mobile:android`. First two builds failed. Fixes:
  1. `plugins/with-workspace-bundle-inputs.js` wrote Windows backslash paths into Groovy strings (`"..\..\..\packages\brand\src"`: "Unexpected character"). Now forward slashes. Committed in bd258837c. This is an upstream bug on Windows.
  2. `ninja: error: mkdir(...rngesturehandler_codegen...): No such file or directory`: the CMake build tree for react-native-gesture-handler passes the 260-character path limit. `LongPathsEnabled` was already 1, but the SDK's ninja is 1.10.2 and not long-path aware. I replaced `D:\Android\Sdk\cmake\3.22.1\bin\ninja.exe` with ninja 1.13.1 (original saved as `ninja-1.10.2.exe.bak` in the same folder; undo: copy it back). This is a change to the PC's SDK, outside the repo.
  3. Then `BUILD SUCCESSFUL in 2m 55s` (the first, failed native compile had run 6m 36s), `dev.hridaya.hive` installed on `emulator-5554` (Pixel_API_37, started with `emulator.exe -avd Pixel_API_37 -no-snapshot-save -no-audio` through PowerShell `Start-Process`).
- Screens I reached and looked at (screenshots on the MacBook, scratchpad `shots/p7-s1.png` to `p7-s6.png`): splash with the eyes; the Android nearby-devices permission prompt that names "Hive"; "Link unavailable" (the dev client opens its own `exp+hive://` URL through the incoming-link handler: upstream behaviour for a dev client, close it); the sign-in screen ("Your agents, anywhere." with Scan QR code and Continue with email); the camera permission screen.
- Interface text still says "OpenBot" on the phone ("Connect to OpenBot on your computer", camera text). Left as is: it is in the i18n catalog, which Phase 2 reworks.
- **Pairing not done.** Reason: Mobile Connect needs the account service. A release build accepts only an `https` account URL. A dev build also accepts `http` for loopback and RFC 1918 hosts only (`isMobileConnectDevelopmentHost`, `packages/contracts/src/mobile-connect.ts:138`), so a Tailscale `100.x` address is refused. The ticket also carries the Signal URL, which the emulator must reach. So pairing needs Phase 5's account service and Signal behind `tailscale serve` HTTPS on the mini (the PC's Tailscale can reach it), and the phone then scans or opens the QR link. The lead runs that step after merging Phase 5. Not tried: forwarding the mini's `bun run dev` API to `10.0.2.2` on the PC.
- Not done in the emulator: opening an agent and sending a message (needs pairing).

### Task 7.4: keystore and release APK built (33f20303d). Install on the phone blocked on Hridya.
- Keystore: `D:\hive-keys\hive-release.jks` on `win-pc` (alias `hive`, RSA 2048, valid 10,000 days, one password for store and key in `D:\hive-keys\store-password.txt`). Password in envsync as `HIVE_ANDROID_KEYSTORE_PASSWORD`. A base64 backup of the keystore is in envsync as `HIVE_ANDROID_KEYSTORE_B64` (restore with `envsync get HIVE_ANDROID_KEYSTORE_B64 | base64 -d > hive-release.jks`). Without this key, a later APK cannot update the installed one in place.
- Signing: new config plugin `apps/mobile/plugins/with-release-signing.js` (listed in `app.json`). It does nothing unless the environment sets `HIVE_ANDROID_KEYSTORE` and `HIVE_ANDROID_KEYSTORE_PASSWORD_FILE`, so no secret enters the generated Gradle files or git.
- Build command, on `win-pc` in `D:\hive7\apps\mobile\android` after `bun run mobile:android` has done the prebuild: `HIVE_ANDROID_KEYSTORE=D:/hive-keys/hive-release.jks HIVE_ANDROID_KEYSTORE_PASSWORD_FILE=D:/hive-keys/store-password.txt NODE_ENV=production ./gradlew.bat app:assembleRelease -x lint -x test --build-cache -PreactNativeArchitectures=arm64-v8a "-Dorg.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=2g"`. **Differs from the plan** (`bun mobile:android --variant release`): that command also installs on the connected device, and the only device is the x86_64 emulator, which cannot take an arm64 APK. The first release run died with "Gradle build daemon has been stopped ... out of JVM Metaspace" (R8 minify against `org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m` from the generated `gradle.properties`); the larger heap fixed it. `BUILD SUCCESSFUL in 3m 15s`.
- Evidence: `apksigner verify --print-certs`: `Verifies`, v2 scheme true, signer `CN=Hive, O=Hridya Agrawal, C=IN`, SHA-256 `7e1d9fbeb49f79e4a11f90a324a76678c2a2c935332f6431e722ba748bc4de18`, same as `keytool -list`. `aapt2 dump badging`: package `dev.hridaya.hive`, label `Hive`, versionName `1.4.5`, native code `arm64-v8a` only (the tailnet lists the phone as `honor-x8`, an arm64 device; confirm before installing). Not run on the emulator (x86_64).
- APK on the MacBook: `/Users/hridyaagrawal/Honey/hive-android/hive-1.4.5-arm64-release.apk` (117,911,642 bytes, SHA-256 `d1d3941c8a98da07fae4a8f9bb14d3c5dbe978a4f6b50ff790bddfdd1ce10cdb`). Also on `win-pc` at `D:\hive7\apps\mobile\android\app\build\outputs\apk\release\app-release.apk`.
- Install steps for Hridya: copy the APK to the phone (AirDrop is not available on Android; use Tailscale file send, `adb install -r` over USB or wireless debugging, or any file share), open it, allow "install unknown apps" for the app that opened it. Then do steps 1 to 4 of the block below. The Phase 7 external check is those four steps plus: pair the phone with the mini by QR over Tailscale and send a message (needs the Phase 5 account service).
- Upstream analytics: `mobile-analytics.ts:50-58` returns no client unless `EXPO_PUBLIC_OPENPANEL_CLIENT_ID`, `EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET` and `EXPO_PUBLIC_APP_ENV=production` are set at build time. My release build set none of them, so the APK sends no analytics (by that code; not observed on a device). The hard-coded URL `https://analytics.openbot.run/api` stays until Phase 2.6. Do not set those variables for this fork.

### Blocked on Hridya (Task 7.3 Step 5 and Task 7.4 external check)
1. Install the **ntfy** app on the Android phone (F-Droid or Play). Phone and mini must be on Tailscale.
2. In ntfy: Settings, Add default server or Add subscription with "Use another server". Server URL `https://hridyas-mini.tail59dec9.ts.net:10000`, topic `hive-77761ebe234f05b3`. Log in with user `hive` and the password from `envsync get HIVE_NTFY_PASSWORD` on the MacBook. Turn on "Instant delivery" and keep the ntfy battery setting unrestricted.
3. Install the Hive APK (see below), open it once, allow notifications, and pair it with the mini host.
4. Lock the phone. Finish a turn of an agent on the mini. A notification must arrive with the agent name and the answer, and a tap must open Hive on that agent.
