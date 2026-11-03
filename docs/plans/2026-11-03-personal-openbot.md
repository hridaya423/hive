# Personal OpenBot Fork Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement task-by-task. Read `handoff` (receive direction) first if you were given this plan as a handoff.

**Goal:** Turn upstream OpenBot into a private, single-user app for Hridya that has no OpenBot account, no paid or commercial code, no Dynamic Island, a first-class GitHub Copilot provider, a Mac mini that runs routines while the MacBook sleeps, and about half the per-turn token cost.

**Architecture:** Keep upstream's architecture and wire protocols. Change behaviour by deletion and by configuration first, and by new code only where no setting exists. The account service is not rewritten. It moves onto the Mac mini behind Tailscale and signs its one owner in without email (Phase 5), so the trust protocol between hosts, clients and the phone stays as upstream tested it. The fork installs side by side with upstream under a new app id, so the live upstream install and its `openbot.db` are never touched.

**Tech Stack:** Electron 3x + electron-vite, Solid (renderer), Effect 4.0.0, Bun 1.4.2 workspaces, SQLite (`openbot.db`), Cloudflare Worker code (`apps/auth-api`, run locally), Signal (`remote/api`), Expo SDK 58 / React Native 0.88 (`apps/mobile`), Codex app-server and ACP CLIs as providers.

---

## Read this first

**Repository.** `/Users/hridyaagrawal/honey/openbot`, cloned from `github.com/nightly-labs/openbot` at `de784cee2` (2026-11-03). Remote `upstream` points at nightly-labs. There is no `origin` yet. Do not create a GitHub repo or push anywhere unless Hridya asks.

**Rules that override defaults.**
- The repo's `AGENTS.md` is binding. Its "Non-negotiable" list holds, with one fork exception noted per task: Team API protocols may change only when the host and the phone change together, because this fork has no other clients.
- Keep `LICENSE` and `NOTICE`. PolyForm Noncommercial requires the notices. Personal noncommercial use is permitted.
- Migrations are irreversible and upstream makes no backup. Never point a development build at `~/Library/Application Support/OpenBot`. Phase 0 gives the fork its own data folder before anything else runs.
- Hridya's global rules (`~/AGENTS.md`): no code comments except the allowed kinds, smallest diff that works, no AI-shaped code, evidence before claims, keep `progress.md` current, prose in short plain sentences without em dashes.
- Repo test policy (`AGENTS.md`, "Tests" and "Checks"): end-to-end scripts are the default. Vitest only for migrations, the trust boundary, redaction and lint rules. Run one test worker. Do not run the broad checks (`bun run check`, `bun run typecheck`, `bun run test`) locally; run the narrow ones listed per task.
- Drive GUIs on the Mac mini, not on the MacBook screen. Hridya works on the MacBook.

**Research behind every decision.** Six reports in `docs/plans/research/`. Each has file:line evidence, the exact commands, and open questions. This plan cites them as `[R-accounts]`, `[R-commercial]`, `[R-copilot]`, `[R-multihost]`, `[R-tokens]`, `[R-mobile]`:

| Tag | File |
|---|---|
| R-accounts | `docs/plans/research/2026-11-03-accounts-cloud.md` |
| R-commercial | `docs/plans/research/2026-11-03-commercial-removal.md` |
| R-copilot | `docs/plans/research/2026-11-03-copilot-provider.md` |
| R-multihost | `docs/plans/research/2026-11-03-multi-host.md` |
| R-tokens | `docs/plans/research/2026-11-03-tokens-performance.md` |
| R-mobile | `docs/plans/research/2026-11-03-mobile-dynamic-island.md` |

Measurement scripts from R-tokens are saved in `docs/plans/research/measure/` (`breakdown.py`, `q.py`, `rollout.py`). They need `tiktoken` (`pip install tiktoken`).

**Facts verified against the code on 2026-11-03** (spot checks of the research):
- Sign-in gate: `src/renderer/src/AppView.tsx:77` shows the app only when `auth.visibleSignedInAccount()` is set.
- Team API binds loopback only: `src/main/listen-loopback.ts:35`.
- Auto-update feed: `electron-builder.yml:21-24` (`publish: github nightly-labs/openbot`).
- Copilot ACP preset exists: `packages/contracts/src/acp-agent-presets.ts:20`.
- Headless server mode is Linux only: `src/main/server-mode.ts:53`.
- Computer Use is on unless set false: `packages/contracts/src/ipc-agents.ts:45-47`.
- Island coordinator seeds turn state on a server switch: `src/renderer/src/turns.tsx:75`.
- Default agent access is `full` (`ipc-agents.ts:38`). `#ownProcessFor` returns `null` (shared Codex process) for an unconfined agent on the default account (`src/backend/agent/provider-runtime.ts:2364-2370`). This conflicts with R-tokens' claim that each agent runs its own app-server. Task 1.1 settles it.

## Decisions

Each decision is reversible unless marked. Change one only with a reason recorded in `progress.md`.

| # | Decision | Why | Alternative kept open |
|---|---|---|---|
| D1 | Side-by-side identity. Working names: product `OpenBot Personal`, app id `dev.hridaya.openbot`, URL scheme `openbot-personal`, data folder `~/Library/Application Support/OpenBot Personal`. All four live in one place each (Task 0.3), so Hridya can rename later. | A shared id shares the data folder, the keychain names and `openbot://` with upstream, and the first launch would migrate the live `openbot.db` with no backup. [R-commercial §5] | Replace upstream once the fork is trusted |
| D2 | No auto-update. Delete `publish:`. The fork updates by rebuilding (`bun run package`) and copying the app. | Removing `publish` stops `app-update.yml` being written, and the existing check keeps the updater off (`application-services.ts:3183-3203`). [R-commercial §4] | Point `publish` at a private fork repo later |
| D3 | Tokens first (Phase 1). | It is Hridya's daily pain, it is measurable, and it touches few files. A Codex agent's first request is 55K–61K tokens, against 25K for plain Codex. Computer Use schemas are about 22K of that. [R-tokens M1] | none |
| D4 | The account becomes a private "control plane" on the Mac mini. Run the existing Worker (`apps/auth-api`) and Signal (`remote/api`) on the mini behind `tailscale serve` HTTPS. Replace email codes with owner sign-in that trusts the tailnet. Hridya never sees an account, and nightly-labs holds nothing. | Ripping the account out (R-accounts Option B) edits about 150 files and rewrites the host-client trust boundary, on machines where agents have full disk access. Option A keeps the tested protocol and makes about 20 account edits. [R-accounts §Options] | Option B later, after Phase 5 works. The commercial deletions in Phase 2 help both options. |
| D5 | Multi-host = the mini is the single always-on host for routine agents. The MacBook joins it as a client and keeps its own local host for agents that need MacBook-only things. No two-host lease or database sync. | SQLite is the source of truth, and migrations are irreversible. A lease plus sync (Option B) risks both, plus provider session files. Keep-awake does not survive a closed lid, so the MacBook cannot be the always-on host. [R-multihost §Options] | Remote execution from the mini onto the MacBook through MCP (Option C) |
| D6 | Copilot via the user's own `copilot` CLI over ACP. Stage 0 is a no-code custom agent. Stage 1 is a first-class provider copied from the Hermes driver. No managed runtime download. | `copilot --acp` exists (public preview since 2026-01-28). OpenBot already ships the preset. OpenBot never touches the credential: it lives in the macOS keychain item `copilot-cli`. [R-copilot] | Copilot through OpenCode (Option B) |
| D7 | iPhone push: foreground only at first. Direct APNs from Hridya's own host only after a paid Apple Developer account is confirmed. | Upstream's push relay uses the nightly-labs APNs key and bundle id. A backgrounded iPhone is reachable only through APNs. [R-mobile §Push] | Direct APNs (Phase 7.4) |
| D8 | Remove Dynamic Island completely: the desktop notch window, the iOS Live Activity, and the host sender. Split the coordinator and keep its per-server turn-state half. | `turns.tsx:75` uses the coordinator to seed turn state after a server switch. A plain delete would empty the queues and approvals after every switch. [R-mobile §B, §C] | none |
| D9 | English only. Delete the 12 other locales (about 164K lines, 91% of `packages/i18n`). | One user, smaller build, fewer parity checks. [R-commercial §7] | Restore from `upstream` |
| D10 | Slack, Discord and Telegram stay off and their app code is deleted. | They need nightly-labs' own bot and app registrations. [R-accounts §5] | A personal Telegram bot later |
| D11 | Keep released Team API codecs (for example `live-activity-push-v1`) and stop advertising them. Do not regenerate fixtures unless a task requires it. | Codecs are cheap to keep. Deleting them breaks fixture tests for no gain. | Delete them in a cleanup pass |
| D12 | Upstream sync is selective. Record the base SHA in `progress.md`. Cherry-pick fixes. Never merge upstream wholesale after Phase 2. | After the deletions, a merge would conflict across hundreds of files. | none |

## Open questions for Hridya (each blocks one task only)

1. **Apple Developer account.** Blocks 7.3 (installing beyond 7-day free profiles) and 7.4 (push). Is there a paid team? The certificates on the MacBook belong to another person's teams (`HSLSDPZZDT`, `DV6NC6KRYL`) [R-mobile §Summary]. Ask before using them.
2. **Copilot plan** (monthly or annual, Pro or Pro+). Blocks only the limit-text regex in 4.3. [R-copilot §Plans]
3. **Final names** for D1. They are changeable at any time. Use the working names until Hridya says otherwise.

## External checks (what proves each phase, other than the agent)

| Phase | Check | Pass | Fail |
|---|---|---|---|
| 1 | `agent_usage_records` in the fork's `openbot.db`: uncached input of the first request of a fresh Codex agent session. Same agent setup as the baseline. | ≤ 30,000 tokens (baseline 55,217–61,370) | > 40,000 |
| 2 | 15 minutes of `lsof -nP -i -a -p <fork main pid>` while using the app, plus `grep -r "openbot.run\|nightly-labs" out/` on the build | No connection to `*.openbot.run`, `analytics.openbot.run` or `raw.githubusercontent.com/nightly-labs` | Any such connection |
| 3 | `git grep -il "dynamic.island\|live.activit\|macBookNotch"` on code (not docs history), plus `bun scripts/desktop-notifications-e2e.ts` | Zero code hits. Desktop notifications pass. | Hits remain, or notifications regress |
| 4 | A real turn on a Copilot agent, then a forced limit that fails over to the backup model | Turn completes; fail-over is logged | Either does not happen |
| 5 | Fresh fork install on the MacBook with the mini on: no email screen, signed in as owner. Then with the mini off: the app opens and local agents work. | Both | Sign-in screen, or a blocked start |
| 6 | Close the MacBook lid across a routine's due time, then read the run history on the mini. `pmset -g log` on the mini shows no sleep. | Run recorded at the due time | Missed run |
| 7 | The phone app pairs with the mini by QR over Tailscale and sends a message to an agent | Message delivered and answered | Pairing fails |

---

## Phase 0: Safe baseline

### Task 0.1: Toolchain and branch

**Files:** none (environment), `progress.md` (create at repo root).

**Step 1:** Install Bun 1.4.2. The repo pins it (`package.json:77`); the MacBook has 1.3.14. Run `curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"`, then `bun --version`. Expected: `1.4.2`.
**Step 2:** `git switch -c personal`. All fork work lives on `personal`. `main` stays equal to upstream for diffing.
**Step 3:** `bun install --frozen-lockfile`. Expected: exit 0.
**Step 4:** Create `progress.md` with: upstream base SHA `de784cee2`, the decision table reference, an empty "Done / Remaining / Evidence" list. Keep it current after every task (Hridya's rule; the repo also suggests a git-ignored `TASKS.md`, which you may use as a scratch checklist).
**Step 5:** Commit: `chore: start personal fork`.

### Task 0.2: Prove the unmodified build runs in isolation

**Files:** none.

**Step 1:** `bun run dev`. The dev runner uses its own per-worktree profile (`README.md` command table, `bun run dev`), never the packaged data folder. Expected: the app opens on the sign-in screen. This is the baseline behaviour Phase 5 removes.
**Step 2:** `bun run dev:stop`.
**Step 3:** Record in `progress.md` that dev builds use a separate profile, and the folder path printed by `bun run dev:status`.

### Task 0.3: Side-by-side identity (D1)

**Files:** Modify `electron-builder.yml:1-8,21-24,93-97,130-134` (`appId`, `productName`, `copyright` keeps the upstream line and adds the fork maintainer, `protocols`, delete `publish`, `mac.notarize: false`, drop `ElectronTeamID`); `build/entitlements.mac.plist` (remove `com.apple.developer.associated-domains` and `com.apple.developer.team-identifier`: a locally signed app with restricted entitlements may not launch); `src/main/index.ts:261,932` (`app.setName`, `setAsDefaultProtocolClient`); every `openbot://` literal (20 code files on 2026-11-03: `git grep -ln "openbot://" -- src packages apps/mobile/src`, including `deep-link-router.ts:44`, `packages/contracts/src/invite-links.ts:91`, `mcp-oauth-provider.ts`, `apps/mobile/src/features/links/model/incoming-links.ts`); `package.json:1-20` metadata; delete `electron-builder.windows-signing.yml` and `build/installer.nsh` (no Windows). [R-commercial §5]

**Step 1: Record the failing state.** `git grep -n "openbot://" -- src packages apps/mobile/src | wc -l`. Expected: more than 20 lines. The goal is one definition.
**Step 2:** Add `APP_URL_SCHEME` to `packages/contracts` (one new file, or the module that already exports link builders). Replace every literal with it. Leave the scheme strings in released Team API fixtures alone (D11).
**Step 3:** Rerun the grep. Expected: only the constant's own definition. Then `bun run typecheck:contracts && bun run typecheck:node && bun run typecheck:mobile`. Expected: pass. Deep links are covered again end to end in Task 0.3 Step 5 (`open "openbot-personal://join?..."` brings the app forward) and in Phase 7.
**Step 4:** `bun run package`. Expected: `dist/mac-arm64/OpenBot Personal.app` exists and contains no `Contents/Resources/app-update.yml`. Check with `ls`.
**Step 5:** Copy the app to the **mini** (GUI work belongs there) and launch it once. Run `open "openbot-personal://"`: the fork comes forward, upstream does not. Confirm that `~/Library/Application Support/OpenBot Personal` is created and `~/Library/Application Support/OpenBot` is untouched (compare `stat -f %m openbot.db` before and after).
**Step 6:** Commit: `feat: side-by-side identity and no auto-update`.

### Task 0.4: Token baseline you can re-run

**Files:** Create `tools/token-baseline/README.md` (how to run), and move `docs/plans/research/measure/{breakdown.py,q.py}` into `tools/token-baseline/`. Add a `uv`/`pip` note for `tiktoken`.

**Step 1:** Start the packaged fork on the mini. Connect Codex. Create one agent named `Probe` with default settings. Send `hi`.
**Step 2:** `python3 -I tools/token-baseline/q.py` against the fork's `openbot.db` (read-only URI). Record the first-request uncached input in `progress.md` under "Baseline". Expected: 50K–62K, the same order as R-tokens M1.
**Step 3:** Run `breakdown.py` on that session's rollout file in `~/.codex/sessions/...`. Save the component table to `progress.md`.
**Step 4:** Commit: `chore: add token baseline tools`.

### Task 0.5: Note the build-time upstream dependency

**Files:** `progress.md` only.

`bun run package` runs `prepare:remote-desktop-runtime`, which downloads a hash-pinned artifact from an upstream release (`native-runtime.lock.json:387-393`, `scripts/install-remote-desktop-runtime.ts:45-56`). It is safe because of the hash, but the build fails if upstream deletes that release. Record this risk. Do not rebuild the runtime now. Revisit only if a build fails.

---

## Phase 1: Token cost and runtime (D3)

Measure after every task with Task 0.4's tools, on a **fresh** session of the `Probe` agent. Record before and after numbers in `progress.md`. Most of the Codex config keys below were found only as strings in the Codex 0.166.0 binary [R-tokens]; each task proves its key works before relying on it.

### Task 1.1: Settle the process-per-agent question

**Files:** none.

**Step 1:** On the mini, with the fork running five idle agents, run `ps -axo pid,ppid,rss,command | grep -i codex | grep -v grep`. Count `codex app-server` processes and sum RSS.
**Step 2:** Read `src/backend/agent/provider-runtime.ts:139` and `:2364-2379` and explain the count. Expected per the code: one shared app-server for unconfined, default-account agents. R-tokens measured 3.6 GB of Codex memory from `resources.ndjson`; the cause may be per-agent MCP children (cua-driver), not app-servers.
**Step 3:** Record the finding and the real memory owner in `progress.md`. If per-agent `cua-driver` processes dominate, Task 1.2 also fixes memory.

### Task 1.2: Computer Use off by default, and filtered when on

**Files:** Modify `packages/contracts/src/ipc-agents.ts:45-47` (`agentComputerUseEnabled`: absent means **off**); `src/backend/mcp-provider-shapes.ts:172-174,719-731` (`codexMcpServers`: emit `enabled_tools` for the computer-use server); `src/backend/agent/thread-lifecycle.ts:1040-1042` (`#agentMcpServers`); `src/main/cua-driver-runtime.ts:375-406` (tool list); `src/backend/agent/developer-instructions.ts:343-347` (text that mentions Computer Use only when it is on). Test: the vitest file next to `mcp-provider-shapes.ts`, or a new `mcp-provider-shapes.test.ts` (this is configuration shaping, not a protected area; prefer extending an existing e2e if one covers `codexMcpServers`: check with `git grep -l codexMcpServers scripts/`).

**Step 1: Spike the key.** With the Codex CLI only (outside OpenBot), add a stdio MCP server in a temporary `CODEX_HOME` with `enabled_tools = ["start_session"]` and confirm via a rollout that only that tool is declared. Record the result. If `enabled_tools` does not work, use `disabled_tools` the same way. If neither works, skip Step 4 and rely on Step 3 alone.
**Step 2: Failing test.** Assert that `codexMcpServers` emits `enabled_tools` equal to the core GUI allowlist for the computer-use server. The allowlist is the 27 core tools minus the 11 `browser_*`/`get_browser_state`/`page` tools, because OpenBot has its own browser and its prompt forbids others (`developer-instructions.ts:272`). Take the list from R-tokens #1–#2 and name it `COMPUTER_USE_CORE_TOOLS` in `cua-driver-runtime.ts`. Run it; expected FAIL.
**Step 3:** Change the default in `agentComputerUseEnabled` to `agent.computerUse === true`. Existing agents with no field become off. That is intended for this fork. Note it in `progress.md` because it differs from upstream's comment.
**Step 4:** Emit `enabled_tools` from `COMPUTER_USE_CORE_TOOLS`. Run the test; expected PASS.
**Step 5:** `bun run check:agent-context`. Expected: within budget. Update `tools/agent-context/budget.json` only if the numbers went **down**.
**Step 6:** Re-measure with Task 0.4's tools. Expected: about 22K fewer first-request tokens with Computer Use off, and about 9K fewer with it on.
**Step 7:** Commit: `perf: computer use opt-in and filtered tool list`.

### Task 1.3: Stop the user's Codex setup leaking into agents

**Files:** Modify `src/backend/agent/thread-lifecycle.ts:136` (`CODEX_FEATURES_CONFIG`) and `:844-862` (`codexConfigEffect`).

**Step 1: Spike each key** with `codex -c <key>=<value>` in a scratch folder, and read the rollout's developer message. Keep only keys that change the rollout:
- `features.multi_agent` / `features.multi_agent_v2` = false (the `collaboration` namespace, about 1,500 tokens; OpenBot has its own agent messaging).
- `include_collaboration_mode_instructions`, `include_apps_instructions` = false.
- `include_permissions_instructions` = false only if OpenBot's sandbox config already states the permissions the agent needs. Check `codexSandboxConfig`. If unsure, keep it.
- `skills` / `omit_skill_descriptions`: see Task 1.4.

**Step 2: Failing test.** In the existing test for `codexConfigEffect` (find it with `git grep -ln codexConfigEffect src scripts`), assert that the returned config contains each proven key. Expected FAIL.
**Step 3:** Add the proven keys to `CODEX_FEATURES_CONFIG` or to the config object. Run the test. Expected PASS.
**Step 4:** Re-measure. Expected: 1.5K–3.7K fewer tokens [R-tokens #5, #7].
**Step 5:** Commit: `perf: trim codex features that duplicate openbot`.

Do not strip `~/AGENTS.md` (2,054 tokens). Upstream documents it as user-intended, and Hridya relies on it.

### Task 1.4: Per-agent skill allowlist

**Files:** Modify `src/backend/agent/thread-lifecycle.ts` (`codexConfigEffect`); the agent profile contract in `packages/contracts/src/ipc-agents.ts` (new optional `skills?: { mode: "all" | "workspace-only" }`); the settings UI that edits agent permissions (find it from `computerUse` in `src/renderer/src/features/agents/`). Text through `@openbot/i18n` (English only after Phase 2).

**Step 1: Spike.** Find the Codex key that turns off home skills (`~/.agents/skills`, `~/.codex/skills`) but keeps workspace skills (`<workspace>/.agents/skills`). Candidates from the binary: `[[skills.config]]` with `enabled = false` per name, `omit_skill_descriptions`, a `skills` table. Prove it with a rollout. The skills block is 9,018 tokens and is re-sent at turn 2 [R-tokens M3, #6].
**Step 2: Investigate the turn-2 re-send** before changing anything: diff the two skills messages in one rollout (R-tokens open question 4). If OpenBot causes it (for example `thread_settings_applied` or a changed cwd), fix that cause first. It may save 9K tokens on every second turn with no setting.
**Step 3: Failing test:** with `skills.mode = "workspace-only"`, `codexConfigEffect` emits the proven key. Expected FAIL. **Step 4:** Implement. **Step 5:** PASS. **Step 6:** Re-measure. Record the saving.
**Step 7:** Commit: `perf: per-agent skill scope`.

The default stays `all`, upstream's behaviour. Hridya sets `workspace-only` per agent. The crew in `~/honey/openbot-crew` keeps its skills in each workspace, so its agents can use `workspace-only` safely.

### Task 1.5: Cache-friendly order for Codex

**Files:** Modify `src/backend/agent/thread-lifecycle.ts:1147` (`memoriesInTurns: client.provider === "claude"`), `src/backend/agent/developer-instructions.ts:246-258,316,354-358`.

Codex appends about 10K tokens of its own text after OpenBot's developer text. Per-agent text (profile, workdir, memories) sits before it, so the cached prefix diverges between agents and routine sessions [R-tokens #3]. Claude already moves memories and teammates into user turns.

**Step 1: Failing test:** for a Codex client, `developerInstructions()` contains no per-agent profile, workdir or memory text, and the first user turn does. Copy the Claude case's test, if one exists (`git grep -ln memoriesInTurns`).
**Step 2:** Extend `memoriesInTurns` (and the profile/workdir move) to Codex. Use `memoryContextUpdate` and `sectionTeammatesUpdate` (`developer-instructions.ts:148,205`). Codex has no in-turn memory update path. Send updates as user-turn text, as Claude does.
**Step 3:** PASS. **Step 4:** Measure: start two different agents 30 s apart and compare `cached` on the second agent's first request. Expected: the second reads cache for the shared prefix (≥ 30K cached).
**Step 5:** Commit: `perf: stable cache prefix for codex agents`.

### Task 1.6: Routine runs reuse the cache

**Files:** Read `src/backend/agent/drain-scheduler.ts:747` (`startRoutineThread`), `thread-lifecycle.ts:529`.

Each routine starts a new session and pays a cold prefix of about 46K tokens [R-tokens #4]. After Tasks 1.2–1.5 the prefix is smaller and shared. Measure one routine run of the crew's Launch Manager before and after. If the run is still cold (0 cached), check whether the prompt cache window (minutes) is shorter than the gap between routines. If it is, a fresh session is fine; record the measurement and stop. Do not add a session-reuse feature without numbers.

### Task 1.7: IPC chatter and duplicate requests

**Files:** `src/renderer/src/features/dynamic-island/dynamic-island-context.tsx:66-76` (deleted in Phase 3; skip if Phase 3 lands first), `team-typing.ts:9` (`servers:set-typing`), the callers of `agent:get-usage` (3 parallel calls, 1.45 s each) and `agent:session-settings:read` (5 calls, 744 ms mean) [R-tokens runtime findings 4–5].

**Step 1:** Reproduce with the app's own trace (`trace.ndjson` in the fork's data folder) for 10 minutes of normal use. Count calls per channel.
**Step 2:** For each duplicate, share one in-flight request (coalesce in the renderer port) or throttle `set-typing` to one call per 2 s per thread.
**Step 3:** Re-count. Expected: `agent:get-usage` once per launch; `set-typing` down by 5× or more.
**Step 4:** Commit: `perf: dedupe startup ipc and throttle typing`.

`hosted-servers:list` (21 calls) is deleted in Phase 2. Do not optimise it.

### Task 1.8: Renderer start-up (only with numbers)

**Files:** `electron.vite.config.ts`.

**Step 1:** `bun run dev:bench` before. Record cold start.
**Step 2:** Look at the 16.4 MB eager load (`styles-*.js` 7.16 MB, `Schema-*.js` 2.74 MB) [R-tokens M8]. Lazy-load settings, Storybook-only and onboarding routes.
**Step 3:** `bun run dev:bench` after. Keep the change only if cold start drops by 10% or more. Otherwise revert it and record the numbers.

Use the `performance` skill for this task.

---

## Phase 2: Cut the upstream cord and the commercial code

Follow the deletion order in [R-commercial "Deletion order"]. After each task: `bun run knip:check`, then the typecheck for each touched area (`typecheck:node`, `typecheck:renderer`, `typecheck:contracts`, `typecheck:api`, `typecheck:mobile`, `typecheck:i18n`, `typecheck:team-client`), then `bun run build && bun run verify:preload`. Use `bunx knip --fix --fix-type exports,types` to remove what a deletion orphaned. Keep every `openbot.db` migration and every reader of rows that already exist (for example hosted-site rows).

### Task 2.1: Stop all automatic upstream traffic

**Files:** `src/main/provider-runtime-releases.ts:45-46,381-390` (read the bundled `provider-runtime-blocklist.json` instead of `BLOCKED_VERSIONS_URL`); `src/main/host-release-service.ts:72` (delete the GitHub poll and its UI); `scripts/host-manager-macos.ts:160,174` (delete); the OpenPanel sender in `packages/telemetry` (make `send` a no-op first; full removal in 2.6); the CSP host list in `src/main/content-security-policy.ts`; `src/main/app-archive-watch.ts:18,84` (stop opening `openbot.run/download`). [R-commercial §3–4]

**Step 1:** Run the Phase 2 external check (15 min `lsof`) on the Task 0.3 build. Record every remote host contacted. This is the "before".
**Step 2:** Make the changes. **Step 3:** Rebuild and rerun the check. Expected: no `*.openbot.run` except `api.`/`signal.` (removed in Phase 5), and no `raw.githubusercontent.com/nightly-labs`.
**Step 4:** Commit: `chore: stop upstream update, blocklist and analytics traffic`.

### Task 2.2: English only (D9)

**Files:** Delete `packages/i18n/src/messages/<locale>/` for the 12 non-English locales; edit the catalog index and locale list; remove the language step from onboarding (`languageStepShown`, `AppView.tsx` near `:79`). Docs: `docs/i18n.md`. [R-commercial §7]

**Step 1:** `bun run i18n:check`. Record the baseline. **Step 2:** Delete and edit. **Step 3:** `bun run i18n:check` and `bun run typecheck:i18n`. Expected: pass. **Step 4:** Commit: `chore: english only`.

### Task 2.3: Hosted sites

**Files:** Per [R-commercial §1–2, hosted sites rows]. Keep the readers for existing rows.
Steps: delete UI → IPC → contracts → main services; knip; typecheck; build. Commit: `chore: remove hosted sites`.

### Task 2.4: Licence purchase and seats

**Files:** Per [R-commercial §1, licence rows]. **Trap:** `ServerMembersSection.tsx` has a licence step inside the invite flow. Remove that step and keep the invite flow working. Keep "plan limits" and `FirstRunPlanStep`: they are provider plans, not billing.
Steps: delete; run `bun run test:invite-acceptance` (Worker needed; run it in Phase 5 if the Worker is not up yet, and note that in `progress.md`); knip; typecheck; build. Commit: `chore: remove licence purchase`.

### Task 2.5: Paid hosted servers and billing

**Files:** Per [R-commercial §1]: Stripe, plans, checkout, `boat`, `AddServerOverlay`, `SettingsHostedServersTab`, `hosted-server-service`, `web-hosted-servers`, `web-hosted-server-wake`, their IPC, contracts and tests (`test:billing-snapshot`, `test:paid-account-identity`, `test:hosted-*`). **Trap:** `AddServerOverlay` and the mobile `hosted-server/{join,scan,local}` routes also hold the **join** and **local-server** flows. Phase 6 needs those flows. Move them out of the overlay into a plain "Join server" dialog before deleting the hosted parts. Do not delete them.
Steps: extract the join and local flows → delete the hosted code → knip → typecheck → build → `bun scripts/local-servers-e2e.ts --allow-mutations` against `bun run dev`. Expected: join and local-server flows still pass. Commit: `chore: remove hosted servers and billing`.

### Task 2.6: Telemetry

**Files:** `packages/telemetry`, about 95 call sites [R-commercial §3]. **Trap:** 44 files import `@openbot/telemetry` only for failure types. Move those types into `packages/user-errors` (or `packages/contracts`) first, then remove the analytics calls, then delete the package. Keep `privacy-safe diagnostics export` (local file only). Delete `ANALYTICS.md`.
Steps: move the types → typecheck → remove the calls → typecheck → delete the package → knip → build. Commit: `chore: remove telemetry`.

### Task 2.7: Worker shop code and marketing site

**Files:** `apps/auth-api` routes for Stripe, licences, hosted servers, compare/marketing content (about 31K lines plus 35 MB of art), `apps/site-router`, `apps/status`. **Keep:** the D1 migration files, auth, sessions, hosts, tickets, memberships, invites and push routes (Phase 5 runs this Worker). Delete `apps/slack-app`, `apps/discord-app` and `apps/telegram-app` (D10).
Steps: delete → `bun run typecheck:api` → `bun run test:api` → knip. Commit: `chore: strip the worker to auth and hosts`.

### Task 2.8: Repo furniture

**Files:** `CLA.md`, `.github/workflows/release.yml` and other upstream-only workflows, `scripts/{prepare-release,release-preflight,merge-mac-update-manifests,verify-update-artifacts}.ts`, the `package.json` scripts listed in [R-commercial "Commands"], `README.md` (rewrite as a short personal README; use the `readme` skill), `PRIVACY.md` (rewrite to the fork's real data flows after Phase 5), `docs/` pages for deleted features (`bun run check:doc-links` must pass).
Commit: `chore: remove upstream release and contribution furniture`.

### Task 2.9: Phase 2 check

Run the Phase 2 external check on a fresh `bun run package` build. Record the host list in `progress.md`. Then use the `code-deslop` skill on the Phase 2 diff (`git diff main...personal --stat` first).

---

## Phase 3: Remove Dynamic Island (D8)

Inventory and order: [R-mobile "Dynamic Island inventory" A–C and "Recommended removal order"]. Shared code to keep is listed in [R-mobile "What shares code with normal notifications"].

### Task 3.1: Split the coordinator first

**Files:** `packages/team-client/src/dynamic-island-coordinator.ts` (606 lines) → new `packages/team-client/src/server-runtime-state.ts` (per-server turns, queues, prompts, approvals, failures only); `reconcileQueuesWithRuntimeWork` → the same new module; update `src/renderer/src/turns.tsx:23,38-40,75-82`, `src/renderer/src/features/agents/agent-event-bridge.tsx:4,405`; `packages/team-client/package.json:32-35` exports.

**Step 1: Reproduce today's behaviour** with the existing server-switch e2e (`scripts/schedule-server-switch-e2e.ts` or the one R-mobile names; find it with `git grep -l "serverState(" scripts`). Record that pending approvals survive a switch.
**Step 2:** Move the state half into `server-runtime-state.ts`, with the same public methods `turns.tsx` uses. The presentation half stays behind for now.
**Step 3:** Rerun the e2e. Expected: same result. **Step 4:** Commit: `refactor: split server runtime state from island coordinator`.

### Task 3.2: Phone Live Activity

**Files:** Per [R-mobile A]. Move `live-activity-keys.ts` to `apps/mobile/src/features/push-notifications/push-secret.ts` before deleting the folder. Send `liveActivityStartedAt: null` (the frozen `push-notifications-v1` schema keeps the field). Remove the `expo-widgets` plugin (`app.json:209-216`) and dependency (`package.json:81`).
Check: `bun run typecheck:mobile`. Commit: `chore(mobile): remove live activity`.

### Task 3.3: Host Live Activity sender

**Files:** Per [R-mobile C]: delete `src/main/live-activity-push.ts`, `src/main/team-api/route-live-activity-push.ts`, `central-auth-manager.ts:922-960` (`sendLiveActivityPush`), the wiring at `application-services.ts:2662`, and the host references (`host-service.ts`, `team-api-server.ts:271,1095,1723,2228`). Set `push-notifications.ts`'s `liveActivityShows` to always false, or remove the option. Keep the `live-activity-push-v1` codec (D11). Rename `live-activity-seal.ts` → `push-seal.ts` and update its 3 importers.
Check: `bun scripts/push-notification-away-e2e.ts` and `bun scripts/notification-summary-e2e.ts` pass. Edit, don't delete, the wired e2e scripts that mention Live Activity (`ci.yml:347-359`). Delete the unwired `scripts/live-activity-*-e2e.ts`. Commit: `chore: remove live activity sender`.

### Task 3.4: Desktop notch window

**Files:** Per [R-mobile B]: the main-process window, actions, preference store, IPC handlers, preload bridge and decoders, contracts (`ipc-dynamic-island.ts` and the endpoint group), renderer feature folder, settings tab and the 8 `macBookNotch*` settings, `packages/ui` island components, brand tokens, mock IPC (`src/renderer/src/preview/mock-openbot.ts`; required by `src/main/AGENTS.md`), stories, bench scenarios. Then the `koffi` dependency and `mac-panel-activation.ts`, but only after `git grep -n "setPreventsActivation\|macPanelActivation"` shows no other caller. Same check for `mac-haptic-feedback.ts`.
**Trap:** `main-window.ts:269` keeps a hidden renderer alive for the island coordinator. After 3.1, check whether anything else needs it. If nothing does, remove it.
Checks: `bun run build && bun run verify:preload`; `bun run test:desktop -- src/main/ipc-channel-coverage.test.ts src/main/trusted-ipc.test.ts` (trust boundary; must pass); `bun scripts/desktop-notifications-e2e.ts`; `bun run test:zero-filled-settings` if it exists. Commit: `chore: remove desktop dynamic island`.

### Task 3.5: Presentation, strings, docs

Delete `dynamic-island-presentation.ts`, `live-activity-props.ts`, `live-activity-text.ts`; keep `message-summary.ts`. Remove the island and Live Activity strings (English only by now), docs and PRIVACY sections. Run the Phase 3 external check. Commit: `chore: remove island presentation and docs`.

---

## Phase 4: GitHub Copilot (D6)

### Task 4.1: Stage 0 spikes, no code

Run the seven spikes in [R-copilot "Real-CLI spikes"] in a scratch folder. Record each result in `progress.md`. Minimum: `npm i -g @github/copilot` (or `brew install copilot-cli` if that formula exists; check), `copilot login`, confirm the keychain item `copilot-cli`, then in the fork add the "GitHub Copilot" custom-agent preset and complete one turn. Hridya must do the browser sign-in step. Ask Hridya, don't guess the account.
Capture: the model ids, whether `set_config_option model` applies, stdio and http MCP behaviour, keychain access from a Workspace-only agent, and the error text of a limit.

### Task 4.2: First-class provider (Stage 1)

**Files:** The table in [R-copilot "Files to touch"]. Template: the Hermes driver (`src/backend/provider-drivers.ts:1164-1224`, `cli.ts:444`).

**Step 1: Failing test.** Add a `DriverCase` for `copilot` to `scripts/provider-conformance-e2e.ts` and a fake in `scripts/provider-fakes/agents/conformance.ts`. The fake reproduces "model reported as current but not applied". Run `bun scripts/provider-conformance-e2e.ts`. Expected: FAIL (`copilot` is not a provider).
**Step 2:** Add `"copilot"` to `AGENT_PROVIDERS`, its descriptor (`LOCAL_ONLY`, `reportsUsage: false`, `steer: "deferred"`, `concurrentTurns: false`, `defaultModel: ""`), the `AgentAuthState` arm, `resolveCopilotCli` with `MINIMUM_COPILOT_VERSION` from the spike, and the driver row with `signIn` (`copilot login`) and `codeSignIn` (device flow).
**Step 3:** Add `alwaysSetModel?: true` to `AcpFlavor` (`acp-flavor.ts`). Read it at `acp-configuration.ts:351`. Name the Copilot version that needs it in the code comment (the only kind of comment allowed there: an external constraint).
**Step 4:** `copilotStatePaths()` in `process-confinement.ts` only if spike 4 showed the keychain works when confined. If it did not, mark Copilot as full-access only in the descriptor.
**Step 5:** Run the conformance e2e. Expected: PASS.
**Step 6:** Logo variant and colours (`packages/brand`), the onboarding picker map (`SetupProviderPicker.tsx:126`), English strings only.
**Step 7:** Commit: `feat: github copilot provider`.

### Task 4.3: Limits and fail-over

**Files:** `src/backend/agent/provider-diagnostics.ts:247`, `scripts/provider-cli-canary.ts:50`.
Add one narrow regex from spike 6's real text. Do not invent the text. Set the crew's agents to Codex first, Copilot as backup, or the reverse, as Hridya chooses. Run the Phase 4 external check. Commit: `feat: copilot limit fail-over`.

### Task 4.4: Terms note

Add a "GitHub Copilot" section to `docs/provider-terms.md` per [R-copilot "Terms text"]. State facts with dates. Claim no approval. Commit.

---

## Phase 5: Private control plane, no account (D4)

Start with the spike. If the spike fails twice for different reasons, stop and record why. Then choose between A1 (Hridya's own Cloudflare account) and Option B with Hridya. Do not start B without Hridya.

### Task 5.1: Spike: Worker and Signal on the mini

**Files:** none in the repo. Scratch notes in `progress.md`.

**Step 1:** On the mini (shell through the cua Space `mini`), check Tailscale: `tailscale status` and `tailscale cert` support (MagicDNS on).
**Step 2:** Run the Worker locally with its dev stack (`apps/auth-api` `bun run dev`, or `scripts/dev-services.ts api`, which uses local D1 and R2: `scripts/dev-services.ts:300-441`). Run Signal with `bun src/index.ts` in `remote/api` and `REMOTE_TLS_DISABLED` (`remote/compose.dev.yaml`).
**Step 3:** Expose both with `tailscale serve` HTTPS. The desktop needs HTTPS or loopback (`central-auth-manager.ts:2025-2032`). The phone accepts `http:` only for loopback and RFC 1918, not `100.64.0.0/10` (`mobile-connect.ts:137-149`). So HTTPS on `<mini>.<tailnet>.ts.net` is required.
**Step 4:** Point a dev build at it: `OPENBOT_AUTH_API_URL`, `OPENBOT_REMOTE_SIGNAL_URL`, `OPENBOT_CONTROL_PLANE_ORIGIN`. Sign in with `AUTH_EXPOSE_DEVELOPMENT_CODE` (spike only).
**Step 5:** Test the three unknowns in R-accounts, and record each:
- Does the dev Worker stay up for 24 h? (`launchctl` a wrapper; check memory.)
- Does Signal connect host and client over the tailnet when the TURN host is unreachable? Signal always builds an ICE list from `TURN_HOST`/`TURN_SHARED_SECRET` (`tokens.ts:499-517`). Set them to a dead host and test. If it fails, run coturn on the mini too.
- Does the cron outbox (revocation retries, `wrangler.jsonc:22-24`) run locally? If not, record the effect: revocations retry only on demand.

**Pass:** a MacBook dev build signs in against the mini and joins a host on the mini. Record the evidence.

### Task 5.2: Owner sign-in without email

**Files:** `apps/auth-api` sign-in route (find it from the email-challenge handler; R-accounts §1); `src/main/central-auth-manager.ts` (sign-in client); `src/renderer/src/AppView.tsx:77` and the account context; new Worker env vars `OWNER_EMAIL` and `OWNER_TAILNET_LOGIN`.

Design: the Worker creates and signs in exactly one account, `OWNER_EMAIL`. It listens on `127.0.0.1` only, and `tailscale serve` (never Funnel) is its only way in. So every request arrives from loopback, and the source address proves nothing. Trust the identity header that `tailscale serve` adds instead: `Tailscale-User-Login`. A sign-in request whose `Tailscale-User-Login` equals `OWNER_TAILNET_LOGIN` gets its challenge auto-approved through the existing session issuance code, minus the email. A missing or different header gets 403. The phone's and the mini's own requests carry the same tailnet login, because they are the same tailnet user. Verify that in the spike with `curl -sI` through `serve` from each device. Write these constraints in `apps/auth-api/README.md`: loopback bind, no Funnel, header trust. Check Funnel is off in `ops/mini` (Task 5.5) with `tailscale funnel status`.

**Step 1: Failing test** (Worker; trust boundary, so a vitest file is allowed): with header `Tailscale-User-Login: <owner>` the route returns a session; with no header, or another login, it returns 403; a second email is refused. Run `bun run test:api -- <file>`. Expected FAIL.
**Step 2:** Implement in the Worker. **Step 3:** PASS.
**Step 4:** Desktop: when the session file is missing, call owner sign-in before showing `AppAccessGate`'s fallback. Use `scripts/central-auth-startup-stall-e2e.ts` as the e2e template. Assert no sign-in screen is shown.
**Step 5:** Commit: `feat: owner sign-in on a private control plane`.

### Task 5.3: Offline-first start

**Files:** `src/main/central-auth-manager.ts` (cache the signed-in user in the session file; start as `signed_in` when the service is unreachable), `src/renderer/src/AppView.tsx`, `account-context.tsx`; e2e `scripts/central-auth-startup-stall-e2e.ts`. [R-accounts Option A table]

**Step 1: Failing e2e:** start with a valid session and an unreachable account URL. Expected today: a retry screen (`/health/live` is called even when signed out). Assert the app opens and local agents run. FAIL.
**Step 2:** Implement. **Step 3:** PASS. **Step 4:** Commit: `feat: start offline when the control plane is down`.

### Task 5.4: Compile in the mini's URLs

**Files:** `src/main/application-services.ts:991-994` (default account URL), `invite-links.ts`, `content-security-policy.ts:43-45`, `session-configuration.ts`, `apps/auth-api/wrangler.jsonc` (local values), `remote/.env`. Read the URLs from one config file at build time, `fork.config.json` at the repo root, next to D1's names. No hard-coded `openbot.run` anywhere: `git grep -n "openbot\.run"` in code must return only docs and history.
Commit: `feat: point the app at the private control plane`.

### Task 5.5: Run the control plane as services on the mini

**Files:** Create `ops/mini/` with two launchd plists (Worker, Signal), a `tailscale serve` setup script, and `ops/mini/README.md` (install, logs, restart). Secrets (ticket keys from `docs/self-hosting.md` step 1) go into Hridya's envsync vault (`envsync set`), never into git.
Check: reboot the mini; both services come back. `curl https://<mini>.<tailnet>.ts.net/health/live` returns 200.
Commit: `ops: control plane services on the mini`.

### Task 5.6: Phase 5 check and PRIVACY

Run the Phase 5 and Phase 2 external checks (no `*.openbot.run` at all now). Rewrite `PRIVACY.md` to the real flows: the providers, visited pages, the mini, Apple only if Phase 7.4 ships. Commit.

---

## Phase 6: The mini runs the routines (D5)

### Task 6.1: The mini as host

**Files:** none (configuration), `ops/mini/README.md` (document it).
Follow [R-multihost "Milestone 1"] steps 1–4 with the fork build. The agents come from the **upstream** app on the MacBook (Hridya's live crew): Export there, Import into the fork on the mini. Then: install on the mini, launch at login, keep awake, auto-login, restart after power failure, "Prevent automatic sleeping" on power. Sign in Codex (and Copilot) on the mini through the app. Move the crew's routine agents with Server settings › Transfer (chat history does not move). Pause the same routines on the MacBook. Set `missedPolicy` per routine: `skip` for time-bound jobs, `run-once` for the hackathon sweep.

The crew's instructions are linked by `~/honey/openbot-crew/install.sh`, which reads `~/Library/Application Support/OpenBot/openbot.db`. On the mini, point it at `OpenBot Personal` (one variable at the top of the script), clone `~/honey/openbot-crew` there, and run it. Check each agent workspace has its `AGENTS.md` link.

### Task 6.2: The MacBook joins the mini over Tailscale

With Phase 5 done, joining works through the private control plane and Signal. Join from the server rail. Keep "Local" on the MacBook for MacBook-only agents (for example a T3 Code operator).
Check: run the Phase 6 external check.

### Task 6.3: MacBook-only tools from mini agents

T3 Code runs on the MacBook (`http://127.0.0.1:3773/mcp`, loopback). To reach it from the mini, Hridya runs `t3 up` / T3 Connect or Tailscale HTTPS for T3 (T3's docs: plain `http` tailnet addresses cannot complete MCP OAuth). Then add an MCP server row on the mini with the HTTPS URL. This is configuration only. When the MacBook sleeps, those tools fail. The agent instructions must say "if T3 is unreachable, say the MacBook is asleep and stop".

### Task 6.4 (optional): Address-based join without Signal

Only if Phase 5's Signal proves unreliable. Follow [R-multihost "Milestone 2"]: a fixed `preferredPort` (`listen-loopback.ts:10-18`, `team-api-server.ts:497`), `tailscale serve` to that port, and a new optional Team API capability for password join. Do not change the meaning of an existing capability.

---

## Phase 7: Phone app, personal build

### Task 7.1: Identity

**Files:** `apps/mobile/app.json:9,12,14,23` (scheme from `fork.config.json`, bundle id `dev.hridaya.openbot`, remove `applinks:openbot.run`), `app.config.js`, `eas.json`, the Android module namespaces (`apps/mobile/modules/*/expo-module.config.json`; Android is out of scope, so leave them unless typecheck needs a change). Drop `google-services.json` use (iPhone only). [R-mobile "Personal build requirements"]

### Task 7.2: Pairing against the mini

The phone pairs by QR through the Worker. After Phase 5 that Worker is the mini. Test with `bun run dev:mobile` on the iOS simulator on the mini first: pair, open an agent, send a message.

### Task 7.3: Install on Hridya's iPhone

Needs answer to open question 1. With a free account: profiles last 7 days, max 3 devices and 10 App IDs (Apple's page). A free account likely has no App Groups (unconfirmed). Three targets use the group `group.run.openbot.mobile` [R-mobile]. After Phase 3 removes the Live Activity extension, check which targets still need the group. Remove the share and notification extensions if the free account cannot sign them, and record the loss.

### Task 7.4 (optional, paid account): Direct APNs

Port `ApnsRelaySender` (`apps/auth-api/src/server/live-activity-relay.ts`, ES256 JWT with `jose`) into `src/main` as the sender behind `sendPushNotification` (`central-auth-manager.ts:969-995`). The `.p8` key comes from envsync on each host. Honour the phone's `environment` (sandbox for dev builds). Test with `bun scripts/push-notification-away-e2e.ts`, then a real lock-screen alert.

---

## Execution notes

- **Parallel work:** Phases 1, 3 and 4 touch different files. They can run in separate worktrees (`git worktree add ../openbot-phase1 personal`), one agent each. Merge them back into `personal` in order 1 → 3 → 4. Phase 2 must land before Phase 5. Phase 5 must land before Phases 6 and 7.
- **After each phase:** use the `code-review` skill (thermo-nuclear mode) on the phase diff, then `code-deslop`. Record the findings and fixes in `progress.md`.
- **Visual checks:** after Phases 2 and 3, look at the settings and server rail screens on the mini (`computer-use` skill). Screenshots go in `progress.md` as file paths. Tests do not catch a broken settings page.
- **Stop and ask Hridya** only for: the Apple account (7.3, 7.4), the Copilot browser sign-in (4.1), the Phase 5 fallback choice, and any step that would touch `~/Library/Application Support/OpenBot` (the live upstream data).
