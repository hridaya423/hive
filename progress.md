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


## Phase 1 (branch `phase/1`, 2026-11-03)

### Headless measurement path (replaces the plan's GUI path for now)
The Task 0.4 GUI path on the mini needs a sign-in. `tools/token-baseline/measure.ts` replaces it. It starts the real backend `AgentService` (as `scripts/codex-usage-metering-e2e.ts` does) with the real Codex CLI 0.166.0 (`/opt/homebrew/bin/codex`), a fresh temp profile, and agent `Probe`. It sends `hi`, waits for the turn, and reads `agent_usage_records` from the temp `openbot.db`. It runs `breakdown.py` on the rollout and writes `.openbot-build/token-baseline/<label>-<time>.json`. Options: `--agents N`, `--gap-ms`, `--turns T`, `--computer-use on|off`, `--access`, `--add-skill-before-turn T`, `--no-breakdown`, `--keep`.
- Codex home: the harness copies `config.toml`, `AGENTS.md`, `rules/`, `skills/` and `auth.json` from `~/.codex` into a temp `CODEX_HOME`. `~/.codex` is read only. The access token in `auth.json` had 238 h left, so no refresh ran (a refresh in the copy could rotate the token of the original). Real `HOME` is kept, so `~/.agents/skills` (92 skills) and `~/AGENTS.md` load as in the app. The agent workspace is under `~/.hive-measure-*` (deleted at the end).
- The harness starts `cua-driver serve` (cua-driver 0.38.0, `~/.local/bin`, 62 tools; R-tokens saw 58) and passes its MCP entry as `computerUseMcpServer`, because the Electron main process does that in the app. Without it the first request is 27.9K, not 54K.
- Metric: the first request of turn 1, `uncached + cached`. The prompt cache moves tokens between the two (run 3 below: 14,320 + 39,552). The cold `uncached` figure is the plan's number. The sum does not move.
- Not measured: the GUI path, the real Hive app, the crew agents. The Phase 1 external check reads the same `agent_usage_records` table.

### Baseline (headless), code at tag `hive-phase0` (worktree `../hive-baseline`)
Real Codex, model `gpt-6-luna`, default agent (Computer Use on, as upstream), 3 runs, `--turns 2`:

| Run | Turn 1 uncached | Turn 1 cached | Turn 1 total | Turn 2 total |
|---|---:|---:|---:|---:|
| 1 | 53,877 | 0 | 53,877 | 59,562 (skill catalog sent again, +5,659 o200k, see 1.4) |
| 2 | 53,877 | 0 | 53,877 | 53,902 |
| 3 | 14,320 | 39,552 | 53,872 | 53,889 |

Spread of the total: 5 tokens. In the band 50K to 62K of R-tokens M1 (55,217 to 61,370). Not far off, so no further search for a cause. Components (o200k, run 1): `mcp__computer_use` 62 tools 30,156; `functions` 7,070; OpenBot developer text with skills block 11,516; Codex base 3,635 + developer 3,456; `openbot` tools 2,959 (plus 3,168 dynamic copy in `session_meta`); `~/AGENTS.md` 2,083; `collaboration` 1,199 + role/mode 582; `image_gen` 650.
Two agents 30 s apart: agent 2 got 0 cached tokens (53,965 uncached); in the 5-agent run, agent 2 got 39,552 cached and agents 1, 3, 4, 5 got 0. The cache hit across agents is not reliable (relevant to 1.5).

### Task 1.1: process per agent (done, finding)
Measured with the harness, 5 idle agents, default account, Phase 0 code (`base-n5`): 1 `codex app-server` (RSS 258,528 KB), 5 `cua-driver mcp` (one per agent, 106,416 KB, about 21 MB each), 1 `cua-driver serve` (39,264 KB), 1 Codex Computer Use client from the user's `notify` hook (12,992 KB). With Computer Use off (current code, `t11-full`): 1 app-server (215,760 KB) and no `cua-driver mcp`. With `--access workspace` (`t11-workspace`): still 1 app-server (212,736 KB).
- The code agrees. `#ownProcessFor` (`provider-runtime.ts:2364-2379`) returns an own process only for a `confined-process` provider or an agent with `providerAccountId`. Codex has `workspaceEnforcement: "command-sandbox"` (`agent-providers.ts:219`), so Workspace-only access does not add a process. The shared app-server serves all default-account agents.
- R-tokens saw 39 Codex processes for 5 agents with `"account":true` in `providers.log`. That fits agents that each name a provider account: one app-server per account agent (about 720 MB each in R-tokens M5). So the 3.6 GB is per-account app-servers, not MCP children. I did not read the live app's data to confirm that the crew agents carry account ids (forbidden folder). Phase 4 (more accounts) will add app-servers: check `providerAccountId` on the crew before it.
- Task 1.2 removes the per-agent `cua-driver mcp` child: about 21 MB per agent.

### Task 1.2: Computer Use off by default and filtered (done)
- Changes: `agentComputerUseEnabled` is `computerUse === true`; new agents and absent stored values are off (`agent-store.ts`: new agent, `normalizeStoredAgent`, corrupt-value reset); `COMPUTER_USE_CORE_TOOLS` (28 tools) lives in `packages/contracts/src/ipc-mcp-servers.ts` (the plan names `cua-driver-runtime.ts`, but `src/backend` cannot import `src/main`); `codexMcpServers` emits `enabled_tools` for the Computer Use server; the off text in `developer-instructions.ts` says "Computer Use is off for you". Existing agents with an explicit `computerUse: true` stay on. Legacy `agents.json` migration still writes `true` (preserves what upstream agents had). This differs from upstream's comment "absent means on".
- Core list: the plan said "27 core minus 11 browser tools". The driver has no flag for a core set, so I chose 28 from the driver's own guide: app/window reads, input, clipboard, screen, `run_steps`, `run_script`, `start_session`/`end_session`, `get_guide`, `check_permissions`. Left out: 11 browser tools, `kill_app`, cursor styling, recording, sessions extras, config, health, update, extension, `parse_visual_regions`.
- Spike (key works): `enabled_tools` through `thread/start` config is honored by Codex 0.166.0. `scripts/computer-use-tools-e2e.ts` (new, fake model, fake driver with 62 tools) passes: 28 tools offered. The plan's spike with `codex exec -c` showed no MCP tools at all (exec does not wait for MCP start), so the key was proven through the app-server path instead. Red step: the first run failed on `agentComputerUseEnabled({})` (true) before the change.
- Measured, first request total (`uncached + cached`), real Codex: baseline (on, 62 tools) 53,877; on with the 28-tool list 43,282 (-10,595); off, the new default 27,802 (-26,075). Turn 2 stays +25 to +176 over turn 1.
- `bun run check:agent-context`: instruction bytes went down (claude 14,283 to 13,560, codex 14,182 to 13,459, because the Computer Use paragraph is absent for the fixture agent); `tools/agent-context/budget.json` lowered by `--write`.
- Other e2e scripts that touch Computer Use or `codexMcpServers` pass: `agent-mcp-tools`, `agent-update-agents`, `mcp-oauth`, `mcp-server-unreadable-row`, `mcp-tool-consent`, `codex-hung-app-server`. Not run: `channel-tools-e2e` (needs a dev app) and `team-api-routes-e2e` (runs under Electron).

### Task 1.3: features that duplicate OpenBot (done, small win)
Spiked each key with the real model through the harness (env hook, removed) and with `scripts/codex-prompt-trim-e2e.ts` (fake model, no tokens):
- `features.multi_agent=false`: removes the `multi_agent_v1` tool for models that use it (-9,900 bytes in the e2e). No effect on GPT-6 (`collaboration` tools stay, they come from `multi_agent_version: "v2"` in the model catalog). Kept (one line, proven).
- `include_collaboration_mode_instructions=false`: -1,056 characters in the developer text (GPT-6, about 200 tokens). Kept.
- No effect, dropped: `features.multi_agent_v2`, `features.multi_agent_v2.enabled`, `include_apps_instructions`, `features.multi_agent_mode`, `features.collaboration_modes`, `features.multi_agent_v2_dynamic_tools`, `features.agent_message_board`, `features.send_async_message`.
- `include_permissions_instructions` not tried: `codex-prompt-trim-e2e.ts` documents that the permission text makes the model ask before destructive commands in Ask first mode.
- Result: 27,802 to 27,604 (-198 tokens, 0.7%). The plan expected 1.5K to 3.7K; that is not reachable on Codex 0.166.0 with GPT-6 (the collaboration tools and role messages, about 1,800 tokens, cannot be switched off by config).

### Task 1.4: skills (partly done)
- Turn-2 re-send, cause found: it is Codex, not OpenBot. Codex sends the whole skill catalog again at the first turn after a skill file changed (22,218 characters, +5,659 o200k, about 5.6K API tokens here). The harness reproduces it by adding a skill to the Codex home between turns (`t14-add`: turn 2 total 33,200 against 27,600) and in baseline run 1 (the first run created `.system` skills in the new home). In the live app any edit under `~/.agents/skills` (other agents edit it often) triggers it.
- Fix without a setting: `features.skill_catalog_deltas=true`. Turn 2 total 27,613 (+23) with the same added skill. The new skill is recorded in a `world_state` item as `shown: false`, so the model does not see a skill added mid-thread until a new thread. `scripts/codex-prompt-trim-e2e.ts` now asserts it: skill catalogs in the turn-2 request, before 2, after 1 (waits for the `skills/changed` notification, not for time).
- Per-agent allowlist: not built. Findings: thread-level `skills.config` (per-skill `enabled=false`, by path, by folder or by name) has no effect through `thread/start` config. The levers that work are all-or-capped: `skills.include_instructions=false` (first request -5,578: 27,604 to 22,026; drops workspace skills from the catalog too) and `skills.max_context_tokens=2000` (-2,898; unknown which entries it cuts); `features.omit_skill_descriptions=true` -3,453 (names only). "Workspace-only" as the plan describes needs OpenBot to list workspace skills itself (the `homeSkills: "instructions"` path) plus a per-agent field in `AgentSummary` and its UI, i18n, preview mock and the Team API mirrors. I did not build it: the Phase 1 target (<= 30,000) is met without it. If wanted, the cheapest honest form is `skills: { mode: "all" | "none" }` with `skills.include_instructions=false`, -5.6K per request.

### Task 1.5: cache-friendly order for Codex (measured, not built)
Question: would moving per-agent text (profile, workdir, memories) into the first user turn raise cross-session cache reuse? Measured with the harness, Computer Use off, first request about 27.6K tokens:
- 3 agents started 10 s apart, 3 runs (`t15-gap10`): every agent after the first read 13,568 cached tokens, always the same number. 14,0xx to 14,1xx uncached.
- A new task thread of the same agent, seconds after the chat turn (`t16-task`, 3 runs, plus `kp4`): 13,568 cached, 14,1xx to 14,2xx uncached.
- Rollout diff (`kp3`, two agents; `kp4`, chat against task of one agent): the tools, Codex base text, Codex developer text and the first 11,977 characters of the OpenBot developer text (to `<agent_profile>`) are byte-identical. That is about 22K tokens by my estimate. For one agent's chat and task, the text is identical to character 12,906 and the `AGENTS.md` user message is identical.
- Same-session turn 2 reads 27,392 of 27.6K cached. So the API reuses a full prefix inside one session but only 13,568 tokens across sessions, even when about 22K tokens match.
Conclusion: the cross-session limit is on the API side, not in the order of OpenBot's text. Moving per-agent text would not raise the 13,568 figure. It would also need delivered-state tracking, resume and compaction handling, and history filtering for Codex. Not built. The numbers stay in `.openbot-build/token-baseline/t15-*`, `t16-*`, `kp3`, `kp4`. Not measured: a longer gap than 90 s, and whether plan limits count cached reads.

### Task 1.6: routine runs reuse the cache (measured, no change)
`startRoutineThread` starts a new thread, like a task. A new thread of the same agent 10 to 90 s after the chat turn reads 13,568 cached tokens of 27.7K (`t16-task`). Routines run minutes to hours apart, and a cold start reads less. No session-reuse feature added, as the plan says. I did not run the crew's Launch Manager (no crew in the harness). The first-request size of a routine run is the same 27.6K as a chat, so Tasks 1.2 to 1.4 cut its cold cost from 53.9K to 27.6K.

### Task 1.7: IPC chatter (done by a child, merged; synthetic counts)
No `trace.ndjson`: the app is not signed in. Counts come from `scripts/renderer-ipc-calls-e2e.ts` (`bun run perf:renderer-ipc`, virtual clock, real code, synthetic event sequences) and static call-site reading. Before to after: `servers:set-typing` 151 to 17 (150 keystrokes over 30 s, 2 s gap, final `false` sent, up to 2 s late); `dynamic-island:publish-presentation` 243 to 3 (events that do not change the island) and 201 to 19 (streaming at 50 ms); `agent:get-usage` 3 simultaneous calls to 1 (2 when the provider set changes). `agent:session-settings:read` left alone (5 calls per 67 minutes; sharing a read could return stale data). Known trade-offs from the review: a usage refresh with the same provider key joins an in-flight read that began before the trigger; the typing throttle has one slot for all agents (the server also has one typing slot, and forgets a mark after 5 s).

### Task 1.8: renderer start-up (done by a child, merged, kept)
Settings, onboarding and workflows were already lazy. The eager load is half language catalogs: `electron.vite.config.ts` now maps the 13 catalogs to the web build's `lazy-catalogs.ts`. Eager bytes 16.56 MB to 8.63 MB. Cold start on the Mac mini (same main bundle and profile, 4 base and 6 lazy runs): `startup.renderer.app-started` 425 to 319 ms (-25%), `startup.main.window-ready` 1256 to 1073 ms (-14.6%), `time.readyMs` 2158 to 1832 ms (-15.1%). Noise floor about 9% (the mini was loaded by other agents; `services-built`, unchanged code, moved -8.6%). Task 2.2 (delete 12 locales) makes this moot: drop or edit the alias then.
Root cause of the DevTools port problem on the mini: the Electron main thread blocks in `SecItemCopyMatching` (a keychain read) behind a macOS keychain prompt that nobody answers. The port listens but no task runs, so curl gets an empty reply (confirmed with `sample`; `--use-mock-keychain` makes `/json/version` answer 200). `dev:bench` also had a bug: Playwright connecting at port-ready never sees the window page. Both fixed in `scripts/dev-automation/bench*.ts`; `dev:bench` now runs on the mini with the bench account on the local dev API, no sign-in needed. Leftovers on the mini: `~/honey/p1-renderer-wt`, `~/honey/p1-renderer-after`. An unanswered "cua-spacesd wants access to control Google Chrome" prompt is on the mini's screen (probably caused by an `osascript` call of the child).

### Task 1.9: tool descriptions (done by a child, merged)
`scripts/tool-choice-eval.ts`: 30 prompts, real Codex 0.166.0, first tool called (`tool_search`/`tool_describe` skipped, `tool_call` counts as its named tool). Floor on original text: 78/90 runs (0.867), 27/30 prompts by majority. Final: 78/90 (0.867), 26/30 by majority; the one flipped prompt (#7 `create_section`) is 7/9 new against 4/9 original over 9 runs each (noise). Per-run noise is 1 to 2 runs per prompt.
Bytes before to after: `catalog.descriptions` 39,074 to 23,293 (-40%; the target was -50%), `catalog.schemas` 79,659 to 55,830 (-30%), `visible-tools` 13,917 to 11,103 (-20%). Also `advertised-json-schema.ts` no longer advertises `minLength`/`maxLength` (-9.7 KB; Zod still rejects). Reverted: catalog grouping by namespace (`create_webhook_routine` 8/9 to 5/9) and a shorter `request_api_key` (6/9; one sentence restored, 8/9). Half of `catalog.schemas` is out of reach without changing contracts (repeated `browserTargetSchema`, schedule structure). Not verified: argument quality, Claude's schema path, other providers. Account limit: the Codex plan hit its usage limit about 17:50 UTC during the eval; empty runs were discarded.

### Review of the Phase 1 diff (code-review, medium) and fixes
Fixed: the preview mock created new agents with `computerUse: true` (now false, matches the store); two memory rules the tool-description pass dropped ("never delete text for space", "memory tools change only your own memories") restored in `developer-instructions.ts`, instruction budgets raised by 73 bytes (13,373 claude, 13,272 codex; still below the original 14,283 and 14,182).
Not changed, on purpose: Computer Use default off (decision recorded in 1.2; stored explicit `true` stays); `enabled_tools` is Codex only (Claude and ACP read the MCP set themselves; their schema cost is unmeasured); `AgentSettingsPanel.tsx:306` form state `computerUse: true` is initial form state (not checked against a live agent); `progress.md` is committed because the wave rules require it.

## External check, Phase 1 (headless path)
First request of a fresh `Probe` session, real Codex, `agent_usage_records`: baseline 53,877 to 27,604 uncached+cached at the end of 1.4 (cold run 27,596; a cache-warm run shows 14,0xx uncached + 13,568 cached). Pass is <= 30,000, fail is > 40,000: pass. On the merged head (`final-head`, 2 runs, default agent): 27,158 and 27,152 total (14,102 + 13,056 cached; 14,076 + 13,056), turn 2 +24 to +26. The 1.9 description cuts took about 450 tokens off the first request (27,604 to 27,155). Cold uncached equals the total. Pass (<= 30,000). Not measured: the real Hive app, an agent with Computer Use on at the head (28 tools, about +15.5K).

### Done / remaining
Done: 1.1 to 1.9 (1.5 and 1.6 measured and not built; 1.4 partly). Remaining for the lead: merge into `personal`; decide the per-agent skills mode; GUI check of the packaged app on the mini after Phase 2.
