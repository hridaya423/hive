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
Hridya does all sign-ins and phone steps at the end, after all code is finished, as one setup session (decided 2026-11-03). Agents build and test everything against fakes until then.
- Mac mini permission prompts (Hive Downloads, Hive local network, `cua-spacesd` controlling System Events): Hridya approved all three on 2026-11-03. Resolved.
- Task 0.4 (steps 1 to 3): the packaged Hive needs an account sign-in (`AppView.tsx:77`), Codex connected on the mini, and an agent `Probe`. Nothing can drive the Hive window on the mini today (see Phase 0 evidence). Need Hridya for the sign-in. Not started: no baseline numbers yet.
- Copilot browser sign-in (Task 3.1), and a second GitHub login if Task 3.3 runs.
- Second Codex account sign-in (Task 4.1).
- Install the ntfy app on the phone (Task 7.3).
- WhatsApp QR scan, and which number (Task 9.1).

## Answered
- 2026-11-03: WhatsApp uses `baileys` as a normal dependency. Hridya accepts its GPL-3.0 `libsignal` for private personal use ("this is just for personal use pls ignore that and setup baileys properly"). AGENTS.md's PolyForm-compatibility rule is set aside for these two packages only.
- Phone is Android; iOS out of scope. Copilot plan: Pro via GitHub Education. Name: Hive.

## Lead notes (2026-11-03)
- Token baseline (GUI, mini, Phase 0 build): first request 49,022 uncached with the 58 Computer Use tools (26,443 tok), 26,750 without them. Both read from `agent_usage_records` in the mini's Hive `openbot.db`. Details under "Mini checks". Phase 1's headless harness cross-checks it.
- Folder leak found by the mini checks and fixed in 737b8a44e: Hive used `appData/OpenBot/provider-runtimes`, `~/OpenBot` (agent workspaces) and `~/OpenBot/Servers`, which are upstream's folders. Now `APP_FOLDER_NAME` (`Hive`). Test `scripts/hive-folders-e2e.ts`: FAIL before ("The agents folder is not under ~/Hive."), PASS after; `typecheck:node`, `typecheck:contracts` exit 0. Side effect already on the mini: the Phase 0 Hive ran Codex from the mini's `~/Library/Application Support/OpenBot/provider-runtimes/codex/.../0.166.0` and put the `Probe` workspace under the mini's `~/OpenBot/Agents`. Not checked whether Hive downloaded that runtime or upstream already had it. Nothing was read or changed there by agents. Rebuild Hive on the mini after the phase merges, then confirm Codex runs from `Hive/provider-runtimes`.
- `bun run dev` on the mini: the Electron window never opens and CDP does not answer (seen by Phase 0 and the mini checks). Cause unknown. Visual checks use Storybook until it is found.
- Mini prompts round 2 (cua-spacesd controlling Google Chrome, dev Safe Storage keychain, one more): Hridya answered all on 2026-11-03. The dev window now opens on the mini (a Phase 1 child had it running with seeded agents).
- Shared check lock (`~/.hive-locks/one.sh`) now has two slots, and token measures and tool-choice evals bypass it (network-bound).

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

## Mini checks (2026-11-03, branch `checks/mini`)

Machine: Mac mini. Build under test: signed-in packaged Hive (tag `hive-phase0`, 0.59.0). No code changed. No regression from the slop cut found.

### Task 0.4: GUI baseline (done)

Hive was signed in with Codex connected (ChatGPT account, GPT-6-Luna, Medium). Onboarding did not show. "Help make OpenBot better" was not touched. Agent `Probe` created with default settings.

The mini's input tools do not reach the Hive window (`mcp__cua__computer_*` and the Space driver have no Accessibility). The `cua-driver` CLI in `space_bash` does. Recipe: `cua-driver call run_script` with `cua.getApp({pid, windowId})`, `app.setValue`, `app.click`, `app.pressKey`. `set_value` fills a plain field. The composer needs real key presses (`pressKey("h")`), or the Send button stays disabled.

Create agent also sends a first message, "Greet me briefly.", so Probe has two measured sessions:

| Session | First message | Uncached input | Cached input | Output |
| --- | --- | --- | --- | --- |
| `9cda8e3e` (rollout `rollout-2026-11-03T16-24-43-01a1a23a-...jsonl`) | `Greet me briefly.` (auto) | 49022 | 0 | 7 |
| `02123b09` (rollout `rollout-2026-11-03T16-26-25-01a1a23b-...jsonl`) | `hi` (new thread) | 26750 | 0 | 14 |

Both read from `agent_usage_records` in `~/Library/Application Support/Hive/openbot.db` with `tools/token-baseline/q.py` (read-only). Both answered ("Hi there!" and "Hi! What would you like to work on?").

Surprise: the two first requests differ by 22272 tokens. The only difference in `breakdown.py` is `tools ns:mcp__computer_use (58 fns)`, 26443 tok (tiktoken), present in session 1 and absent in session 2 (`grep -c computer_use` on the rollouts: 3 and 0). The Codex app-server restarted between them (pid 50531 to 55443). Cause not found. Use session 1 as the cold-start number, 26750 as the number without computer-use tools.

Component table, session 1 (tiktoken count of each part of the first request):

| Tokens | Part |
| --- | --- |
| 3635 | Codex `base_instructions` (session meta) |
| 7068 | tools `functions` (4) |
| 112 | tools `clock` (1) |
| 1199 | tools `collaboration` (6) |
| 26443 | tools `mcp__computer_use` (58) |
| 650 | tools `image_gen` (1) |
| 2959 | tools `openbot` (15) |
| 3168 | `dynamic_tools` in session meta (duplicate of `openbot` tools) |
| 3456 | developer message: "You are Codex..." |
| 11262 | developer message: "You are a persistent local OpenBot teammate..." |
| 530 | developer message: `multi_agent_role` |
| 52 | developer message: `multi_agent_mode` |
| 1217 | user message: `# AGENTS.md instructions` |
| 5 | user message: `Greet me briefly.` |

Session 2 has the same rows except `mcp__computer_use` is absent, the OpenBot teammate message is 11190 tok, and the user message is 1 tok.

Surprise: the `# AGENTS.md instructions` block (1217 tok) is in the request of a new agent. Not checked where Codex reads it from.

Surprise: the Hive process runs `codex app-server` from `~/Library/Application Support/OpenBot/provider-runtimes/codex/darwin-arm64/0.166.0/bin/codex`. That is the live OpenBot folder, not `Hive`. I did not read or write that folder. Phase 0 identity work may leave this path as it was.

Task 1.1 Step 1 (Probe idle, both sessions finished, 5 s after the last answer). Command: `ps -axo pid,ppid,rss,command | grep -i -E "codex|cua-driver" | grep -v grep`. It matched 9 processes, 359328 KB RSS in all. Of these, 5 belong to Hive (child of pid 50434), 245264 KB (about 239 MiB):

| pid | RSS KB | Process |
| --- | --- | --- |
| 50455 | 10096 | `cua-driver serve` (Hive's bundled) |
| 55443 | 134064 | `codex app-server --listen stdio://` |
| 55593 | 37520 | `node codex-security/.../mcp/server.mjs --stdio` |
| 58072 | 55552 | `node codex-security/.../mcp/server.mjs --stdio` (second copy) |
| 55594 | 8032 | `cua-driver mcp` (Hive's bundled, child of codex) |

The other 4 matches are not Hive's: `/Applications/CuaDriver.app ... serve` (89296 KB) and three `~/.local/bin/cua-driver mcp` (8256 KB each) from other sessions. Two copies of the `codex-security` MCP server run under one app-server.

### Browser e2e drivers (7 of 7 PASS)

Clone: `~/honey/hive-checks` on the mini, bundle of `personal` at `5ad6405ee`. `bun install --frozen-lockfile` ran clean. Each driver ran alone with `bun scripts/browser-<name>-e2e.ts` (`package.json` has scripts for 5; `fill-fields` and `user-control` have none). Each prints `{"status":"passed",...}` and the report records `sourceSha` `5ad6405ee`. Reports are at `~/honey/hive-checks/.openbot-build/browser-<name>-e2e/report.json`; copies and logs are in `~/honey/hive-checks-shots/e2e-personal/` on the mini.

| Driver | Result | Cases | Time |
| --- | --- | --- | --- |
| agent-session | PASS | 16 | 4 s |
| ambiguous-targets | PASS | 7 | 2 s |
| dialogs | PASS | 24 | 8 s |
| fill-fields | PASS | 41 | 75 s |
| sign-in | PASS | 23 | 5 s |
| steps | PASS | 25 | 60 s |
| user-control | PASS | 27 | 2 s |

No failure, so no run at `hive-phase0`. `browser-menu-cover-e2e.ts` and `browser-profile-agents-e2e.ts` do not use the shared runner and were not run.

### Chat timeline look (no regression seen; compaction row not exercised)

`bun run dev` from `~/honey/hive-checks` seeded its own profile (4 agents) and started the services, but the Electron window never opened: the main process was idle, `list_windows` showed only the hidden "OpenBot Local Host" window, and CDP on :9333 did not answer. A second try with `ELECTRON_EXTRA_LAUNCH_ARGS=--use-mock-keychain` did the same. I stopped it with `bun run dev:stop`. Cause not found. A keychain prompt and a "cua-spacesd ... Downloads" prompt were on the mini's screen; they are not in the set Hridya approved, so I did not answer them and cannot say if they were the cause.

Fallback: Storybook at `personal` (:6006) and at `hive-phase0` (:6007, worktree `~/honey/hive-checks-p0`), driven by `playwright-core` with Google Chrome headless.

- Surprise, existing failure: every `Conversation/Conversation` story fails to render at both `personal` and `hive-phase0` with `TypeError: Cannot read properties of undefined (reading 'filter')` from `createScrollStore.shownMessages` (`deps.props.messages` is undefined at first read). Same message at both commits, so it is not from the slop cut. Checked: `rich-conversation` at both; `unread-messages`, `long-history`, `several-people` at `personal` only. CI does not run stories.
- Used instead: the `App/Playground` story (the full renderer with the mock host) plus a scratch story with `conversationReads` (not committed, deleted).

| Check | Result |
| --- | --- |
| Day marker `Wed 19 Aug 10:42` on the first row | Correct at both commits |
| Grouped row `Messaged 2 agents`, Tasks row, file chips, reaction | Correct at both commits |
| Chief, Research and Sales chats: text of the timeline | Identical before and after (6 views) |
| Pixel diff before vs after (threshold 12): Chief, Research, Sales | 239, 0, 12 px; all in spinner areas |
| Unread divider `NEW` above the last message | Correct; 40 px diff, in a spinner area |
| Compaction row | Not exercised. A runtime snapshot with a compaction state showed no marker at either commit. Verified by reading the diff only: `CompactionMarker` moved unchanged into `VirtualRow` |
| Virtual scroll with long history | Not exercised: the mock chats fit the viewport (scrollHeight equals clientHeight) |

Screenshots on the mini, `~/honey/hive-checks-shots/tl/`: `after-playground.png`, `before-playground.png`, `after-unread.png`, `before-unread.png`, `{after,before}-{chief,research,sales}-{bottom,top}.png`, and the story error `after-rich-conversation.png` / `before-rich-conversation.png`. Copies of `after-playground.png`, `after-unread.png`, `before-unread.png` and both error screenshots are in the session scratchpad `.../scratchpad/shots/`.

### Left running or changed on the mini

- Hive (pid 50434) still runs. It now holds the agent `Probe` with two threads in `~/Library/Application Support/Hive`. Rename or delete it if you do not want it.
- Both Storybook servers and my dev stack are stopped. The scratch story files are deleted. The worktree `~/honey/hive-checks-p0` is kept.
- Helper scripts: `~/honey/hive-checks-shots/` (`hv.sh`, `js/`, `pw/`, `run-e2e.sh`).
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
## Phase 3 (2026-11-03, branch `phase/3`)

### Task 3.1: spikes (most blocked)
- Install: `brew install --cask copilot-cli` (a cask, not a formula) gave `/opt/homebrew/bin/copilot`, version 1.0.105. No `npm` install needed.
- Spike 5 (`gh` token, no `copilot login`): FAILED. Tool: a 30-line Node ACP client in the scratchpad, run with a scratch `COPILOT_HOME`.
  - With `gh` on PATH: `initialize` works (agent `Copilot` 1.0.105, `auth.logout` capability, `mcpCapabilities` `http` and `sse` true, `stdio` not listed). `session/new` fails: `-32603`, HTTP 403, `"unauthorized: not authorized to use this Copilot feature"`, category `permission_denied`.
  - With no `gh` on PATH: `session/new` fails: `-32000 "Authentication required"`.
  - So the CLI does send the `gh` token, and Copilot refuses it.
  - Cause: `gh api copilot_internal/user` for `hridaya423` returns `access_type_sku: "no_access"`, `chat_enabled: false`, `cli_enabled: false`, `copilot_plan: "individual"`, `can_signup_for_limited: true`. `gh api user` shows plan `null` (free). **The GitHub account `hridaya423` has no Copilot entitlement today.** (Only these fields were read. No token was printed or stored.)
- No browser-free path exists: any sign-in on `hridaya423` would still return 403. Spikes 1, 2, 3, 6 and 7 (and the OpenCode check) need a GitHub account that has Copilot. They are blocked (see "Blocked on Hridya").
- `copilot login --with-token` validates the token against GitHub (`Failed to fetch Copilot user info: 401`), so a dummy token cannot test where the keychain item is stored per `COPILOT_HOME`. Spike 7 is not answerable without a real login.
- Facts read from `copilot --help`, `copilot login --help`, `copilot help environment` (1.0.105):
  - There is no `copilot logout` command. ACP `initialize` advertises `auth.logout`.
  - `copilot login --device-code` and `--web-flow`; `--with-token`; `--host`. Supported tokens include "OAuth tokens from the GitHub CLI (gh) app". Env order `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`.
  - `COPILOT_HOME` moves the config folder. `COPILOT_AUTO_UPDATE=false` stops self-update. `--no-auto-update` flag exists.
  - `copilot help config` lists no switch for file storage of the login (searched `token|login|keychain|credential|auth|plaintext|secure`).
  - `COPILOT_PROVIDER_*` env vars give a bring-your-own-key mode (not used here).
- Spike 4 (keychain from a Workspace only process), proxy test: a throwaway login-keychain item (service `hive-spike4`, deleted after) read with `security find-generic-password` under a Seatbelt profile like OpenBot's (`allow default`, `deny file-write*`, workspace writable). READ worked with and without `mds.lock` writable (`mds.lock` does not exist on this Mac). WRITE failed: `SecKeychainItemCreateFromContent: UNIX[Operation not permitted]`. Not proven with the real `copilot` binary, because no `copilot-cli` item can be made without a real login. Meaning: `copilot login` must run outside the sandbox (OpenBot's sign-in does). A confined agent can probably read an existing login, but cannot refresh it by writing.

### Task 3.2: done against the fake (no real Copilot session was possible)
- Step 1 (fail first): added a `copilot` `DriverCase` and fake mode `FAKE_MODEL_UNAPPLIED` (new session reports the first model as current, runs on none until set) and `FAKE_DEVICE_CODE` (prints Copilot's real `login --device-code` text) in `scripts/provider-conformance-e2e.ts` and `scripts/provider-fakes/agents/conformance.ts`. `bun scripts/provider-conformance-e2e.ts` FAILED: the provider list did not match `AGENT_PROVIDERS`.
- Steps 2, 4: `"copilot"` in `AGENT_PROVIDERS` (`pickerOrder: 14`, `concurrentTurns: false`, `reportsUsage: false`, `steer: "deferred"`, `homeSkills: "native"`, skill folders `.github/skills`, `.claude/skills`, `.agents/skills`, instruction file `AGENTS.md`; the last three were confirmed with `copilot skill --help` and `copilot instruction list` on a scratch folder), `LOCAL_ONLY_PROVIDERS`, `AgentAuthState` arm, `copilot-install` link (closed table in `app-handlers.ts` and `app-inputs.ts`), `resolveCopilotCli` (minimum 1.0.105, the one version run here), driver row (`login --web-flow`, code sign-in `login --device-code`), `copilotStatePaths`, project settings `.github/copilot`, `.github/hooks`, `.github/mcp.json`, `.mcp.json` in `PROJECT_SETTINGS`, `SPAWN_ENVIRONMENT_PROVIDERS`, missing-session list, English strings.
- `cli-code-login.ts`: Copilot's line has no colon (`... and enter code ABCD-1234`). The old regex needed one. Added a second pattern. Fail-then-pass proven: with the old regex the conformance e2e fails with "Provider login timed out."; with the new one it passes.
- Step 3 NOT done, on purpose: `alwaysSetModel` is not needed. R-copilot cited `acp-configuration.ts:351`, but that line is the legacy `session/set_model` branch (no config option). With a `model` config option, `applyConfig` sends `session/set_config_option` every time (unless `processWideModel`). The fake that reports a model as current without applying it passes, and the e2e asserts a `set` for the model was sent. Not run against the real CLI.
- Step 5: `bun scripts/provider-conformance-e2e.ts` passes, 9 drivers including `copilot` (`.openbot-build/provider-conformance-e2e/report.json`). `typecheck:node`, `typecheck:contracts`, `typecheck:renderer` exit 0. `biome check --write` on 19 changed files: clean. `bun scripts/i18n-check.ts`: no failure (English keys only; other locales report as untranslated).
- Team API: protocols below 8 hide Copilot with no change (rule in `provider-visibility.ts`). Added `copilot` to the expected hidden lists in `scripts/team-api-routes-e2e.ts` (not run: needs a long run; see "Not verified").
- Not done: `scripts/provider-cli-canary.ts` (canary covers managed providers only; Copilot is not managed, like Hermes).
- Step 6 looked at with Storybook on the mini, not the app: clone `~/honey/openbot-phase3` on the mini, Storybook on port 6016, headless Chrome screenshots (the shared screen was not used). Existing args-based `ProviderModelPicker` stories throw "Cannot read properties of undefined (reading 'find')" on the mini, also the unchanged `Pill` story (modelOptions undefined). Not investigated; I rendered a temporary story with explicit props instead (not committed). Screenshots: `/private/tmp/claude-501/-Users-hridyaagrawal--t3-worktrees-openbot-t3-dc5ab69b/fcd98ee9-4dd2-4c27-b9b6-802b56f22e86/scratchpad/shots/copilot-model-open.png` (Copilot rail icon, name, version, search, models, effort) and `copilot-setup-rows.png` (Copilot row with logo and "Not installed"). The model names in them are fixture text, not real Copilot models. The full provider settings page was not looked at.

### Task 3.3: skipped. Spike 7 did not pass (not answerable without a Copilot login). One Copilot account for now.

### Task 3.4: no limit regex
- Spike 6 is blocked, so there is no observed text of a spent allowance or a 429. No regex was added and no text was invented. The `copilot help limits` text covers only the opt-in session cap `--max-ai-credits` (for example "Session limits: 0.5/1 AI credits used."). OpenBot sets no such cap, so it is not an account limit.
- Until real text exists, the generic failover causes (`rate_limit`, `billing`) apply when a turn did no work. Observed errors for a refused account: `-32603` HTTP 403 `unauthorized: not authorized to use this Copilot feature`, `-32000 Authentication required`.
- Added the "GitHub Copilot" section to `docs/provider-terms.md`.

## Blocked on Hridya (Phase 3)
- `hridaya423` has no Copilot access (`access_type_sku: "no_access"`, `cli_enabled: false`). Say which GitHub account has Copilot Pro (GitHub Education may need activating at github.com/settings/copilot). Then run `copilot login`, and the spikes 1, 2, 3, 4 (real CLI), 6, 7 can run.
- After login, check `security find-generic-password -s copilot-cli` shows an item, then run a Workspace only agent on Copilot. If it says "Authentication required" or the CLI fails to write `~/.copilot/config.json`, change `copilotStatePaths` (`config.json` is protected now, an unverified guess).

### Phase 3 review (2026-11-03)
- Reviewed `git diff d1e92e4d7..HEAD` myself in the thermo-nuclear style (no sub-agents). Fixed: removed explanation comments that restate code, unexported `parseCopilotVersion`. Kept, as judgement: `resolveCopilotCli` copies the shape of `resolveKimiCli` (one more copy of a loop; a shared helper would also change Kimi and Hermes, out of scope).
- Final state: conformance e2e passes (9 drivers), `typecheck:node`, `:contracts`, `:renderer` exit 0, the pre-commit hook ran every `typecheck:*` project.
- The `docs/provider-terms.md` change landed in the `feat: github copilot provider` commit, not in a separate Task 3.4 commit (a `git add -A` staged it). No Task 3.3 commit (skipped).
- Not verified: `bun scripts/team-api-routes-e2e.ts` (edited expected lists only); Workspace only Copilot with the real CLI; Team API peers; a real turn, the model picker with real models, and the full provider settings page.
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
- **Surprise (upstream leak in a hand-started Worker):** `apps/auth-api/wrangler.jsonc` top-level `vars` named `signal1.openbot.run` and `signal2.openbot.run` for `REMOTE_SIGNAL_HOMES` and `REMOTE_AUTH_WEBHOOK_URLS`. `bun run dev` already blanks both (`scripts/dev-services.ts:664-666`). My hand-started Worker did not, so it queued revocation events for the upstream hosts (4 rows in `remote_auth_events`, `pending_targets` listed them; they held random host and user UUIDs, signed with a throwaway key). I deleted the rows from the throwaway database. Task 5.4 blanks the values in `wrangler.jsonc` itself, and the ops wrapper sets them to empty by env.
- **Unknown 1, 24 h uptime: RUNNING.** Worker (second start) began `2026-11-03T16:31:17Z`, Signal `2026-11-03T16:32:27Z` (restarted for the outbox test). Check any time after `2026-11-04T16:35Z` with `sh ~/honey/hive-p5-ops/uptime-check.sh` on the mini (prints elapsed time, pids, RSS, health). Baseline at 16:47Z: workerd RSS 183 MB, Signal 55 MB, both health 200. launchd has `KeepAlive`, so a crash shows as a changed pid or a short `etime`.
- **Dev ports note:** Vite dev blocks unknown Host headers. The Worker needs `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=hridyas-mini.tail59dec9.ts.net` (set in `worker.sh`). Task 5.5 keeps it.
- Spike launchd labels use `dev.hridaya.hive.spike.*`. Task 5.5 replaces them with `dev.hridaya.hive.control-plane.*`. Undo for the spike: `launchctl bootout gui/$(id -u)/dev.hridaya.hive.spike.worker` (and `.signal`), delete the two plists, `tailscale serve --https=8446 off`, `tailscale serve --https=8447 off`.

### Tasks 5.2 and 5.3: done (commit `e1f21aa94`)
- **Worker:** `POST /v1/auth/owner` (`apps/auth-api/src/routes/v1/auth/owner.ts`, `server/owner-sign-in.ts`, `AuthService.signInOwner`). It signs in `OWNER_EMAIL` when `Tailscale-User-Login` equals `OWNER_TAILNET_LOGIN` (case-insensitive). Anything else is 403. It reuses the email challenge and session code, with no email and no resend wait. New bindings `OWNER_EMAIL` and `OWNER_TAILNET_LOGIN` are in `types.ts` and `runtime-env.ts`. I did not edit `request-auth.ts` or any billing, hosted or marketplace file, so the merge with Phase 2 touches only `auth-service.ts` (one inserted method), `types.ts` and `runtime-env.ts` (one added line pair each) and `routeTree.gen.ts`. **Merge note for the lead:** `routeTree.gen.ts` is generated. After Phase 2 removes routes, regenerate it (start `vite dev` in `apps/auth-api`, it rewrites the file) instead of merging by hand. My change is 21 added lines for `/v1/auth/owner`.
- **Desktop (`src/main/central-auth-manager.ts`):** option `ownerSignIn` (the app passes `true`). With no stored session it checks `/health/live`, then calls `/v1/auth/owner`. A 4xx leaves the person signed out. A 401 from `/v1/me` clears the session and signs the owner in again. The session file keeps the user (`user` field, version stays 2, old files still read). With a stored user and a service that does not answer, the start finishes as `signed_in` after `offlineStartWindowMs` (4 s). A session file with no stored user keeps the retry screen. Startup does not rewrite an existing file: `central-auth-session-file-e2e` expects that. The renderer needs no change: the manager goes from `loading` to `signed_in`, so the gate never shows the login screen. I did not touch `AppView.tsx` or `account-context.tsx`.
- **Evidence (MacBook, through the lock):** `vitest apps/auth-api/test/owner-sign-in.test.ts`: 4 passed. Mutation check: with the header comparison replaced by `true`, 1 of 4 tests fails (so the test can fail). I wrote the implementation before the test, so I proved the test with that mutation instead of a red run first. `scripts/central-auth-owner-start-e2e.ts` (new): PASS, 6 checks (owner sign-in with no email request, offline start in under 3 s, revoked session signs in again, refused owner stays signed out, old session file keeps the retry screen, option off makes no owner request). `central-auth-startup-stall-e2e` PASS, `central-auth-session-file-e2e` PASS. `typecheck:contracts`, `typecheck:node`, `typecheck:api`, `typecheck:team-client`, `typecheck:renderer` exit 0. The commit hook ran the other `typecheck:*` projects, including mobile: pass.
- **Evidence (live, mini):** a Bun script with the real manager (`ownerSignIn: true`) against `https://hridyas-mini.tail59dec9.ts.net:8446`, no session file: `signed_in` as the owner, 7 hosts visible; second start `signed_in`; start against an unreachable service `signed_in`. From the mini's loopback: no header 403, wrong login 403. `/v1/auth/email/start` answers 503 (`email_delivery_not_configured`), so the owner is the only way in.
- **Not tested:** the phone's `Tailscale-User-Login` header (the phone was offline). The check for Phase 7 is `curl -sI` through `serve` from the phone, or a header echo.
- The e2e is not in `package.json` (a root `package.json` change makes the hook run every typecheck). Run it with `bun scripts/central-auth-owner-start-e2e.ts`.

### Task 5.4: done (commit `d2d993917`, ports moved in a later commit)
- `fork.config.json` at the repo root holds the app identity (`dev.hridaya.hive`, `Hive`, URL scheme), the account URL `https://hridyas-mini.tail59dec9.ts.net:8446`, the Signal URL `wss://hridyas-mini.tail59dec9.ts.net:8447/v1/signal` and the three local ports. `packages/contracts/src/fork-config.ts` imports it (bundlers read it at build time). `APP_URL_SCHEME` and `OPENBOT_CONTROL_PLANE_ORIGIN` come from it; the account origin has a port, and invite links accept it through the existing `selfHostedApiOrigin` path. `src/main/control-plane-urls.ts` gives a packaged build the two URLs when the environment sets none; a dev build keeps its local services. `application-services.ts`, `index.ts` and `session-configuration.ts` use it. `electron-builder.yml` cannot read JSON, so `appId`, `productName` and the scheme are repeated there: change both together. `wrangler.jsonc` top-level `REMOTE_SIGNAL_URL`, `REMOTE_AUTH_WEBHOOK_URL` are empty (the runner sets them by env), `REMOTE_SIGNAL_HOMES` and `REMOTE_AUTH_WEBHOOK_URLS` are empty, `SIGNAL_ENTRY_ZONE_ID` is empty (it was nightly-labs' zone). I left the CSP host list (`*.openbot.run`, `analytics.openbot.run`) and `remote/.env.example` alone: Task 2.1 and 2.8 own them.
- **`git grep openbot.run` is not zero yet.** Remaining files that matter for network traffic, owned by Phase 2: `content-security-policy.ts` (2), `renderer/analytics.ts`, `src/main/analytics.ts`, `github-bot-tokens.ts`, `mcp-oauth-provider.ts` and `mcp-oauth-proxy.ts` (client name and logo URLs), `app-handlers.ts` (link targets), marketplace and plugin link files, `apps/auth-api/wrangler.jsonc` (15: routes, email sender names, the `test` and `preview` env blocks). Link-only constants that do not connect: `OPENBOT_INVITE_ORIGIN`, `team-client/remote-directory.ts` (3).

### Task 5.5: done on the mini, reboot check pending (commits `5ea3ef7ff`, then the port and installer fix)
- `ops/mini/`: `control-plane.sh` (`worker`, `signal`, `tick`, `config <expr>`), three launch agents (`dev.hridaya.hive.control-plane.{worker,signal,tick}`), `install.sh`, `make-secrets.ts`, `README.md`. The tick agent is a third plist, not in the plan: the local Worker does not run its crons (spike), so one job calls `/cdn-cgi/handler/scheduled` each minute.
- Data lives in `~/Library/Application Support/Hive Control Plane` on the mini (`secrets.env`, `owner.env`, `wrangler-state/`); `apps/auth-api/.wrangler/state` is a link to it. Logs in `~/Library/Logs/Hive Control Plane/`. Secrets are backed up in envsync as `HIVE_CP_REMOTE_TICKET_PRIVATE_JWK`, `_PUBLIC_JWKS`, `_REMOTE_AUTH_WEBHOOK_SECRET`, `_SKILLS_ADMIN_TOKEN`, `_SITE_REPORT_HASH_SECRET`, `_REMOTE_SESSION_SECRET`, `_TURN_SHARED_SECRET` (checked: the stored private JWK parses and has `d`).
- Installed from the clone `~/honey/hive-phase-5` (branch `phase/5`). The spike agents `dev.hridaya.hive.spike.*` and their plists are removed (so the 24 h clock restarted: see below). `tailscale serve` 8446 and 8447 stay.
- **Problems met and fixed (evidence for the lead):** (1) `launchctl bootout` returns before the job is gone, so `bootstrap` right after it failed with `Input/output error` and the first re-install left the Worker and Signal down for about 40 s; the installer now waits until `launchctl print` fails. (2) Other agents run dev stacks on this mini that take the first free port from 3100 up (`scripts/dev-services.ts`, seen in `ps`), and one briefly held 3101. The control plane now uses 3180 to 3182.
- Outbound check: the Worker (vite, workerd) and Signal processes hold only loopback connections (`lsof -iTCP -sTCP:ESTABLISHED`, 2026-11-03T17:04Z).
- **Reboot check NOT done.** Rebooting the mini would quit the signed-in Hive.app, which the wave rules forbid. What I did instead: `launchctl bootout` and `bootstrap` of all three jobs (they come back by `RunAtLoad`), and `KeepAlive` restarts the Worker after a crash (seen: it restarted by itself while the old process still held the port). The lead or Hridya runs the real reboot check when a reboot is acceptable: reboot, wait 2 minutes, then `sh ~/honey/hive-p5-ops/uptime-check.sh` and `curl https://hridyas-mini.tail59dec9.ts.net:8446/health/live`.
- **24 h uptime test:** the control plane (final labels) was last installed at the time in `~/honey/hive-p5-ops/control-plane-install-start.txt` on the mini. Read it with `sh ~/honey/hive-p5-ops/uptime-check.sh` after 24 hours: it prints elapsed time, pids, RSS, tick runs and health. A changed pid or a short `etime` means a restart.

### Task 5.6: PENDING (needs Phase 2 merged)
Run the Phase 5 and Phase 2 external checks (15 minutes of `lsof` on a packaged Hive, plus `git grep -n "openbot\.run\|nightly-labs"`), rewrite `PRIVACY.md`, run `bun run test:invite-acceptance` and the other Worker e2e scripts that Task 2.4 postponed (they need Phase 2's code, not mine). Also check that `routeTree.gen.ts` regenerates cleanly after the merge, and run the cross-machine WebRTC check again with the packaged app (Phase 6.2).
