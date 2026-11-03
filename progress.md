# Progress

Upstream base: `de784cee2` (nightly-labs/openbot, 2026-11-03). Remote `upstream`. Branch `personal`.

Plan: `docs/plans/2026-11-03-personal-openbot.md`. Research: `docs/plans/research/`.

## Done
- 2026-11-03: Cloned. Six research reports written and spot-checked against the code. Plan written. No code changed.
- 2026-11-03: Plan revised per Hridya: name Hive (`dev.hridaya.hive`); accounts stay on the mini, nothing to upstream; Dynamic Island dropped from scope; Copilot a first-class provider with a multi-account spike; new Phase 4 fallback chains (Codex#1 → Codex#2 → Copilot, host default chain, failover on start failures); Phase 7 is Android (ntfy on the mini for notifications, build on `win-pc`).

## Next
- Task 0.4 steps 1 to 3 (baseline numbers) after Hridya clears the blockers below. Then Phase 1.

## Evidence
- Spot checks: `AppView.tsx:77`, `listen-loopback.ts:35`, `electron-builder.yml:21-24`, `acp-agent-presets.ts:20`, `server-mode.ts:53`, `ipc-agents.ts:45-47`, `turns.tsx:75`, `provider-runtime.ts:2364-2370`.
- Open conflict: R-tokens says one Codex app-server per agent; the code shares one for default agents. Task 1.1 settles it.

- 2026-11-03: Added Task 1.9 (minimal tool descriptions with a tool-choice eval), Task 6.5 (one agent list across hosts, move agents), Phase 8 (performance hill-climb with a scoreboard and budgets), Phase 9 (WhatsApp through Baileys on the mini). ntfy may run on the mini or the Windows PC.

## Blocked on Hridya
- Mac mini screen: macOS permission prompts are stacked on screen and the mini's desktop is shared with another agent's Chrome window. Agents must not answer permission prompts. Pending: "Hive would like to access files in your Downloads folder", "Hive ... local network", and "cua-spacesd wants to control System Events" (caused by an `osascript` probe of mine). Answer them, or tell me which to allow.
- Task 0.4 (steps 1 to 3): the packaged Hive needs an account sign-in (`AppView.tsx:77`), Codex connected on the mini, and an agent `Probe`. Nothing can drive the Hive window on the mini today (see Phase 0 evidence). Need Hridya for the sign-in. Not started: no baseline numbers yet.
- Copilot browser sign-in (Task 3.1), and a second GitHub login if Task 3.3 runs.
- Second Codex account sign-in (Task 4.1).
- Install the ntfy app on the phone (Task 7.3).
- WhatsApp QR scan, and which number (Task 9.1).

## Answered
- Phone is Android; iOS out of scope. Copilot plan: Pro via GitHub Education. Name: Hive.

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

### Task 2.7: Worker stripped to auth and hosts (branch `phase/2-worker`)
- Deleted: `apps/{site-router,status,slack-app,discord-app,telegram-app}`, `scripts/{hosting,stripe-*,status-page-smoke,agent-template-page-e2e}`, the shop, hosted-site, license and billing code in `apps/auth-api/src/server`, the marketing and legal pages, `content-art` (35 MB), `content-image*`, five shop e2e scripts, and their `package.json` entries. `routeTree.gen.ts` was regenerated by `bun run api:build:check` (vite build).
- Kept the `*/5` cron: it also delivers the auth event outbox and runs the daily retention. Only the hosted-server, hosted-site and sales jobs left `worker-handler.ts`.
- Member limit now reads only `server_member_limits` (custom) and `DEFAULT_TEAM_MEMBER_LIMIT`. `SERVER_MEMBER_LIMIT_SQL` moved into `remote-control-plane.ts` (the migration test imports it there).
- Checks (MacBook, through the lock): `typecheck:api` exit 0; `test:api` 17 files, 32 tests pass; `test:remote-auth-events`, `test:cloud-authorization`, `test:signal-entry-failover`, `test:invite-acceptance`, `test:host-key-handover`, `test:remote-signal-homes`, `test:mobile-connected-devices`, `test:smtp-stall`, `test:keep-previous-assets` exit 0 with no FAIL line; `api:build:check` exit 0; `knip:check` exit 0 (3 configuration hints only).
- Left for other tasks: see the final report of this branch.

## Phase 2 (branch `phase/2`, started 2026-11-03)

### Task 2.1: done (4ece084d7)
- Blocklist: `provider-runtime-releases.ts` now exports `bundledBlockedVersions`, built from the bundled `provider-runtime-blocklist.json`. `ProviderRuntimeManager` and `scripts/provider-cli-canary.ts` read it. The fetch of `raw.githubusercontent.com/nightly-labs/openbot/main/...` is gone.
- `host-release-service.ts` no longer polls GitHub. Its status is always `unavailable`; the Team API route and `HostReleaseStatus` contract stay. `hosted-update-adapter.ts` (Linux hosted installer, polled upstream releases) deleted with its wiring in `application-services.ts`.
- `app-archive-watch.ts`: the dialog has no "Download" button and never opens `openbot.run/download`.
- `scripts/host-manager-macos.ts`: `stageLatest` returns null (no GitHub release lookup, no DMG download).
- Analytics: desktop host and renderer enable only with a loopback capture URL (dev only). Before, a packaged production build sent events to `analytics.openbot.run`. CSP no longer lists `analytics.openbot.run`. Web client senders still gate on `window.location.origin === "https://openbot.run"` (removed in 2.6).
- Check: `typecheck:node`, `typecheck:renderer` pass; CSP and host-release decoding tests pass (18 tests); `bun run build && bun run verify:preload` pass (712 methods); `knip:check` clean (4 pre-existing configuration hints).
- "Before" network check, Mac mini, Phase 0 build of `Hive.app`, 15 min, `lsof -nP -i` on the Hive PID every 5 s (`~/hive-checks/before.log` on the mini). Remote peers: `172.67.136.14:443` (Cloudflare; `api.openbot.run`, `analytics.openbot.run` and `openbot.run` all resolve there: upstream contacted), `20.26.156.210:443` (`api.github.com`), `104.16.10.34:443` and `104.18.19.80:443` (`registry.npmjs.org` and `cdn`/registry style Cloudflare hosts), `57.144.62.128:443` (`lookaside.facebook.com`, Meta provider runtime check). `signal.openbot.run` (65.109.88.58) was not seen while signed out.

### Task 2.2: done (a526877ee)
- 12 locale folders deleted (1,272 files, 163,689 lines). `APP_LANGUAGES = ["system", "en"]`, `TRANSLATED_LOCALES = ["en"]`. `lazy-catalogs.ts`, `mobile-catalogs.native.ts` and the Vite alias deleted. `locale-loading.ts` is a stub, removed after the Worker merge.
- Language wheel, language selector (desktop settings, web account settings), onboarding language step and the mobile language screen removed. The saved-language IPC and main service stay: an old saved `de` tag still reads back as the system default.
- `bun run i18n:check` passes (11,939 English keys, was 11,949). `i18n-e2e.ts` and `i18n-fit-e2e.ts` deleted.
- Checks: typecheck contracts, i18n, node, renderer, mobile pass; `app-decoding.test.ts` 90 tests pass; build + verify:preload pass; knip clean.

### Surprise: "analytics" in contracts is two things
`AgentAnalytics`, `HostAnalytics`, `readAgentAnalytics`, `readHostAnalytics`, `team-protocol/analytics-v1` and `host-analytics-v1` are the local **Usage report** (token counts from `openbot.db`). The research listed them as telemetry. They stay.

### Tasks 2.3 to 2.7: merged into `phase/2`
- 2.3 hosted sites, 2.3 licence purchase, 2.4 hosted servers and billing: commits bd39485c2, f368c3d3a, 0de2858d4 (merge eaed39410). The join and local-server flows stay (`AddServerOverlay` join part, mobile `scan`, `local`). `c1fe58062` removes the unused `OrderForm`, `money.ts` and `hosted-server-wake`.
- 2.6 telemetry: 3bd507c57, b56300e93, 1b64c058a, 74bce9e3c. `packages/telemetry`, OpenPanel, `ANALYTICS.md` deleted. Failure classification moved to `@openbot/user-errors/failure-cause` because provider failover uses it.
- 2.7 Worker: aba741744 (merge 11f54e835).
- Data safety: `git diff personal...HEAD` has 0 changes in `src/backend/openbot-database-schema.ts`, in any `*migration*` file, in `apps/auth-api/migrations` and in `packages/contracts/src/team-protocol`. 0 contract files deleted. Readers of old rows stay (`hostedSiteConversationEvent`, `HostedSiteEventLog`, `excludeHostedSiteEvents`). `openbot-database.test.ts` and `agent-usage-migration.test.ts`: 92 tests pass.
- Checks on the merged head: typecheck contracts, node, renderer, team-client, api, remote, mobile exit 0; `build` and `verify:preload` pass (688 methods, was 712 before 2.1); `check:ui`, `check:doc-links`, `i18n:check` (11,340 English keys, was 11,949) and `knip:check` (4 configuration hints) pass; `bunx vitest run --changed personal --maxWorkers=1`: 53 files, 957 tests pass; `test:invite-acceptance` exit 0, no FAIL (report in `.openbot-build/invite-acceptance-e2e/report.json`).

### Task 2.5: `local-servers-e2e.ts` NOT proven
- The code of `src/main/local-servers/`, `local-server-child.ts` and `server-mode.ts` has no diff against `personal`.
- Mini, dev stack of a clone at `c1fe58062`: the first run opened the create dialog and `local-servers:create` failed after 96 s with "The server on this computer did not start" (`.openbot-build/local-servers-e2e/report.json` on the mini). The child had no `--use-mock-keychain`, so a macOS keychain prompt ("Hive Safe Storage") is the likely cause. I added that flag to the child arguments in the disposable clone only. Later runs could not click: the dev window stays in the Stage Manager strip, its splash waits for a CSS animation event and never ends, and menus do not open. A keychain prompt owned by another running Hive (PID 50434 from `~/honey/openbot`) sits over the desktop. I did not answer it.
- Needs Hridya: answer or dismiss that prompt, then run `bun scripts/local-servers-e2e.ts --allow-mutations` against a visible dev app.

### Task 2.9: network check after (Mac mini)
- Build: `bun run package` of `c1fe58062` in `~/honey/hive-p2-9`. The GitHub API rate limit (HTTP 403, 60 per hour without token) stopped the runtime download, so I copied `build/remote-desktop-runtime` and `build/cua-driver` from the older clone (same `native-runtime.lock.json`, `cmp` equal). Then `package` exit 0.
- The default launch stalls at the keychain prompt, so the app never starts its services. Launch with `--user-data-dir=<new dir> --use-mock-keychain` (the flags `scripts/verify-macos-package.ts` uses). Services start: logs, loopback listeners.
- 15 minutes, `lsof -nP -i -a -p` on every process with that profile, every 5 s, 356 lines (`~/hive-checks/after29.log` on the mini): only `127.0.0.1:51286` and `127.0.0.1:51287` LISTEN. 0 remote peers. Before (Phase 0 build, 15 min): 5 remote peers (`172.67.136.14` Cloudflare, `20.26.156.210` GitHub, `104.16.10.34`, `104.18.19.80`, `57.144.62.128` Meta).
- Same signed-out state in both runs. The check does not cover a signed-in session: `api.openbot.run` and `signal.openbot.run` are then the expected hosts.
- `git grep "openbot\.run\|nightly-labs"` outside `apps/auth-api` and i18n: only constants for share, invite and marketplace link origins, podspec homepages, the mobile About and support rows, the mobile `app.json` associated domain, and one skill id. None runs without a user action.
- Visual check of Settings and the server menu: not done (window occluded, same cause as 2.5). One frame of the rail is in `/private/tmp/claude-501/shots29/settings-general.png` on this computer: no hosting or billing entries; the "OpenBot for mobile" card is still there.

## Task 2.8: repo furniture (branch `phase/2-furniture`)
- Done: CLA, review and release workflows, deploy and announcement scripts, Linux and Windows packaging (`nix/`, `docker/`, `flake.*`, AppImage/NSIS targets), `install-server.sh`, `install-host-update-agent.sh`, host installer scripts, upstream skills `babysit`, `ship`, `smoke-and-ship`. `ci.yml` keeps its test jobs and loses `deploy-production` and the preview upload. README, PRIVACY, RELEASING, TROUBLESHOOTING rewritten for Hive. Docs of hosted servers, Docker and the Linux server removed.
- Evidence: `bun run check:doc-links` and `check:agent-context` pass; `knip:check` shows only the 4 configuration hints; the script-target checker reports 0 missing targets; all workflow YAML parses.
- Left for others: `apps/mobile/package.json` scripts `ios:release:testflight` and `android:release:play` call deleted workflows; stale hosted-server wording in `docs/web-client.md`, `remote/README.md`; `src` comments naming `install-server.sh`; `release-upgrade-safety` and `signal-deploy` skills name deleted files; `package.json` `repository`, `bugs`, `homepage` still name upstream.
