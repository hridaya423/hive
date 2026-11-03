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

## Phase 4 (branch phase/4, 2026-11-03)

### Task 4.1: blocked on Hridya
Second Codex account needs Hridya's ChatGPT sign-in. Not started.

### Task 4.2: done (commits 153e730d8, a511222a7)
- Host default chain: `src/main/host-backup-models-preference-store.ts` (file `openbot-host-backup-models-v1.json`, `PreferenceStore`, no migration). Endpoints `app:get-host-backup-models` and `app:set-host-backup-models` (contracts, handler, preload decoder `decodeAgentBackupModels`, preview mock). `AgentService` option `hostBackupModels`; `#backupModelsOf(agent)` is `agent.backupModels ?? host`. The agent's own chain wins, also when empty. Entries with a removed or unconnected account are skipped by `#modelChoiceReady`. Any provider in `AGENT_PROVIDERS` is accepted (`isAgentModelChoice`), so Copilot works once Phase 3 merges.
- UI: Settings > Providers has a "Fallback order" row and page (`BackupModelsPage host`). English keys only (`provider.settings.fallbackOrder*`, `agentSettings.backupModels.host*`). Local server only.
- Evidence: red then green. Before the change the new case failed (`The message completes: API Error: 529`). After: `bun run test:backup-model-failover` PASS, 25 checks (20 existing, 5 new).
- Visual check: storybook stories `Conversation/Backup models` `HostEmpty` and `HostOrder`, headless Chrome on the mini (`~/honey/hive-phase-4`, storybook port 6008). Both look right. NOT seen: the new row in the Providers list and the real dev window. `bun run dev` started on the mini, but the Electron window was hidden (same Stage Manager issue as Phase 0; `dev:automation snapshot` fails on port 9333, and another agent's Electron was frontmost). Lead should look at the row. Stack stopped with `dev:stop`.
- Known gap: the chat's usage-limit ask card reads only `agent.backupModels`, so with a host chain it can flash for a moment before the move.

### Task 4.3: done (3bfce008b)
- Cause found by running the case: a Claude process that exits at start does not fail `turn/start`; the turn ends with "Claude Code process exited with code 1" and classifies as `unknown`, so it never failed over. New `isFailoverFailure` (`provider-diagnostics.ts`) adds "exited with code|signal" to the failover causes; `turn-lifecycle.ts` uses it.
- A refused `turn/start` (Codex 401) now goes through `DrainScheduler.startDelivery`: messages go back to the queue, `UsageLimitGate.failed` holds the model 10 minutes, the next drain moves the agent. Not for channel, messaging or task deliveries.
- Evidence: the 401 case failed without the drain change (`The message completes: Your access token could not be refreshed`) and passes with it. The exit case failed before, passes after. Note: a backup on the same provider as a dead process is not ready (provider state "error"), so the e2e backs up onto Codex.
- `docs/architecture/providers.md` and `changelog.d/phase-4-fallback-chains.md` updated.

### Task 4.4: no code change needed
Routine runs already fail over. New case `a routine run fails over to the backup model` (Test run of a routine, first model overloaded) passes: models `[PRIMARY, BACKUP]`, no error. Kept as coverage in the 4.3 commit.

### Task 4.5: pending for the lead (needs 4.1 and Phase 3)
Set host chain Codex 1 > Codex 2 > Copilot in Settings > Providers > Fallback order, clear per-agent chains on the crew.

### Other checks
`typecheck:contracts`, `typecheck:node`, `typecheck:renderer`, `typecheck:storybook` exit 0; `vitest src/main/ipc-channel-coverage.test.ts` 14 passed; `i18n:check` reports counts (other locales lack the new keys; Phase 2 deletes them); biome clean on changed files; pre-commit hook passed.
