# Personal OpenBot Fork Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement task-by-task. Read `handoff` (receive direction) first if you were given this plan as a handoff.

**Goal:** Turn upstream OpenBot into **Hive**, a private single-user app for Hridya. Nothing goes to upstream. There is no paid or commercial code. GitHub Copilot is a first-class provider. Fallback chains span providers and accounts (for example Codex account 1 → Codex account 2 → Copilot). A Mac mini runs routines while the MacBook sleeps. Per-turn token cost is about half of today's.

**Architecture:** Keep upstream's architecture and wire protocols. Change behaviour by deletion and by configuration first, and by new code only where no setting exists. The account system stays, but its service runs on Hridya's Mac mini behind Tailscale instead of nightly-labs' cloud (Phase 5). It signs its one owner in without email. So the trust protocol between hosts, clients and the phone stays as upstream tested it, and no request reaches upstream. The fork installs side by side with upstream under a new app id, so the live upstream install and its `openbot.db` are never touched.

**Tech Stack:** Electron 3x + electron-vite, Solid (renderer), Effect 4.0.0, Bun 1.4.2 workspaces, SQLite (`openbot.db`), Cloudflare Worker code (`apps/auth-api`, run locally), Signal (`remote/api`), Expo SDK 58 / React Native 0.88 (`apps/mobile`, Android build), Codex app-server and ACP CLIs as providers.

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
- Hridya's phone is **Android**. Android emulators and the Android SDK are on the Windows PC (T3 device host `win-pc`, AVD `Pixel_API_37`, SDK `D:\Android\Sdk`). The MacBook has `adb` but no SDK. Ignore iOS-only work and the Dynamic Island; leave that code as upstream has it.

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
- Codex already supports up to 10 accounts, each in its own `CODEX_HOME` (`src/backend/provider-drivers.ts:768-769`, `MAX_PROVIDER_ACCOUNTS` in `packages/contracts/src/ipc-agent-status.ts:97`). Claude, Grok and Gemini do too.
- Backup models: each agent has up to 8 `{provider, model, providerAccountId}` entries with `automatic` switching (`packages/contracts/src/ipc-agents.ts:109-123`). Failover causes include `authentication` (`src/backend/agent/turn-lifecycle.ts:101-108`). Per `docs/architecture/providers.md` ("Backup models and failover"), channel tasks, a refused `turn/start` and a provider that fails to start do **not** fail over.
- Default agent access is `full` (`ipc-agents.ts:38`). `#ownProcessFor` returns `null` (shared Codex process) for an unconfined agent on the default account (`src/backend/agent/provider-runtime.ts:2364-2370`). This conflicts with R-tokens' claim that each agent runs its own app-server. Task 1.1 settles it.

## Decisions

Each decision is reversible unless marked. Change one only with a reason recorded in `progress.md`.

| # | Decision | Why | Alternative kept open |
|---|---|---|---|
| D1 | Name and identity. Product **Hive** (a crew of agents working for the hive; Hridya's projects live in `~/honey`). App id `dev.hridaya.hive`, URL scheme `dev.hridaya.hive` (reverse-DNS, so it cannot collide with another app's scheme), data folder `~/Library/Application Support/Hive`, Android package `dev.hridaya.hive`. Each value lives in one place (`fork.config.json`, Task 0.3). | A shared id with upstream would share the data folder, keychain names and `openbot://` links, and the first launch would migrate the live `openbot.db` with no backup. [R-commercial §5] | Rename via `fork.config.json` |
| D2 | No auto-update. Delete `publish:`. The fork updates by rebuilding (`bun run package`) and copying the app. | Removing `publish` stops `app-update.yml` being written, and the existing check keeps the updater off (`application-services.ts:3183-3203`). [R-commercial §4] | Point `publish` at a private fork repo later |
| D3 | Tokens first (Phase 1). | It is Hridya's daily pain, it is measurable, and it touches few files. A Codex agent's first request is 55K–61K tokens, against 25K for plain Codex. Computer Use schemas are about 22K of that. [R-tokens M1] | none |
| D4 | Accounts stay; upstream goes. Run the existing Worker (`apps/auth-api`) and Signal (`remote/api`) on the mini behind `tailscale serve` HTTPS. Owner sign-in trusts the Tailscale identity header, so there is no email step. Hridya asked for "nothing goes to upstream", not for account removal. | Removing accounts (R-accounts Option B) edits about 150 files and rewrites the host-client trust boundary. Option A keeps the tested protocol and makes about 20 account edits. [R-accounts §Options] | Option B, only if Hridya asks |
| D5 | Agents live on the host that suits them. The mini is the always-on host (routines, booking, hackathons). The MacBook runs its own host for MacBook-only work (T3 Code, `~/honey`) and is also a client of the mini. One client shows the agents of every host in one list, and an agent can move between hosts (Task 6.5). No two-host lease or database sync. | SQLite is the source of truth, and migrations are irreversible. A lease plus sync (Option B) risks both. Keep-awake does not survive a closed lid. [R-multihost §Options] | Remote execution from the mini onto the MacBook through MCP (Option C) |
| D6 | Copilot is a **first-class provider** (not a custom agent): the user's own `copilot` CLI over ACP, copied from the Hermes driver, with sign-in, model picker, backup-model support and (if the spike allows) multiple accounts. No managed runtime download. Hridya's plan: **GitHub Copilot Pro through GitHub Education**. | `copilot --acp` exists (public preview since 2026-01-28). OpenBot never touches the credential (macOS keychain item `copilot-cli`). [R-copilot] | Copilot through OpenCode (R-copilot Option B) |
| D7 | Fallback chains. Use the existing per-agent backup models and multi-account Codex. Add a host-wide default chain that every agent without its own chain uses, so one setting covers the crew. Close the failover gaps the code documents. | The machinery exists. What is missing is one place to set the chain, Copilot as a member, and failover on start failures. | none |
| D8 | Phone notifications on **Android** through a self-hosted **ntfy** server on the mini or the Windows PC (one URL setting), reachable only on the tailnet. The Hive host on the mini posts each notification to ntfy. The ntfy Android app (F-Droid or Play) subscribes to the topic and keeps its own connection, so neither Google Firebase nor the Worker relay is needed. A tap opens Hive through a `dev.hridaya.hive://` link. No iOS work. | No Google account, no Firebase file, no service-account key. Upstream's `apps/mobile/google-services.json` belongs to nightly-labs' Firebase project and is deleted. The host already takes the send step as an option (`send` in `src/main/push-notifications.ts:79-82`). | Firebase through the Worker's FCM relay (`apps/auth-api/src/server/android-notification-relay.ts`) |
| D9 | English only. Delete the 12 other locales (about 164K lines, 91% of `packages/i18n`). | One user, smaller build, fewer parity checks. [R-commercial §7] | Restore from `upstream` |
| D10 | **WhatsApp** is the one chat channel, through Baileys (the WhatsApp Web protocol library, npm `baileys`) running inside the host on the mini (Phase 9). The shared messaging code in `src/backend/messaging` stays. Slack, Discord and Telegram get the cheapest path: their cloud apps go in Phase 2, and their backend code stays untouched. | Upstream's channels need nightly-labs' bot registrations. Baileys needs no business account and no cloud. Risk: it is not an official client, so WhatsApp can ban the number. Use a second number if that risk matters. | The official WhatsApp Cloud API (needs a Meta business account) |
| D11 | Upstream sync is selective. Record the base SHA in `progress.md`. Cherry-pick fixes. Never merge upstream wholesale after Phase 2. | After the deletions, a merge would conflict across hundreds of files. | none |

## Open questions for Hridya (each blocks one task only)

1. **Copilot browser sign-in** (Task 3.1) and, for a second Copilot account, a second GitHub login (Task 3.3).
2. **Second Codex account sign-in** (Task 4.1). Name the ChatGPT account to use.
3. **ntfy app** on the phone (Task 7.3): install it and subscribe to the topic the agent gives.
4. **WhatsApp** (Task 9.1): scan the QR with the number to link. A second number avoids a ban risk on the main one.

Answered on 2026-11-03: paid Apple account exists but the phone is Android (iOS is out of scope); Copilot plan is Pro via GitHub Education; the name is Hive.

## External checks (what proves each phase, other than the agent)

| Phase | Check | Pass | Fail |
|---|---|---|---|
| 1 | `agent_usage_records` in Hive's `openbot.db`: uncached input of the first request of a fresh Codex agent session. Same agent setup as the baseline. | ≤ 30,000 tokens (baseline 55,217–61,370) | > 40,000 |
| 2, 5 | 15 minutes of `lsof -nP -i -a -p <Hive main pid>` while using the app (resolve `api.openbot.run`, `signal.openbot.run`, `analytics.openbot.run` with `dig +short` first), plus `git grep -n "openbot\.run\|nightly-labs" -- src packages apps` | No connection to any nightly-labs host (after Phase 5; after Phase 2 only `api.` and `signal.` remain) | Any such connection |
| 3 | A real turn on a Copilot agent: picker shows Copilot models, the turn completes, the model chosen is the model used | All three | Any missing |
| 4 | Agent with chain Codex#1 → Codex#2 → Copilot. Force a limit on Codex#1 (fake in e2e; for real, a revoked or spent account), then on Codex#2 | Agent moves #1 → #2 → Copilot with a note each time, and returns to #1 when the hold ends | Stalls, errors, or skips an entry |
| 6 | Close the MacBook lid across a routine's due time, then read the run history on the mini. `pmset -g log` on the mini shows no sleep. | Run recorded at the due time | Missed run |
| 8 | `bun run dev:bench --compare <Phase 0 report>` on the same machine, plus Phase 1's token check | Every tracked metric is the same or better, and the metrics the climb targeted improve by the recorded amounts | Any regression beyond the run-to-run spread |
| 9 | Hridya sends a WhatsApp message to the linked number from another phone | The right agent answers in the same chat, and a restart of the mini keeps the link | No answer, or a new QR scan after a restart |
| 7 | Android phone pairs with the mini by QR over Tailscale, sends a message, and gets an ntfy notification with Hive closed | All three | Any missing |

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
**Step 3:** Rerun the grep. Expected: only the constant's own definition. Then `bun run typecheck:contracts && bun run typecheck:node && bun run typecheck:mobile`. Expected: pass. Deep links are covered again end to end in Task 0.3 Step 5 (`open "dev.hridaya.hive://join?..."` brings the app forward) and in Phase 7.
**Step 4:** `bun run package`. Expected: `dist/mac-arm64/Hive.app` exists and contains no `Contents/Resources/app-update.yml`. Check with `ls`.
**Step 5:** Copy the app to the **mini** (GUI work belongs there) and launch it once. Run `open "dev.hridaya.hive://"`: the fork comes forward, upstream does not. Confirm that `~/Library/Application Support/Hive` is created and `~/Library/Application Support/OpenBot` is untouched (compare `stat -f %m openbot.db` before and after).
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

**Files:** `src/renderer/src/features/dynamic-island/dynamic-island-context.tsx:66-76` (the island is off in Hridya's settings, but this channel was still 30% of IPC calls; throttle it, do not remove the feature), `team-typing.ts:9` (`servers:set-typing`), the callers of `agent:get-usage` (3 parallel calls, 1.45 s each) and `agent:session-settings:read` (5 calls, 744 ms mean) [R-tokens runtime findings 4–5].

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

### Task 1.9: Tool descriptions at their minimum

Use the `writing-for-agents` skill. A tool description tells the model when to call the tool and what it returns. It does not teach the domain, repeat the parameter schema, or list other tools.

**Files:** `src/backend/agent/tool-catalog.ts` (`tool_search` embeds every tool name, about 4,000 characters, line 38; `request_api_key` 1,575 characters, `ask_user` 999), every tool definition the catalog collects (find with `git grep -ln "description:" src/backend/agent src/backend/*-tools.ts`), `src/backend/agent/developer-instructions.ts:263-303`, `tools/agent-context/budget.json`.

**Step 1: The guard first.** Write `scripts/tool-choice-eval.ts`: 30 prompts, each with the tool a correct agent calls first (for example "remind me at 9" → `create_routine`). Run it against a real Codex agent on the current descriptions, 3 runs each. Record the pass rate. This is the floor; a shorter description that lowers it is reverted.
**Step 2:** Rewrite one tool family at a time: one sentence for when to use it, one for what it returns, and parameter descriptions only where the name does not say it. Delete examples the schema already shows.
**Step 3:** Run `bun run check:agent-context` and the eval. Keep the family only if the eval holds and `catalog.descriptions` (39,074 bytes) and `catalog.schemas` (79,659 bytes) drop.
**Step 4:** Lower the numbers in `budget.json` to the new sizes, so a later change cannot grow them silently.
**Step 5:** Commit per family: `perf: shorter <family> tool descriptions`.

Target: half of today's `catalog.descriptions` bytes with no eval loss. Record the before and after in `progress.md`.

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

**Files:** `apps/auth-api` routes for Stripe, licences, hosted servers, compare/marketing content (about 31K lines plus 35 MB of art), `apps/site-router`, `apps/status`. **Keep:** the D1 migration files, auth, sessions, hosts, tickets, memberships, invites, and the notification relay routes (Phase 5 runs this Worker). The relay stays unused: Phase 7 sends through ntfy, and the FCM and APNs senders do nothing without keys. Delete `apps/slack-app`, `apps/discord-app` and `apps/telegram-app` (D10).
Steps: delete → `bun run typecheck:api` → `bun run test:api` → knip. Commit: `chore: strip the worker to auth and hosts`.

### Task 2.8: Repo furniture

**Files:** `CLA.md`, `.github/workflows/release.yml` and other upstream-only workflows, `scripts/{prepare-release,release-preflight,merge-mac-update-manifests,verify-update-artifacts}.ts`, the `package.json` scripts listed in [R-commercial "Commands"], `README.md` (rewrite as a short personal README; use the `readme` skill), `PRIVACY.md` (rewrite to the fork's real data flows after Phase 5), `docs/` pages for deleted features (`bun run check:doc-links` must pass).
Commit: `chore: remove upstream release and contribution furniture`.

### Task 2.9: Phase 2 check

Run the Phase 2 external check on a fresh `bun run package` build. Record the host list in `progress.md`. Then use the `code-deslop` skill on the Phase 2 diff (`git diff main...personal --stat` first).

---

## Phase 3: GitHub Copilot, first-class (D6)

### Task 3.1: Spikes with the real CLI

Run the spikes in [R-copilot "Real-CLI spikes"] in a scratch folder and record every result in `progress.md`. Install with `npm i -g @github/copilot` (check for a Homebrew formula first). Hridya does the browser step of `copilot login`. Confirm the keychain item `copilot-cli`. Capture:
1. `session/new` config options, model ids, and effort options per model.
2. Whether `set_config_option model` applies (R-copilot: 1.0.105 reports a model as current without applying it).
3. MCP over `http` (OpenBot's bridge) and over `stdio`.
4. Keychain access from a "Workspace only" (confined) agent.
5. `gh`-token fallback with no `copilot login`.
6. The exact error text of a spent premium-request allowance and of a 429. Hridya's plan is Copilot Pro through GitHub Education, which counts premium requests per month. Use a cheap way to hit a limit (a burst of requests), or wait for a real one and record it then.
7. **Multiple accounts:** does `COPILOT_HOME=<dir> copilot login` keep a separate login, or do all homes share one keychain item? Look for a file-storage switch (like Antigravity's `AGY_ACP_FORCE_FILE_STORAGE`, `provider-drivers.ts:241-246`) in `copilot --help` and the docs.

### Task 3.2: The provider

**Files:** The table in [R-copilot "Files to touch"]. Template: the Hermes driver (`src/backend/provider-drivers.ts:1164-1224`, `src/backend/cli.ts:444`).

**Step 1: Failing test.** Add a `DriverCase` for `copilot` to `scripts/provider-conformance-e2e.ts` and a fake in `scripts/provider-fakes/agents/conformance.ts`. The fake reproduces "model reported as current but not applied". Run `bun scripts/provider-conformance-e2e.ts`. Expected: FAIL (`copilot` is not a provider).
**Step 2:** Add `"copilot"` to `AGENT_PROVIDERS`, its descriptor (`LOCAL_ONLY_PROVIDERS`, `reportsUsage: false`, `steer: "deferred"`, `concurrentTurns: false`, `defaultModel: ""`, `pickerOrder`), the `AgentAuthState` arm, `resolveCopilotCli` with `MINIMUM_COPILOT_VERSION` from the spike, and the driver row with `signIn` (`copilot login`) and `codeSignIn` (device flow; teach `src/backend/agent/cli-code-login.ts` Copilot's device-code lines from the spike).
**Step 3:** Add `alwaysSetModel?: true` to `AcpFlavor` (`src/backend/acp-flavor.ts`). Read it at `src/backend/acp-configuration.ts:351`. Name the Copilot version that needs it in the code comment (an external constraint, the allowed kind of comment).
**Step 4:** `copilotStatePaths()` in `src/backend/process-confinement.ts` only if spike 4 showed the keychain works when confined. Otherwise mark Copilot as full-access only in the descriptor.
**Step 5:** Run the conformance e2e. Expected: PASS.
**Step 6:** Logo variant and colours (`packages/brand`), the onboarding picker map (`SetupProviderPicker.tsx:126`) and settings rows, English strings only. Look at the provider settings and model picker on the mini (screenshot into `progress.md`).
**Step 7:** Commit: `feat: github copilot provider`.

### Task 3.3: Copilot accounts (only if spike 7 passed)

**Files:** `src/backend/provider-drivers.ts` (Copilot driver row): `accounts: { homeVariable: "COPILOT_HOME", signIn: <copilot login>, signOut: <only if a logout command exists> }`, plus any storage switch the spike found in `accountEnvironment`. Template: the Codex row (`provider-drivers.ts:768-790`).
**Step 1: Failing test:** extend the Copilot `DriverCase` with a second account and assert each account's process gets its own `COPILOT_HOME`. FAIL. **Step 2:** Implement. **Step 3:** PASS. **Step 4:** Commit: `feat: multiple copilot accounts`.
If spike 7 failed, record "one Copilot account" in `progress.md` and skip this task.

### Task 3.4: Limit text and terms

**Files:** `src/backend/agent/provider-diagnostics.ts:247`, `scripts/provider-cli-canary.ts:50`, `docs/provider-terms.md`.
Add one narrow regex from spike 6's real text. Do not invent the text: if no real text exists yet, leave a `TODO`-free note in `progress.md` and rely on the generic failover causes (`rate_limit`, `billing`), which already fail over when a turn did no work. Add a "GitHub Copilot" section to `docs/provider-terms.md` per [R-copilot "Terms text"]. Commit: `feat: copilot limits and terms`.

---

## Phase 4: Fallback chains (D7)

Goal: one setting gives every agent a chain such as Codex account 1 → Codex account 2 → Copilot, and failover happens in every case where the turn did no work yet.

### Task 4.1: Second Codex account

**Files:** none (configuration).
In Hive: Settings › Providers › Codex › add an account. Hridya signs in with the second ChatGPT account in the browser. Check that the account gets its own `CODEX_HOME` folder in Hive's provider state, and that the rail shows usage for both accounts. Record the account ids (`list_models` lists them) in `progress.md`.

### Task 4.2: Host-wide default chain

**Files:** Modify the host settings store in `src/main` that holds host-wide agent defaults (find it from where `DEFAULT_AGENT_ACCESS` or new-agent defaults are applied: `git grep -n "DEFAULT_AGENT_ACCESS" src`); `src/backend/agent-service.ts` (`#usageLimitMove`) and `src/backend/agent/usage-limit-gate.ts` (read `agent.backupModels ?? hostDefaultBackupModels`); `packages/contracts/src/ipc-agents.ts` (reuse `AgentBackupModels` and `isAgentBackupModels`; no new shape); the providers settings page (reuse the per-agent backup-model editor component; find it with `git grep -ln "backupModels" src/renderer packages/ui`); preload decoder and `src/renderer/src/preview/mock-openbot.ts` (required for IPC changes by `src/main/AGENTS.md`).

Rules: an agent's own chain wins. `null` on the agent means "use the host default". An entry whose account was removed is skipped, the same way the per-agent list skips it today. No database migration: store the default in the host settings JSON file, not in `openbot.db`.

**Step 1: Failing test.** Copy `scripts/backup-model-failover-e2e.ts` to a new case in the same script (`bun run test:backup-model-failover`): an agent with **no** backup models, a host default of `[codex/acct-2, claude-standin]`, and a forced overload on the first model. Expect the move to the host default's first entry. Run it; expected FAIL (the agent fails with its error).
**Step 2:** Implement the fallback read and the setting. **Step 3:** Run; PASS. Also rerun the script's five existing checks; all PASS.
**Step 4:** Add the "Fallback order" editor to Settings › Providers. Look at it on the mini.
**Step 5:** Commit: `feat: host-wide fallback chain`.

### Task 4.3: Fail over when a provider will not start

**Files:** `src/backend/agent/turn-lifecycle.ts:101-108,892` (`FAILOVER_CAUSES` and its check), the drain path that handles a refused `turn/start` and a provider start failure (find from `providers.md` "do not fail over" and `git grep -n "turn/start" src/backend/agent`).

Today a refused `turn/start` and a provider that fails to start do not fail over (`docs/architecture/providers.md`, "Backup models and failover"). Both happen before any work, so they are safe to move: the same `!acted` rule holds. Keep channel tasks out of scope; upstream excludes them on purpose, and Hridya's crew does not use channels.

**Step 1: Failing test.** Add two cases to `scripts/backup-model-failover-e2e.ts`: the stand-in CLI exits at start for the failing model; and the stand-in refuses `turn/start` with an authentication error (the revoked Codex login seen in Hridya's logs on 2026-11-03). Expect a move to the backup with a note. FAIL.
**Step 2:** Route both failures through the same `UsageLimitGate.failed` path with cause `provider_unavailable` or `authentication`. Mark the model failed for the same 10 minutes.
**Step 3:** PASS, plus the earlier cases. **Step 4:** Commit: `feat: fail over on provider start failures`.

### Task 4.4: Routine runs fail over

**Files:** read `src/backend/agent/drain-scheduler.ts:747` (`startRoutineThread`).
**Step 1:** Add a case to `scripts/backup-model-failover-e2e.ts`: a routine run on an agent whose first model is overloaded. Expected today: unknown. Run it.
**Step 2:** If it fails over, record that and stop. If not, route routine runs through the same gate, then rerun. Commit only if code changed: `feat: routine runs fail over`.

### Task 4.5: Apply the chain to the crew

Set the host default chain to Codex account 1 → Codex account 2 → Copilot (Hridya may reorder). Clear per-agent chains on the crew agents so the default applies. Run the Phase 4 external check with the real accounts only when a limit happens naturally; do not burn an account on purpose.

---

## Phase 5: Private control plane, nothing to upstream (D4)

Start with the spike. If the spike fails twice for different reasons, stop and record why. Then choose between A1 (Hridya's own Cloudflare account) and Option B with Hridya. Do not start B without Hridya.

### Task 5.1: Spike: Worker and Signal on the mini

**Files:** none in the repo. Scratch notes in `progress.md`.

**Step 1:** On the mini (shell through the cua Space `mini`), check Tailscale: `tailscale status` and `tailscale cert` support (MagicDNS on).
**Step 2:** Run the Worker locally with its dev stack (`apps/auth-api` `bun run dev`, or `scripts/dev-services.ts api`, which uses local D1 and R2: `scripts/dev-services.ts:300-441`). Run Signal with `bun src/index.ts` in `remote/api` and `REMOTE_TLS_DISABLED` (`remote/compose.dev.yaml`).
**Step 3:** Expose both with `tailscale serve` HTTPS. The desktop needs HTTPS or loopback (`central-auth-manager.ts:2025-2032`). The phone app accepts `http:` only for loopback and RFC 1918, not `100.64.0.0/10` (`mobile-connect.ts:137-149`). So HTTPS on `<mini>.<tailnet>.ts.net` is required.
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

Run the Phase 5 and Phase 2 external checks (no `*.openbot.run` at all now). Rewrite `PRIVACY.md` to the real flows: the providers, visited pages, the mini, and the ntfy server on the mini after Phase 7. Commit.

---

## Phase 6: The mini runs the routines (D5)

### Task 6.1: The mini as host

**Files:** none (configuration), `ops/mini/README.md` (document it).
Follow [R-multihost "Milestone 1"] steps 1–4 with the fork build. The agents come from the **upstream** app on the MacBook (Hridya's live crew): Export there, Import into the fork on the mini. Then: install on the mini, launch at login, keep awake, auto-login, restart after power failure, "Prevent automatic sleeping" on power. Sign in Codex (both accounts) and Copilot on the mini through the app, and set the host default chain (Task 4.2) there too, since the chain is per host. Move the crew's routine agents with Server settings › Transfer (chat history does not move). Pause the same routines on the MacBook. Set `missedPolicy` per routine: `skip` for time-bound jobs, `run-once` for the hackathon sweep.

The crew's instructions are linked by `~/honey/openbot-crew/install.sh`, which reads `~/Library/Application Support/OpenBot/openbot.db`. On the mini, point it at `Hive` (one variable at the top of the script), clone `~/honey/openbot-crew` there, and run it. Check each agent workspace has its `AGENTS.md` link.

### Task 6.2: The MacBook joins the mini over Tailscale

With Phase 5 done, joining works through the private control plane and Signal. Join from the server rail. Keep "Local" on the MacBook for MacBook-only agents (for example a T3 Code operator).
Check: run the Phase 6 external check.

### Task 6.3: MacBook-only tools from mini agents

T3 Code runs on the MacBook (`http://127.0.0.1:3773/mcp`, loopback). To reach it from the mini, Hridya runs `t3 up` / T3 Connect or Tailscale HTTPS for T3 (T3's docs: plain `http` tailnet addresses cannot complete MCP OAuth). Then add an MCP server row on the mini with the HTTPS URL. This is configuration only. When the MacBook sleeps, those tools fail. The agent instructions must say "if T3 is unreachable, say the MacBook is asleep and stop".

### Task 6.4 (optional): Address-based join without Signal

Only if Phase 5's Signal proves unreliable. Follow [R-multihost "Milestone 2"]: a fixed `preferredPort` (`listen-loopback.ts:10-18`, `team-api-server.ts:497`), `tailscale serve` to that port, and a new optional Team API capability for password join. Do not change the meaning of an existing capability.

### Task 6.5: All hosts in one place, and agents that move

Goal: Hridya picks the host per agent for convenience. Badminton Booker lives on the mini. Coding Manager lives on the MacBook, next to T3 Code.

**Files:** the server rail and agent list in `src/renderer` (start from `activeServer()` uses, `src/renderer/src/features/conversation/WorkspaceConversation.tsx:288,348,582`), `src/backend/agent-service.ts` (agent create path), the Team API agent routes (add a new optional capability; do not change a released protocol).

**Step 1:** One agent list for all hosts. Each row shows its host. Opening an agent switches to its host without a second click. Unread counts and running state come from every joined host, not only the active one.
**Step 2:** "Move to <host>": the client reads the agent's settings, instructions, routines, MCP servers, backup models and workspace files from the source host, creates the agent on the target host through the new Team API capability, and then removes it from the source only after the target confirms. Conversation history stays on the source host as a read-only archive. Secrets and provider sign-ins do not move; the target uses its own accounts.
**Step 3: Test first.** An e2e with two host processes (copy the two-host setup of `scripts/remote-sync-perf-e2e.ts`): move an agent with one routine, then check the routine is on the target, gone from the source, and fires on the target. FAIL before Step 2, PASS after.
**Step 4:** Look at the list and the move dialog on the mini. Commit: `feat: agents across hosts`.

---

## Phase 7: Android app, personal build (D8)

Build and emulate on the Windows PC (`ssh win-pc`; AVD `Pixel_API_37`; SDK `D:\Android\Sdk`). Install on Hridya's phone with `adb install` over wireless debugging, or by copying the APK.

### Task 7.1: Identity

**Files:** `apps/mobile/app.json` (`android.package` → `dev.hridaya.hive`, scheme from `fork.config.json`, app name), `apps/mobile/app.config.js:8-13` (keep the optional `google-services.json` logic), `apps/mobile/eas.json` (drop the Play release profile), `apps/mobile/package.json:124-125` (delete `android:release:play`), the Android module namespaces only if the build requires it (`apps/mobile/modules/*/expo-module.config.json`, for example `share-files:7`). Delete upstream's `apps/mobile/google-services.json` (nightly-labs' Firebase project).
Check: `bun run typecheck:mobile`. Commit: `feat(mobile): hive identity`.

### Task 7.2: Debug build on the emulator

On `win-pc`: clone or sync the repo, `bun install --frozen-lockfile`, then `bun mobile:android` (debug, `scripts/mobile-android.ts`). Pair with a Hive desktop on the mini by QR (the emulator reaches the mini through the PC's Tailscale). Open an agent and send a message. Use T3 Device tools on `win-pc` for screenshots, and look at each screen.

### Task 7.3: Notifications through ntfy on the mini

**Files:** `src/main/push-notifications.ts` (the `send` option, lines 79-82, and `#send`, lines 405-440), the place in `src/main/index.ts` that builds `PushNotificationService` (find with `git grep -n "new PushNotificationService" src/main`), host settings for the ntfy URL and topic, `PRIVACY.md`.

Design: when the host has an ntfy URL and topic, it sends the plain title and body to ntfy with an HTTP `POST`, with a `Click` header that holds the `dev.hridaya.hive://` link to the agent. It keeps upstream's rules for who is away, levels per agent, and resend delays. Plain text is acceptable because ntfy, the host and the phone are all on Hridya's tailnet. Protect the topic with an ntfy access token. Keep the token in envsync (`envsync set HIVE_NTFY_TOKEN`), never in git.

**Step 1:** Install ntfy on the mini (`brew install ntfy`, launchd service) or on the Windows PC (the Windows binary, as a service with `nssm` or Task Scheduler). Prefer the machine that stays on. Run `ntfy serve` bound to `127.0.0.1`, with `auth-default-access: deny-all`. Publish it with `tailscale serve`. Create one user and one token. Check with `curl -H "Authorization: Bearer $TOKEN" -d test https://<mini>.ts.net/<topic>` from the MacBook. The command must succeed, and the same command with no token must fail with 403.
**Step 2: Failing test.** Extend `scripts/push-notification-away-e2e.ts` with a fake ntfy endpoint. The member is away and an agent finishes a turn. Expect one `POST` with the agent name as the title and the answer as the body. FAIL.
**Step 3:** Implement the ntfy send. **Step 4:** PASS, with the existing away and level cases.
**Step 5:** Hridya installs the ntfy app and subscribes to `https://<mini>.ts.net/<topic>` with the token, with instant delivery on. Lock the phone, finish a turn on the mini, and confirm that the notification arrives and a tap opens Hive on that agent.
**Step 6:** Commit: `feat: notifications through ntfy`.

### Task 7.4: Release APK on the phone

Create a release keystore on `win-pc`; keep its password in envsync (`envsync set HIVE_ANDROID_KEYSTORE_PASSWORD`), never in git. Build with `bun mobile:android --variant release`. Install on Hridya's phone. Run the Phase 7 external check on the real phone.

---

## Phase 8: Performance hill-climb

Use the `performance` skill. A climb is a loop: measure, change one thing, measure again, keep it only if it wins beyond the run-to-run spread, else revert. Record every attempt in `progress.md`, the losers too.

### Task 8.1: The scoreboard

**Files:** `scripts/dev-automation/bench.ts` (already measures RAM, CPU, start-up marks and renderer work, with `--compare`), `scripts/remote-sync-perf-e2e.ts` (`bun run perf:remote`), `scripts/web-client-perf-e2e.ts` (`bun run perf:web`), Phase 0's token script.

Add the metrics the bench lacks, each as a number in the bench report:
1. Time from send to first streamed token on a fake provider (app overhead only, with the provider time removed).
2. Main-process event-loop delay p99 during a 3-agent burst.
3. IPC messages per second while idle and while one agent streams.
4. Idle CPU and RAM of the whole process tree after 10 minutes, including each provider child process.
5. Cold start to interactive, and warm reopen.
6. First-request tokens and tokens per follow-up turn (from Phase 0).

Run the full scoreboard 5 times on the Phase 0 build and save it as the baseline report. Record the spread of each metric.

### Task 8.2: Climb

Work from the largest measured cost down. Profile before each change (CPU profile of the main process with `--cpu-prof`, a renderer trace through CDP, `sample` on provider children). Candidates from the research, to confirm or reject with numbers: the 16.4 MB eager renderer load, IPC chatter (Task 1.7), one provider process per agent against a shared one (Task 1.1), SQLite writes on every streamed delta, and polling loops in the host. One change per commit: `perf: <what> (<metric> <before> → <after>)`.

Stop a target when three attempts in a row give less than 2% each. Run the climb after Phase 2 (less code to measure) and again after Phase 7.

### Task 8.3: Lock the wins

Turn each kept win into a budget the bench fails on (start from `tools/agent-context/budget.json` as the pattern), so a later change cannot lose it.

---

## Phase 9: WhatsApp (D10)

### Task 9.1: Spike

In a scratch folder on the mini, install `baileys` with Bun and link a WhatsApp account by QR. Record in `progress.md`: does Baileys run under Bun 1.4.2 or only under Node; where it stores its auth state (use the multi-file auth state in Hive's data folder, never in git); reconnect after a network drop and after a mini restart; text, images, voice notes, replies and reactions in and out; group messages.

### Task 9.2: The adapter

**Files:** Create `src/backend/messaging/whatsapp/` with a transport and an adapter that implement `MessagingTransport` and `MessagingAdapter` (`src/backend/messaging/messaging-types.ts:136-224`). Template: `src/backend/messaging/telegram/` (1,102 lines), but the transport talks to WhatsApp directly from the host, with no relay. Modify `MESSAGING_PLATFORMS` (`packages/contracts/src/ipc-messaging.ts:15`), `messagingPage` (line 185), and the channel settings UI. If Task 9.1 shows Baileys needs Node, run it as a child process of the host over stdio, the same way provider CLIs run.

**Step 1: Failing test.** A fake Baileys socket in the style of the provider fakes: an inbound text reaches the bound agent, and the answer goes back to the same chat. FAIL.
**Step 2:** Implement the transport (connect, QR state to the UI, reconnect with backoff, auth state on disk) and the adapter (post, edit if WhatsApp allows it, react, upload, download, history from the local store).
**Step 3:** PASS. **Step 4:** Only Hridya's own number and chosen chats can reach an agent: an allowlist of chat ids, default empty. A message from any other chat is dropped and logged as a count only.
**Step 5:** Link the real account on the mini, bind it to Chief of Staff, and run the Phase 9 external check. Commit: `feat: whatsapp channel`.

---

## Execution notes

- **Order:** 0 → 1 → 2 → 8 (first climb) → 3 → 4 → 5 → 6 → 7 → 9 → 8 (second climb). Phase 9 needs only the mini host from Phase 6. Phases 1 and 3 touch different files and can run in parallel worktrees (`git worktree add ../hive-phase1 personal`); merge 1 first. Phase 4 needs Phase 3 (Copilot in the chain). Phase 5 needs Phase 2. Phases 6 and 7 need Phase 5.
- **After each phase:** use the `code-review` skill (thermo-nuclear mode) on the phase diff, then `code-deslop`. Record findings and fixes in `progress.md`.
- **Visual checks:** after Phases 2, 3 and 4, look at the settings, provider and server-rail screens on the mini (`computer-use` skill). After Phase 7, look at the phone screens on `win-pc`. Record screenshot paths in `progress.md`.
- **Stop and ask Hridya** only for: the Copilot and second Codex sign-ins, the WhatsApp QR scan and which number to use, the Phase 5 fallback choice, the ntfy app on the phone, and any step that would touch `~/Library/Application Support/OpenBot` (the live upstream data).
