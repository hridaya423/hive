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

## Phase 5 (branch `phase/5`)

### Task 5.1: spike PASSED (2026-11-03)
Pass check: a MacBook run signs in against the mini and joins a host on the mini. Observed:
- **Tailscale on the mini:** CLI at `/usr/local/bin/tailscale` (not on the default `space_bash` PATH). Tailnet `tail59dec9.ts.net`, mini DNS name `hridyas-mini.tail59dec9.ts.net`, HTTPS certs on, one tailnet user (`hridayahoney@gmail.com`). Serve ports 443, 445, 8443, 8444, 8445 are in use by other apps and were not touched. Funnel is off (`tailscale funnel status` lists nothing public).
- **Services (spike, under launchd, labels `dev.hridaya.hive.spike.worker` and `.signal`):** Worker = `bun scripts/run-development.ts api` (Vite dev with the Cloudflare plugin, workerd) on `127.0.0.1:3100`. Signal = `bun remote/api/src/index.ts` on `127.0.0.1:3101`, `REMOTE_TLS_DISABLED=true`, `REMOTE_TRUST_PROXY=true`. Both from the clone `~/honey/hive-phase-5`. Scripts, plists and logs: `~/honey/hive-p5-ops/{worker.sh,signal.sh,*.log}`, `~/Library/LaunchAgents/dev.hridaya.hive.spike.*.plist`.
- **Serve (added, undo with `tailscale serve --https=<port> off`):** `tailscale serve --bg --https=8446 http://127.0.0.1:3100` (Worker) and `--https=8447 http://127.0.0.1:3101` (Signal). Ports 8446 and 8447 were free.
- **Identity header:** a temporary echo server behind `serve` (port 8448, removed) showed `Tailscale-User-Login: hridayahoney@gmail.com` on a request from the mini and on a request from the MacBook. `X-Forwarded-For` carried the caller's tailnet IP. The phone (`honor-x8`) was offline (last seen 11 days ago), so the header from the phone is NOT checked yet. Check it before Phase 7.
- **Sign-in from the MacBook:** a headless Bun script (`.openbot-build/spike-5-1/spike.ts`, git-ignored) runs the real `CentralAuthManager` against `https://hridyas-mini.tail59dec9.ts.net:8446`: `requestEmailCode` returned the dev code, `verifyEmailCode` gave `signed_in`, `registerRemoteHost`, `issueRemoteHostTicket`, `startRemoteSession`, `issueRemoteSessionTicket`, `listRemoteHosts` all passed. The ticket carries `signalUrl: wss://hridyas-mini.tail59dec9.ts.net:8447/v1/signal`.
- **First error:** the Worker answered 500 (`AuthOperationError`) until `bun run api:migrate:local` ran in the clone. A fresh clone needs the local D1 migration once. Task 5.5 must run it.
- **Join a host on the mini (cross machine):** host peer = hidden Electron window on the mini, client peer = hidden Electron window on the MacBook (dock hidden), both through Signal over the tailnet, 1 MiB over a DataChannel. Result: host `received: 1048576`, client `sent: 1048576`, selected pair `host/udp/fd7a:115c:a1e0::…` on both sides (tailnet IPv6 addresses). No relay.
- **Unknown 2, TURN unreachable:** `TURN_HOST=198.51.100.7` (TEST-NET-2, nothing answers) and the ICE list had 4 TURN/STUN URLs. Connection still worked over host candidates, on one machine (`team-webrtc-live-smoke`, `path: p2p, protocol: udp`) and across the tailnet (above). **Result: coturn is not needed.** Signal still needs `TURN_HOST` and `TURN_SHARED_SECRET` to start (required by config).
- **Unknown 3, cron outbox:** the dev Worker does NOT fire its crons by itself (no `Hosted site cleanup` log line in 25 minutes). `GET http://127.0.0.1:3100/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*` runs the scheduled handler (HTTP 200). Test: stopped Signal, ended a session, three events stayed in `remote_auth_events` (attempts 1); started Signal, called the endpoint once the events were due (backoff about 60 s): table empty. **Effect:** revocations retry only when something calls that endpoint. Task 5.5 adds a launchd job that calls it every minute.
- **Surprise (upstream leak, fixed in the spike):** `apps/auth-api/wrangler.jsonc` top-level `vars` set `REMOTE_AUTH_WEBHOOK_URLS` to `signal1.openbot.run` and `signal2.openbot.run`, and `REMOTE_SIGNAL_HOMES` to the same hosts. My first run set only `REMOTE_AUTH_WEBHOOK_URL`, so the Worker queued revocation events for the upstream Signal hosts (4 rows, `pending_targets` listed them; they held random host and user UUIDs and were signed with a throwaway key). I deleted the rows from the throwaway database and set both variables to empty in `worker.sh`. Task 5.4 must blank them in the config the Worker reads. They are also in `[R-accounts]` only as "REMOTE_SIGNAL_URL", so the research missed this.
- **Unknown 1, 24 h uptime: RUNNING.** Worker (second start) began `2026-11-03T16:31:17Z`, Signal `2026-11-03T16:32:27Z` (restarted for the outbox test). Check any time after `2026-11-04T16:35Z` with `sh ~/honey/hive-p5-ops/uptime-check.sh` on the mini (prints elapsed time, pids, RSS, health). Baseline at 16:47Z: workerd RSS 183 MB, Signal 55 MB, both health 200. launchd has `KeepAlive`, so a crash shows as a changed pid or a short `etime`.
- **Dev ports note:** Vite dev blocks unknown Host headers. The Worker needs `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=hridyas-mini.tail59dec9.ts.net` (set in `worker.sh`). Task 5.5 keeps it.
- Spike launchd labels use `dev.hridaya.hive.spike.*`. Task 5.5 replaces them with `dev.hridaya.hive.control-plane.*`. Undo for the spike: `launchctl bootout gui/$(id -u)/dev.hridaya.hive.spike.worker` (and `.signal`), delete the two plists, `tailscale serve --https=8446 off`, `tailscale serve --https=8447 off`.
