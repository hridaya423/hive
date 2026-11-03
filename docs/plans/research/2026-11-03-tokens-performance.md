# Research: per-turn token overhead and runtime performance

Repo: `/Users/hridyaagrawal/honey/openbot` at `de784cee2`. Installed app: `/Applications/OpenBot.app` 0.59.0.
Date: 2026-11-03. No repo code was changed. Throwaway scripts are in `/private/tmp/openbot-measure/`.
`openbot.db` was opened read-only (`mode=ro&immutable=1` through Python `sqlite3`; the `sqlite3` CLI could not open it).

How to read the numbers:

- **Measured** = observed this session, with the command shown.
- **Hypothesis** = not observed. Each one names the test that would settle it.
- Token counts: `tiktoken` `o200k_base` on the exact text from the Codex rollout files. For the same
  requests the API reported 15 to 20% fewer tokens (ratio 1.18 to 1.22 on 7 of 7 first requests).
  Treat absolute token counts below as upper bounds. Treat shares as reliable. "API-equivalent" below
  means the o200k count multiplied by 0.84.

## Summary

1. A fresh Codex session of an OpenBot agent sends 55,000 to 61,000 input tokens before the user types anything (measured: 7 of 7 first requests in `agent_usage_records`, mean 56,522). A Codex session outside OpenBot sends 25,297. OpenBot adds about 30,000.
2. The largest single item is not OpenBot text. It is the 58 `computer_use` MCP tool schemas from the bundled cua-driver: 26,443 o200k tokens, about 22,000 API-equivalent, 41 to 48% of every request. It is on by default for every agent (`ipc-agents.ts:45`) and Codex gets all 58 tools with no `enabled_tools` filter (`mcp-provider-shapes.ts:719`).
3. OpenBot's own text is already small and already under a CI budget (`bun run check:agent-context`): instructions 3,244 tokens, 15 visible tools 2,948 tokens. Further trimming there saves at most about 1,500 tokens. The ranked list therefore starts outside that budget.
4. Real usage: 39 requests, 2.35 M input tokens, 2,441 output tokens (960 to 1). 69% of the money went to the 7 cold first requests; 85% of input tokens were cache reads. A model step of an agent turn re-reads 52,000 to 71,000 tokens to write about 62.
5. Runtime: with 5 idle agents the app held 5.3 GB RSS in 40 processes; 3.6 GB of that is Codex (39 processes, one `codex app-server` tree per agent because each agent has a provider account). Main process idle CPU is 0 to 1% with 2 to 3 ms event loop p99, so CPU is not the problem. Memory and the renderer's 16.4 MB eager bundle are.

## Measurements

### M1. What a Codex agent session sends (first request, agent `Chief of Staff`)

Source: `~/.codex/sessions/2026/11/03/rollout-2026-11-03T14-10-12-01a1a1bf-04ef-7da2-9f36-f3b76448ac88.jsonl`
(OpenBot's Codex writes its rollouts to `~/.codex`). Command:
`python3 /private/tmp/openbot-measure/breakdown.py <rollout>` (script in the scratch folder, uses `tiktoken`).
API-reported input for this request: **55,217** tokens, 0 cached (`token_usage_record`, line 18).

| Component | Owner | Chars | o200k tokens | Share of o200k total |
|---|---|---:|---:|---:|
| `mcp__computer_use` namespace, 58 tools | OpenBot (cua-driver MCP) | 121,601 | 26,443 | 40% |
| Codex skills block (inside developer message) | Codex, from `~/.codex` and `~/.agents/skills` | 37,902 | 9,018 | 14% |
| `functions` namespace (`exec` code mode, `wait`, `request_user_input*`) | Codex | 28,310 | 7,070 | 11% |
| OpenBot developer instructions (`developerInstructions()`) | OpenBot | 15,018 | 3,244 | 5% |
| `openbot` namespace, 15 tools | OpenBot | 13,326 | 2,948 | 4.5% |
| Codex `base_instructions` | Codex | 21,511 | 4,283 | 6.5% |
| Codex developer message ("You are Codex...") | Codex | 21,197 | 4,084 | 6% |
| User `~/AGENTS.md` injected as user message | User | 8,508 | 2,054 | 3% |
| Codex approved command prefix rules | Codex, from `~/.codex/rules` | 5,118 | 1,581 | 2.4% |
| `collaboration` namespace + `multi_agent_*` messages | Codex | 5,357 + 2,671 | 1,199 + 582 | 2.7% |
| `mcp__cua_repl` namespace (2 tools) | User's Codex plugin | 4,461 | 1,098 | 1.7% |
| Codex permissions boilerplate | Codex | 3,899 | 803 | 1.2% |
| `image_gen` namespace | Codex | 3,054 | 650 | 1% |
| Codex recommended plugins + collaboration mode | Codex | 1,726 | 392 | 0.6% |
| `clock` namespace | Codex | 527 | 112 | 0.2% |
| Sum | | | about 65,600 | |

The sum is 1.19 times the API figure (55,217). Across 7 first requests the ratio is 1.18 to 1.22. The
`session_meta.dynamic_tools` copy of the `openbot` tools (3,157 tokens) is not in the sum; it looks like metadata
(hypothesis: the API does not bill it twice; the ratio supports that).

Baseline without OpenBot: two Codex sessions in the same folder that are not OpenBot agents
(`rollout-2026-11-03T14-10-43-...-7c0e-...jsonl` and `rollout-2026-11-03T14-10-52-...-a087-...jsonl`, started at the same time by another tool) report
**25,297** first-request input tokens, with no `computer_use`, no `openbot` namespace and no OpenBot text.
OpenBot adds about 30,000 API tokens: about 22,000 from Computer Use, 2,500 from the `openbot` tools, 2,700 from its
text, and the rest from Codex text that grows with OpenBot's setup (see M3).

Cross-check, `agent_usage_records` (Python read-only; see `/private/tmp/openbot-measure/q.py`):

```
python3 -I q.py "select ... from agent_usage_records order by occurred_at"
```

| Session first request | uncached | cached |
|---|---:|---:|
| agent 2e21, session 4a71 | 55,217 | 0 |
| agent 6b66 | 57,023 | 0 |
| agent 1bfc | 19,668 | 37,376 |
| agent 59ab | 19,629 | 37,376 |
| agent 2009 | 57,021 | 0 |
| agent 2e21, session a998 | 50,973 | 0 |
| agent 2e21, session fa86 | 61,370 | 0 |

All 7 are `codex`, model `gpt-6.1-terra`. The two cache hits of 37,376 tokens (292 blocks of 128) show that
some cross-session prefix sharing happens. 5 of 7 got none (hypothesis: concurrent starts and cache routing; the
test is to start the same agent twice 30 s apart and compare).

### M2. Cost shape of real usage

Command: Python aggregate over `agent_usage_records` (inline script in this session; same query shape as `q.py`).

| Metric | Value |
|---|---:|
| Requests / sessions | 39 / 7 |
| Uncached input / cached input / output | 360,168 / 1,987,968 / 2,441 |
| Cache-read share of input | 84.7% |
| Estimated cost (field `estimated_cost_usd`) | $0.472 |
| Cost of the 7 first requests | $0.327 (69%) |
| Mean input of a later request | 61,015 tokens, 62 output |
| Rates implied by the records | uncached $1.00 /M, cached $0.05 /M, output $5.00 /M |

Reading: dollars are small. The pattern matters: every model step re-sends the whole prefix. A turn that makes
14 tool calls (session a998 had 14 requests in one turn) processes about 14 x 55,000 = 770,000 input tokens to write
about 1,300. The prefix is the lever. Limits (plan usage limits) may count cached reads (hypothesis).

### M3. Skills and duplication

- `ls ~/.agents/skills | wc -l` = 92 (90 with `SKILL.md`). Codex lists them itself, in its own block of 9,018 tokens
  (rollout lines 43 to 171 of the developer message). OpenBot does not list them for Codex because
  `homeSkills: "native"` (`packages/contracts/src/agent-providers.ts:215`).
- The same skills block was sent again as a new developer message at the second turn of this thread
  (rollout item 23, 40,431 chars, 10,803 o200k tokens). That turn's first request was 11,382 uncached tokens on
  top of 55,040 cached. The same repeat shows at items 780 and 1860 of the long T3 Code session. So it is
  Codex behavior on a new turn, not OpenBot (cause not verified; hypothesis: the skills catalog is re-rendered when
  `thread_settings_applied` fires).
- For providers with `homeSkills: "instructions"` (antigravity, muse, hermes, acp) OpenBot lists up to 100 skills with
  300 characters each. Simulated with this user's 90 skills in OpenBot's line format
  (`- slug: description (absolute path)`, `developer-instructions.ts:390`): 27,548 chars, **6,686 tokens**.
  Command: inline Python in this session, same parsing as `developer-instructions.ts:379-393`. This user's agents
  are all Codex, so they do not pay this.

### M4. Per-turn growth in a real turn

From the same rollout (first request, `create_agent` x4 turn):

| Item left in context for the rest of the thread | o200k tokens |
|---|---:|
| First `tool_search` result (3 queries) | 3,429 |
| Second `tool_search` result | 921 |
| Each `create_agent` result | 209 to 225 |
| The user message | 363 |

8 requests for the turn; 2 of them were discovery steps (`tool_search`), 25% of the steps, each re-reading the
55,000 to 70,000 token prefix.

### M5. Runtime resource telemetry (OpenBot's own monitor)

Source: `~/Library/Application Support/OpenBot/logs/resources.ndjson` (66 one-minute samples, 13:22 to 14:28,
three app launches) and `openbot-resource-summary-v1.json`. OpenBot was not running when measured (`ps -axo ... | grep -i openbot`
returned nothing), so these are the app's own recorded values, not a fresh `top`.

| Metric | Idle, no agents | 5 Codex agents idle (14:22 to 14:28) | Peak of the day |
|---|---:|---:|---:|
| Total RSS | 1,312 MB | 5,277 to 5,321 MB | 5,321 MB |
| Main process RSS | 680 MB | 674 MB | 694 MB |
| Renderer window RSS | 423 MB | 600 MB | 782 MB |
| GPU process RSS | 125 MB | 147 MB | 156 MB |
| Utility RSS | 58 MB | 109 MB | 110 MB |
| Database host RSS | n/a | 130 MB | 126 MB |
| Codex tree RSS | 0 | 3,594 MB in 39 processes (about 720 MB per agent) | 3,597 MB |
| Total CPU % | 0 to 3 | 0 to 5 | 21 (during 5 agents starting) |
| Main loop p99 | 2 to 3 ms | 2 to 5 ms | 10 ms (max 189 ms at launch) |
| Provider processes | 1 to 2 | 39 | 40 |
| DB statements in a sample | 0 | 0 to 6 (max 1 ms) | max 202 ms once |

At 14:10:24 to 14:11:24, Codex went from 7 to 32 processes when 5 agents started (about 6 new processes per
agent). Codex RSS stayed flat at about 3.6 GB while idle: the 10 minute idle release
(`PROVIDER_IDLE_RELEASE_MS`, `provider-runtime.ts:139`) had not elapsed in the 7 minutes observed.
`providers.log` shows `"account":true` for all 5 agents ("Started an agent's own provider process"), so each agent
runs its own app-server because it has a provider account (`provider-runtime.ts:2364`).
Process content per agent (hypothesis, from `ps` of the same Codex 0.166.0 on this Mac: `codex app-server` 644 MB,
`codex-code-mode-host` 128 MB, plugin `node` servers 38 to 58 MB, cua proxy): app-server + code-mode host + MCP/plugin servers.

### M6. IPC and trace (OpenBot's own trace)

Source: `~/Library/Application Support/OpenBot/logs/trace.ndjson`, 2,505 rows, 13:21:44 to 14:28:59 (67 min).
Command: inline Python in this session over the NDJSON.

| IPC call | Count | Note |
|---|---:|---|
| `dynamic-island:publish-presentation` | 753 (30% of all IPC) | 222 in the busiest minute (14:10); one call per scoped agent event, coalesced only per microtask (`dynamic-island-context.tsx:66-76`, `:98-121`) |
| `servers:set-typing` | 229 | up to 98 in one minute; one IPC per call, no throttle in `team-typing.ts:9` (cause not traced; hypothesis: one per keystroke or focus change) |
| `agent:channels:list` | 160 | mean about 0 ms |
| `browser:set-visible` + `browser:picture-in-picture-close` | 76 + 75 | |
| `agent:list-installed-skills` | 50 | mean 31 ms |
| `computer-use:get-state` | 38 | mean 110 ms, max 440 ms |

Slow calls: `agent:get-usage` 16 calls, mean 485 ms, three at the same instant took 1.45 s each at 13:25:08;
`hosted-servers:list` 21 calls, mean 284 ms; `agent:session-settings:read` 5 calls, mean 744 ms;
`remote-desktop:check-setup` 2 calls, max 5.0 s; `license:get-state` 6 calls, mean 273 ms;
`voice:speak` 11 calls, mean 921 ms. 42 of 2,487 IPC calls took over 500 ms.

Turn rows: 12 `user` turns, durations 0.4 s to 85.7 s; 5 of 12 ended `failed` (14:10:56 to 14:15:59).
`providers.log` has `api/wham/usage failed: 401 ... token_revoked` (see Open questions).

### M7. Database and event volume

Python read-only on `openbot.db`: 1,654,784 bytes; `orchestration_events` 190 rows, 160,093 bytes of payload.
`conversation.snapshot-updated` 73 rows (109,162 bytes, max 8,891 bytes); `usage.recorded` 39; `response.delta-flushed` 14.
About 16 events per turn. SQLite writes are not a cost at this scale (hypothesis for a user with long history: the snapshot payload grows with the thread).

### M8. Bundle and startup

| Item | Value | Command |
|---|---:|---|
| `/Applications/OpenBot.app` | 950 MB | `du -sh /Applications/OpenBot.app` |
| `app.asar` | 375 MB (extracted `node_modules` 440 MB) | `du -sh`; `npx @electron/asar extract` |
| `app.asar.unpacked` / `cua-driver` | 47 MB / 70 MB | `du -sh` |
| Main bundle `out/main/index.js` | 20.0 MB, one file | `ls` |
| Renderer `out/renderer/assets` | 34 MB, 361 files | `du -sh` |
| Eager renderer load (entry + 96 `modulepreload`) | **16.39 MB, 97 files (15.15 MB JS)** | Python over `index.html` |
| Largest eager chunks | `styles-*.js` 7.16 MB, `index-*.js` 3.21 MB, `Schema-*.js` 2.74 MB | `ls -S assets` |
| Lazy chunks (not in `index.html`) | `elk` 2.6 MB, `cytoscape` 0.87 MB, `WorkflowsPage` 0.5 MB, `katex` 0.5 MB x2 | |
| Parse cost (V8 pre-parse only, Node 26, not Electron) | main 160 ms, `styles` 44 ms, `index` 31 ms | `node --experimental-vm-modules parse2.mjs` |

Pre-parse is not the startup cost (hypothesis). Full cold start, time to first window and `workspace-ready` were not
measured: they need the built app on an isolated profile (`bun run dev:bench`, M-T below), and AGENTS.md says to drive GUIs on the Mac mini.

### M9. Timers and polls

`grep -rn "setInterval(" src packages/ui/src` (stories and tests excluded). Main process and backend, with period:

| Timer | Period | File |
|---|---:|---|
| Computer Use highlight window poll | 33 ms (only while the overlay is up; idle overlay 60 s) | `src/main/computer-use-highlight-window.ts:22` |
| Browser picture-in-picture hover poll | 150 ms | `src/main/browser-picture-in-picture.ts:28` |
| Server memory sample | 5 s | `src/main/server-memory.ts:7` |
| Resource monitor / machine alerts / hosted activity | 60 s | `resource-monitor.ts:46`, `machine-alerts.ts:21`, `hosted-server-activity.ts:11` |
| Provider idle check / GitHub token refresh | 60 s | `provider-runtime.ts:145`, `github-connector-service.ts:49` |
| Provider update check | 1 h | `provider-runtime-manager.ts:145` |

Renderer: messaging connector poll 3 s (`messaging-connector.ts:97`), machine resources 60 s, usage refresh check 30 s,
`ContextUsage` clock 250 ms, several 1 s clocks (`activity-store.ts:281`, `Subagents.tsx:46`, `AgentActivity.tsx:196`).
Measured effect: idle main CPU 0 to 1%, loop p99 2 to 3 ms (M5). None of these is a measured problem.

## Ranked opportunities

Token numbers are per model request, API-equivalent (o200k x 0.84), and apply to every request of a Codex session
that has the item. "Cold" = first request of a session (uncached, $1.00 /M). "Warm" = later request ($0.05 /M).
All of them are hypotheses until re-measured with the rollout script after the change.

| # | Change | Saves per request | Where | Risk |
|---:|---|---:|---|---|
| 1 | Do not hand all 58 Computer Use tools to Codex. Best: lazy (the model finds them through `tool_search`, or the agent turns CU on per task). Cheaper: `enabled_tools` allowlist of the 27 core GUI tools | 22,200 (lazy) or 9,400 (allowlist, drops 31 tools) | `thread-lifecycle.ts:1040-1042` (`#agentMcpServers`), `mcp-provider-shapes.ts:172-174` and `:719-731` (`codexMcpServers`, no `enabled_tools` key today), `ipc-agents.ts:45-47` (default on), `cua-driver-runtime.ts:375-406`, text at `developer-instructions.ts:343-347` | Medium. GUI tasks need `start_session`/`get_window_state` in view. Codex 0.166.0 has `enabled_tools`/`disabled_tools` per MCP server and the features `tool_search` and `tool_search_always_defer_mcp_tools` (strings found in the binary; behavior not run). The fingerprint folds MCP entries (`computer-use.md`), so a change replaces sessions once. |
| 2 | Drop the 11 cua-driver `browser_*`/`get_browser_state`/`page` style tools (OpenBot has its own browser and the prompt forbids other browsers, `developer-instructions.ts:272`) | 2,600 (included in the allowlist of #1) | same as #1 | Low |
| 3 | Move per-agent text (profile JSON, workdir paths, memories) out of the developer message into the first user turn for Codex, as Claude already does. Today Codex appends its own 10K-token block (skills 9,018 + approved rules 1,581 + permissions 803 + collab 198 + plugins 194) after OpenBot's text, so per-agent text sits before it and breaks the shared cache prefix at about line 28 | up to about 12,000 tokens move from cold ($1.00 /M) to cache-read ($0.05 /M) for the 2nd to nth agent and for each routine session of the same agent (cache behavior is hypothesis, see M1) | `thread-lifecycle.ts:1147` (`memoriesInTurns: client.provider === "claude"`), `developer-instructions.ts:246-258`, `:316`, `:354-358` | Medium. Codex has no in-turn memory update path; `memoryContextUpdate` and `sectionTeammatesUpdate` (`developer-instructions.ts:148`, `:205`) already exist for Claude. |
| 4 | Routine runs start a new session (`startRoutineThread`), so each one pays a cold prefix. Cut by #1 and #3; also compare a 60 s cache window against routine schedules | whole cold prefix: about 46,000 API tokens per run today | `drain-scheduler.ts:747`, `thread-lifecycle.ts:529` | Low for the analysis, Medium to change |
| 5 | Stop the user's Codex plugin and rule state leaking into every OpenBot agent: `mcp__cua_repl` (1,098 o200k), the approved-prefix rules (1,581), the user `~/AGENTS.md` (2,054, user-intended per docs), recommended plugins (194) | about 3,700 (without AGENTS.md: 1,700) | `codexConfigEffect` `thread-lifecycle.ts:844-862` already sets `tools`, `features.goals` and `project_doc_max_bytes`; the binary has `include_permissions_instructions`, `include_apps_instructions`, `include_collaboration_mode_instructions`, `skills`, `omit_skill_descriptions` keys (hypothesis: they work as named) | Medium. Surprise: OpenBot turns off the user's MCP servers (`codexDisabledServers`) but a plugin-provided server and the skills still load. Plugins and skills may be what the user wants in an agent. |
| 6 | Cap or filter the Codex skills block (92 user skills + system) per agent | up to 7,600 per request, plus the 9,000-token re-send at turn 2 | Codex-owned; the lever is `codexConfigEffect` config (`skills` table) or a per-agent allowlist | Medium. Skills are a user feature. Hypothesis that `[[skills.config]]` can disable by name through `-c`. |
| 7 | Switch off Codex multi-agent for OpenBot agents (`collaboration` namespace 1,199 + role and mode messages 582) since OpenBot has its own `send_message`/`list_agents` | about 1,500 | `thread-lifecycle.ts:136` (`CODEX_FEATURES_CONFIG`, add a `features.multi_agent*` key) | Low to Medium. Name of the key is a hypothesis (`multi_agent`, `multi_agent_v2` found in the binary). |
| 8 | Fewer discovery steps: `tool_search` was 2 of 8 requests in the sample turn, and its first result stayed in context at 3,429 tokens | one request (about 55,000 warm-read tokens) per avoided discovery step | `tool-catalog.ts:15-28` (`DIRECT_NAMES`), `:63-71`; put `create_agent`, `list_routines`, `read_agent` direct if they are common | Low. Adds tokens to the prefix; net depends on use. |
| 9 | Trim OpenBot's own text: `tool_search` description embeds all tool names (about 4,000 chars), `request_api_key` schema 1,575 chars, `ask_user` 999, long paragraphs at `developer-instructions.ts:264-303` | about 1,000 to 1,500 | `tool-catalog.ts:38`, `:65`; `developer-instructions.ts:263-303` | Low. Already under the `check:agent-context` budget. |
| 10 | For `homeSkills: "instructions"` providers: use a root alias for paths like Codex does (`r1/bro/SKILL.md`), and cap descriptions below 300 | about 1,400 (alias, this user's 90 skills) plus more from a lower cap (cap effect not measured) | `developer-instructions.ts:375-393` | Low. Does not apply to this user's agents (Codex). |
| 11 | Per-agent Codex process: share one app-server for agents that use the same account, and release idle agents faster than 10 min | memory, not tokens: up to about 720 MB per idle agent | `provider-runtime.ts:139`, `:2364-2379` (`#ownProcessFor`, `#confinedKey`) | High. Provider accounts and Workspace-only confinement need separate processes by design (docs: `providers.md`). Only the unconfined, same-account case is a candidate. |
| 12 | Throttle `dynamic-island:publish-presentation` and `servers:set-typing` | 753 + 229 IPC calls per 67 min; a few ms of CPU each (hypothesis) | `dynamic-island-context.tsx:66-76`, `team-typing.ts:9` | Low. Island must stay current on state changes. |
| 13 | Split the eager renderer load: 97 chunks, 16.4 MB (`styles-*.js` 7.16 MB, `Schema-*.js` 2.74 MB) | not measured; hypothesis: tens to hundreds of ms of cold-start work | `electron.vite.config.ts`; run `bun run dev:bench` before and after | Low |

Not worth doing (measured small): SQLite projection writes (M7), main-process timers (M9), OpenBot's own base instructions (3,244 tokens), `DIRECT_NAMES` tool defs (2,948 tokens, already lazy through `tool_search`).

Compaction (hypothesis, not measured): OpenBot compacts at 80% of the window (`context-compaction.ts:31`), after the 52,000 to 71,000 token prefix, which is 20 to 25% of a 272K window if that is the window (the window size was not in the rollout `session_meta`; only a `window_id`). A smaller prefix delays the first compaction. Routine handoff text is 8,000 chars, about 2,000 tokens (`handoff-history.ts:13`). Routine digests: 1,500 chars each, 6,000 total (`:187-188`). Memories: up to 8,192 bytes (`agent-memory-context.ts:3`), 0 in this user's agents.

Prompt-cache ordering check (measured by reading `developer-instructions.ts`): no timestamps or random values in the instruction text
(`grep -n "new Date\|Date.now\|toISOString" developer-instructions.ts` has no hits). The 25 stable paragraphs come first, then agent-specific text
(profile at lines 25 to 33 of the output, workdir at 34, memories last). For Claude the memories and teammates already go in user turns
(`thread-lifecycle.ts:1147-1148`), so Claude's prefix is stable. For Codex the order is stable inside OpenBot's block, but Codex then appends its
own 10K block after it (see #3).

Claude and other providers were not measured (no usage rows, no rollouts). The repo's own numbers apply: `instructions.claude` 14,283 bytes, `visible-tools` 13,917 bytes
(`tools/agent-context/budget.json`). Not measured by that budget and not measured here: Claude SDK tool schemas from the Zod shapes
(`claude-client.ts:1930`), the Computer Use MCP schemas for Claude (hypothesis: the same 58 tools unless Claude Code defers them), and Claude's own system prompt.

## Runtime findings

1. Memory, not CPU, is the cost. 5.3 GB total for 5 idle Codex agents. The Codex tree is 68% of it (M5).
2. Main process idle: 0 to 1% CPU, 3 ms p99, 680 MB RSS. Renderer 423 to 600 MB. These are normal for Electron.
3. 5 of 12 turns failed at 14:10:56 to 14:15:59 (M6) and a `token_revoked` 401 is in `providers.log`. This is outside the scope but it wastes requests: a failed turn still sends the 55,000 token prefix if it reaches the model (not verified).
4. IPC chatter is dominated by two calls that fire per event: `dynamic-island:publish-presentation` (30%) and `servers:set-typing` (M6).
5. `agent:get-usage` ran 3 times at once at 13:25:08, each 1.45 s. `hosted-servers:list` runs 21 times (mean 284 ms), `agent:session-settings:read` 5 times (mean 744 ms). Candidates for dedupe at launch (hypothesis: same request issued by several components).
6. The renderer loads 16.4 MB eagerly (M8). The 20 MB main bundle pre-parses in 160 ms (V8 in Node, not Electron), which is not a startup problem by itself.
7. Event log is small (190 events). `delta-buffer.ts` already coalesces streaming writes (`persistStreamingMessage`, 10 flushes per second per stream), added after a past saturation (comment in the file).

## Tooling

Existing commands (from `package.json` and `docs/development-checks.md`):

| Command | What it does |
|---|---|
| `bun run check:agent-context` | Byte budget of OpenBot's own agent text: `instructions.claude` 14,283, `instructions.codex` 14,182, `visible-tools` 13,917, `catalog.schemas` 79,659, `catalog.descriptions` 39,074, `guidance` 21,275, `list-models.fixture` 2,430 (`tools/agent-context/budget.json`). Report: `.openbot-build/agent-context-budget/report.json`. Fixture agent has no memories, skills, vault or Computer Use, so it cannot see item #1. |
| `bun run dev:bench` (`scripts/dev-automation/bench.ts`) | RAM, CPU and renderer scenarios on the built app, on its own profile, median of runs, `--compare` against an earlier report. Reads startup marks. |
| `bun run dev:cpu`, `bun run dev:memory` | CPU profile and heap snapshot of a dev instance (`scripts/dev-automation/cli.ts`). |
| `bun run perf:remote` (`scripts/remote-sync-perf-e2e.ts`) | Time to workspace and request count for a remote client; needs `OPENBOT_DEV_SYNC_PROFILE=1 bun run dev:test-client`. |
| `bun run perf:web` (`scripts/web-client-perf-e2e.ts`) | Web client bundle bytes (raw and gzip), cold and warm load, 160-message streaming story. |
| `bun run bench:browser-tools` | Browser tool latency. |
| `bun run test:durations` | Test timing. |

Gaps: no budget for the Computer Use schemas, for Codex's own appended text, for first-request tokens of a real session, or for the eager renderer bundle size.
A cheap guard is a test that starts a Codex session on a fixture and fails when `additional_tools` or `input_tokens` of the first request grows (the rollout scripts in the scratch folder show how to read both).

Scripts written for this research (read-only, in `/private/tmp/openbot-measure/`): `q.py` (read-only SQL), `rollout.py` (rollout layout), `breakdown.py` (token table per component), `parse2.mjs` (parse time), `dev_openbot.txt` (the OpenBot developer message as Codex received it).
Repo commands were not run, because `node_modules` is not installed in this clone and AGENTS.md says not to run broad checks.

## Open questions

1. Does Codex 0.166.0 honor `mcp_servers.<name>.enabled_tools`, `features.tool_search`, `tool_search_always_defer_mcp_tools`, `skills` config and `features.multi_agent*` when passed through the app-server `config` object? Test: start a thread with the key in a scratch `CODEX_HOME`, read `additional_tools` and the first `token_usage_record` from the rollout. One request each.
2. Is Computer Use meant to be on for every agent by default (`agentComputerUseEnabled` returns true when unset)? A product call: default off for new agents, or lazy per task.
3. Should OpenBot agents inherit the user's `~/.codex` skills, plugins, rules and `~/AGENTS.md`? Today they do (2,054 + 1,581 + 1,098 + 9,018 o200k tokens), while MCP servers from `config.toml` are disabled on purpose.
4. Why does the skills block repeat at turn 2 (about 9,000 tokens)? Hypothesis: `thread_settings_applied` or a changed cwd skill root. Test: diff the two skills messages in the rollout (`dev_openbot.txt` and item 23) and check what OpenBot sends in `turn/start`.
5. What is the Codex context window for `gpt-6.1-terra` here? It sets how much room 55,000 tokens take, and when compaction (80%) starts.
6. Cache behavior across agents: 2 of 7 first requests hit 37,376 cached tokens. Is that the cross-agent shared prefix or luck? Needed before relying on #3.
7. Why did 5 of 12 turns fail after 14:10:56, and did those requests bill tokens? The 39 usage rows are all from turns that reached the model; no row is marked failed (the table has no status column).
8. Cold start time and first-window time of the packaged app were not measured. They need `bun run dev:bench` (needs `bun install`) on an isolated profile, run on the Mac mini per AGENTS.md.
9. Claude and other providers: no data. Same tests on a Claude agent are needed: `get_context_usage` categories (`claude-context-categories.ts`) show system prompt, MCP tools and skills tokens directly.
