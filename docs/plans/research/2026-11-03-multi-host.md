# Multi-host research: MacBook + always-on Mac mini

Date: 2026-11-03. Repo: `/Users/hridyaagrawal/honey/openbot` at `de784cee2`. Read-only research. No code was changed.

Marks: **[C]** confirmed in code or docs (file:line given). **[U]** unconfirmed: inference, or not run. Each [U] says where I looked.

## Summary

1. A host is one Electron process plus its `openbot.db`. It owns agents, threads, queues, routines, memories, MCP servers and workspaces. The routine timer runs inside that process. Nothing in the code lets two hosts share a database or elect a leader.
2. The headless "server" build is Linux only. `takeServerModeEnvironment` returns null unless `platform === "linux"` (`src/main/server-mode.ts:53`). The install script stops on non-Linux (`scripts/install-server.sh:61`). On macOS the supported way to run a host with no one at the keyboard is the full desktop app in a logged-in session.
3. A routine runs only while the host process runs and the computer is awake. After a sleep, an overdue routine runs once. After a quit, `missedPolicy` (`skip` or `run-once`) decides. The docs tell users to use a hosted or self-hosted server when no computer is on (`docs/TROUBLESHOOTING.md:191-211`).
4. Recommendation: **Option A.** The mini is the one always-on host for all agents and routines. The MacBook is a client of the mini. A second, local-only host on the MacBook stays for MacBook-only work (T3 Code, `~/honey`). Options B and C need new cross-host machinery that fights irreversible migrations and has no base in the code.
5. First milestone: zero code. Run OpenBot.app on the mini (login item, auto-login, keep awake), move the agents with Instance transfer, join from the MacBook. One blocker needs a decision: the Team API listens on loopback only, so a client reaches a remote host only through the account service and Signal (WebRTC). If the account service is removed, a new transport is the real work item.

## Current host model

### What a host owns [C]

- One Electron main process plus a database host utility process. The SQLite file is `<userData>/openbot.db` (`src/backend/database/database-core.ts:57`). It is the source of truth for agents, conversations, queues, attachments, routines and runs (`docs/architecture/structure.md:67`). No backup is made before a migration (`src/backend/AGENTS.md`, "Database migrations").
- Agent workspaces are `~/OpenBot/Agents/<agentId>` (`src/backend/agent-store.ts:212`). Shared files are `~/OpenBot/Shared`. `~/OpenBot/Shared/Data/agent-data.db` is a second SQLite file outside migrations (`structure.md:124`).
- Provider logins are provider-owned folders in the host user's home: `~/.codex`, `~/.claude`, and others (`structure.md:81-83`). Provider CLIs are downloaded and run by the host (`src/main/provider-runtime-manager.ts`; `docs/provider-terms.md:14-25`).
- MCP servers are host-global rows in `projection_mcp_servers` (`docs/architecture/skills-and-plugins.md:68`; `docs/architecture/agents.md:453`, "MCP servers are host-global"). OpenBot passes them to each provider at session start.
- The embedded browser, browser profiles and `browser-tabs.json` belong to the host (`structure.md:118`, `docs/architecture/browser.md`).
- Approval grants (`openbot-approval-automation-v3.json`) and per-agent `additionalFolders` are per host (`structure.md:96-110`).
- Note on a doc conflict [C]: `structure.md:110-113` says the Team API does not carry `additionalFolders`. But `src/main/team-api/route-agent-folders.ts` and `agent-folders-v1` exist (`src/main/team-api-server.ts:34,232,2171`), owner or admin only. A client can set extra folders on a joined host.

### Routine scheduler [C]

- `RoutineScheduler` (`src/backend/agent/routine-scheduler.ts`) owns agent routines. One shared `RoutineTimer` arms one `setTimeout` for the earliest due time of all owners (`src/backend/routine-timer.ts:35-55`). `processDue` reads the due list and creates one run per due routine (`routine-scheduler.ts:862-925`).
- Webhook routines use the same queues. Signal sends each signed request to the one host socket that holds the route (`docs/architecture/events.md:82-118`). D1 stores `route id -> host` (`events.md:19-24`).
- Hosted servers have a Worker cron that starts a stopped server before its next routine (`docs/hosted-servers.md:11-13`). Self-hosted servers have no such help. They stay up.

### Desktop as host vs client [C]

- The rail always has "Local" (`LOCAL_SERVER_ID = "local"`, `packages/contracts/src/ipc-team-host.ts:9`) plus joined servers. `ServerSummary.kind` is `"local" | "remote"` (`ipc-team-host.ts:83`). The renderer branches on `activeServer()?.kind === "local"` in many places (for example `src/renderer/src/features/conversation/WorkspaceConversation.tsx:288,348,582`). Features behind `kind === "local"` (Computer Use, voice, the local browser dock) work on a joined server only as far as the Team API carries them (`docs/architecture/servers.md:1032-1034`).
- The same app can also publish its own host. `HostService.start` starts the Team API, registers the host with the account service, gets a Signal ticket and starts the WebRTC gateway (`src/main/host-service.ts:934-1015`). `enabledOnLaunch` makes it start again at each launch (`src/main/index.ts:1543-1553`; `src/main/development-profile.ts:44-50`).
- A client switch is `RemoteServerManager.setActiveServerId` (`src/main/remote-server-manager.ts:824`). The list is `openbot-remote-servers-v1.json`, managed by `RemoteServerStore` (`src/main/remote-server-store.ts`). Each entry pins the host fingerprint and public key. A newer-version file is refused, not overwritten (`remote-server-store.ts:100-112`).
- Transport: Team API v9 over three WebRTC data channels, Signal for SDP and ICE (`docs/architecture/team-api.md:5-8`).
- The Team API HTTP listener binds `127.0.0.1` only, on a random port (`src/main/listen-loopback.ts:35`; `src/main/team-api-server.ts:497`). `docs/docker.md` ("Run" section) says the same: "The Team API listens on `127.0.0.1`". So a second computer reaches a host only through Signal and WebRTC.
- Joining uses an invite that is validated through the account service (`remote-server-manager.ts:920-960`). HTTP `login` for a stored server also calls `centralAccount.createTeamAuthTicket` (`remote-server-manager.ts:1213`). Both need an account service.
- A local-server "child" is a second headless host that the desktop app starts as a child process (`docs/architecture/servers.md:972-1043`; `src/main/local-server-child.ts`). It works on macOS (`src/main/index.ts:228` hides the Dock). But it needs the parent app: the parent writes the machine token to the child's stdin (`local-server-child.ts:44-58`). It is not a standalone daemon.

### What runs where when a MacBook client uses the mini [C unless marked]

| Thing | Runs on |
| --- | --- |
| Provider CLI turns, logins, usage limits | Mini. Sign-in from the client uses the relay (`docs/architecture/integrations.md:19-30`) |
| Routine timer, queues, mailbox, memories | Mini |
| Workspace files and `additionalFolders` | Mini disk. Client can browse (`workspace-directory-v1`, `servers.md:119-126`) and download files |
| Embedded browser, browser profiles | Mini |
| MCP servers | Mini. Row config says where. `http://127.0.0.1:3773/mcp` would hit the mini, not the MacBook |
| Computer Use (cua-driver) | Mini screen. Needs Screen Recording and Accessibility grants on the mini, given in its GUI (`docs/architecture/computer-use.md:1-30`) |
| Renderer UI, notifications, local attachments cache | MacBook |

## Headless on macOS

### What exists [C]

- Linux server: `scripts/install-server.sh` downloads the release AppImage, checks it, runs `openbot-server-setup`. It installs systemd units, Xvfb, AppArmor and `/usr/local/bin/openbot` (`docs/self-hosted-server.md:228-257`). `sudo openbot login` signs in with an email code through a Unix control socket (`src/main/server-mode.ts`; `scripts/hosting/openbot`).
- Linux only gates: `scripts/install-server.sh:61` (`uname -s`), `/run/systemd/system` and `apt-get` checks in the same script, `src/main/server-mode.ts:53` (`platform !== "linux"`), `src/main/hosted-server-bootstrap.ts:40`.
- Server mode changes: no window (`keepWindowsHidden`, `src/main/index.ts:226`), no login item (`src/main/login-item.ts:27-31`), no keep-awake setting (`src/main/application-services.ts:1284`), a memory guard (`application-services.ts:1128-1136`), a control socket, and publish after sign-in (`index.ts:1537-1541`).
- macOS Host Manager: `docs/multi-tenant-hosting.md` runs the **full OpenBot.app** per tenant through a global Aqua LaunchAgent. Its description: "per-user LaunchAgents start OpenBot in their existing Aqua sessions" (`multi-tenant-hosting.md:51`). It is for several Standard users on one Mac, needs the signed Host PKG from a release, and handles app updates. `scripts/install-host-update-agent.sh` is the developer path.

### Can the same headless mode run on macOS? [C/U]

- **Not today.** [C] Server mode is Linux-gated in code and in the installer. There is no macOS unit, plist or control CLI for it.
- **The supported macOS path is the full desktop app.** [C] The app already supports: host mode (`enabledOnLaunch`), a login item (`app.setLoginItemSettings`, `login-item.ts:55-72`), keep awake (`offersKeepAwake` is true on darwin, `application-services.ts:1284`), a menu-bar mode, and a stable sign-in with Electron `safeStorage` in the login keychain.
- **What a macOS headless mode would need** [U for feasibility; each item grounded in code I read]:
  1. Widen the platform gate in `takeServerModeEnvironment` (`server-mode.ts:53`). It also needs a runtime directory that is not `XDG_RUNTIME_DIR` (`server-mode.ts:56`). Use a 0700 folder under `~/Library/Application Support/OpenBot`.
  2. A macOS `openbot` control CLI (the Linux one is bash with `curl --unix-socket` and `systemctl`, `scripts/hosting/openbot`). Replace `systemctl` with `launchctl`.
  3. A LaunchAgent plist for `gui/<uid>` with `RunAtLoad` and `KeepAlive`. Electron needs a WindowServer session, so a LaunchDaemon will not work [U: Electron requirement from my own knowledge, not tested here]. The mini must auto-login. FileVault blocks auto-login after a reboot (`multi-tenant-hosting.md:131`: "An administrator must unlock a FileVault-protected host after reboot").
  4. Keep-awake: server mode turns the setting off (`application-services.ts:1284`). Use `pmset` "prevent sleep" or `caffeinate -s` in the plist, or keep `offersKeepAwake` true for macOS server mode.
  5. Skip Xvfb. macOS has a real display, so Computer Use needs the real session grants.
  6. Updates: Linux hosted updates use root units (`application-services.ts:3187-3200`). The mac updater needs `app-update.yml` and a signed, notarized release. A fork has no signing identity for the upstream feed [U: `electron-builder.yml`, `build-host-installer.ts` not read in full].
  7. `ServerMemory` guard: I did not confirm it works on macOS (`src/main/server-memory.ts` platform support not read).
- **Verdict:** a macOS headless mode is a small code change plus new scripts, but it only saves the Dock icon and window. The full app on the mini, started by a LaunchAgent or login item, gives the same result with no code change. Do the zero-code path first.

## Routine execution while the machine sleeps

### Behavior [C]

| Case | What happens | Where |
| --- | --- | --- |
| Computer sleeps, app keeps running | On `suspend`, `RoutineWake` stops the timer. On `resume`, it waits for 2 online reads or 120 s, then re-arms. Every missed occurrence of a routine collapses into **one** run. `missedPolicy` is not read | `src/main/routine-wake.ts`; `src/main/index.ts:1513-1515`; `routine-timer.ts:73-76`; `routine-scheduler.ts:892-909`, `packages/team-client/src/routine-schedule.ts:456-469` |
| A run of the routine is already queued or running | The new occurrence queues no run, and the trigger moves on | `routine-scheduler.ts:894-905` (`#hasLiveRun`) |
| App was quit or crashed, then starts | `skipMissed` runs during init. `skip` (default for recurring) records the missed span on one cancelled run. `run-once` keeps the newest occurrence due, so it runs once at start | `src/backend/agent-service.ts:3591`; `src/backend/routine-store.ts:734-790` |
| One-time routine missed | Default is `run-once` | `routine-store.ts:1296-1298` |
| Update restart waits for idle | `holdRoutines` writes a hold window, so a due routine runs after restart | `src/main/idle-restart.ts`; `src/main/routine-hold-file.ts`; `routine-store.ts:736-737` |
| Usage limit | `limitPolicy` `wait` or `skip` per routine | `routine-scheduler.ts:897-900` |

`missedPolicy` values: `["skip", "run-once"]` (`packages/contracts/src/ipc-routines.ts:152`). The routine editor shows the choice only for hosts with `routine-recovery-v1` (`docs/architecture/events.md:185-187`).

### Keep awake [C]

- Setting: Settings > General > "Keep this computer awake", with "Also on battery". It holds `powerSaveBlocker("prevent-app-suspension")` while on AC (`src/main/keep-awake.ts`; `src/main/index.ts:1517-1533`). It is offered on macOS and Windows only (`application-services.ts:1284`).
- Limit: "A closed laptop lid ... still sleeps the computer, unless macOS uses an external display" (`docs/TROUBLESHOOTING.md:201-203`). So a MacBook cannot be the 24/7 host. The mini can (a mini has no lid; AC power; set "Prevent automatic sleeping" in System Settings > Energy too [U: macOS setting name from my own knowledge]).
- The docs name the fix: "For routines that run when no computer of yours is on, use a hosted server or a self-hosted server" (`TROUBLESHOOTING.md:210-211`).

## Options

Common facts for all options:

- There is no cross-host coordination in the code [C: `rg -i "lease|leader|election|failover|standby"` over `src/main`, `src/backend`, `packages/team-client/src` found only incidental hits]. Hosted-server lifecycle is an account-Worker feature, not host-to-host.
- Migrations are irreversible and an older app cannot open a newer database (`docs/self-hosted-server.md:65`, `src/backend/AGENTS.md`). Two machines on different app versions are a hazard for anything that copies `openbot.db`.
- Instance transfer copies agents, routines, memories, skills, optional workspace files and server settings as a one-shot `.zip`. It does **not** copy chat history, browser data, approvals, per-agent access or Computer Use settings (`docs/architecture/agents.md:770-823`).

### Option A: the mini is the single always-on host (MacBook is a client)

- **Shape.** Mini runs OpenBot.app: host published, login item, keep awake, auto-login. MacBook app joins the mini through the server rail. The MacBook keeps its own "Local" host for MacBook-only agents, or runs none.
- **Code changes.** None for the zero-code milestone. Optional later: macOS headless mode (see above); a transport that does not need the account service; a way to pin a host's TCP address.
- **Data consistency.** One writer. One `openbot.db` on the mini. No sync. Migration cost: one-time Instance transfer from the MacBook (loses chat history unless the MacBook stays as an archive), or just start fresh. Do not copy `openbot.db` by file between machines unless both run the same app version [U: no tool for it; file copy is possible but unsupported].
- **MacBook-only resources.**
  - T3 Code: `http://127.0.0.1:3773/mcp` is the MacBook's loopback. On the mini it points at the mini. Add an MCP server row on the mini with the MacBook's tailnet name, for example `http://<macbook>.<tailnet>.ts.net:3773/mcp`. This needs T3 Code to listen on the tailnet interface [U: T3 Code bind options not checked]. No code in `mcp-*.ts` blocks non-loopback URLs [U: `rg` over `src/backend/mcp-*.ts` found only an error-message hint for loopback, `mcp-probe.ts:566`; not run]. The MCP call fails when the MacBook sleeps. That is a clean failure for the agent, not a lost routine.
  - Repos in `~/honey`: clone to the mini, or give the mini an `additionalFolders` entry on a synced path (git, Syncthing, or an NFS or SMB mount of the MacBook). Writes then land on the mini copy. Merge by git. For work that must edit MacBook files live, use the MacBook's own local agent in the "Local" host.
  - Local agents on the MacBook (T3 Code threads, `~/honey` edits) stay in the MacBook's "Local" host. They have their own routines that run only when the MacBook is awake. That is expected.
- **Failure modes.**
  - Mini offline: all agents and routines stop. The MacBook client shows Offline. Mitigation: keep-awake, auto-login, UPS, restart policy. Unconfirmed: whether a client queues a message while the host is offline (the web and mobile clients keep an outbox, `docs/hosted-servers.md:15-17` says the client keeps a message and reconnects for hosted servers).
  - FileVault reboot: needs a human at the mini.
  - Account service down (or removed): the MacBook cannot reach the mini. The mini still runs routines. This is the main architectural gap (see Recommendation, and the other researcher's report).
  - Provider logins live on the mini. Claude and Codex logins must be done there, from the MacBook through the relay (`integrations.md:19-30`). Check `docs/provider-terms.md` on using one subscription on two computers [U: not read beyond the first 30 lines].
  - Computer Use on the mini needs its TCC grants in the GUI.
  - Mini has 16 GB. The desktop app does not hold turns for memory (`application-services.ts:1126-1127`: the guard is for server mode only). Many parallel agent turns can use memory. Watch it with `machine-resources-v1` alerts (`servers.md:44-68`).
- **Effort:** low for the milestone. Medium if the account service goes away.

### Option B: two hosts with the same agents and a lease

- **Shape.** MacBook host and mini host both hold the same agents. A lease (heartbeat, leader election) lets one execute each routine. State syncs both ways.
- **Code changes.** Large. At least: a lease store (a shared service, or a file on shared storage, or a small HTTP service on the tailnet); a gate in `RoutineScheduler.processDue` (`routine-scheduler.ts:862`) and `ChannelRoutineScheduler`, and the workflow triggers (`src/backend/workflows/workflow-triggers.ts`) that checks the lease before `createRun`; a sync layer for agents, threads, memories, mailbox and queue state; a policy for webhook routes (a route belongs to one host in D1, `events.md:19-24`).
- **Data consistency.** The hard part. State is an event log plus projections in SQLite (`database-core.ts`; `orchestration event` primitives), plus files, plus provider-owned session state in `~/.codex` and `~/.claude` that is **not** in SQLite (`structure.md:81-83`). A thread has a provider session bound to one machine; a thread that ran on the mini cannot resume on the MacBook without a handoff replay (`providers.md`, "History retrieval and replacement sessions"). No merge for concurrent edits exists. File-level replication of a live WAL database risks corruption. Migrations on two machines with different versions can lock one out.
- **MacBook-only resources.** Both hosts have the local machine's resources, so each machine's agents see the right files. But an agent that runs on the mini sees the mini's files. Same agent, different results by machine.
- **Failure modes.** Split brain: both execute a routine, so double emails or double PRs. Lease expiry on a sleeping MacBook (clock and timeouts). Webhook route ownership flips. Divergent threads. Operator confusion on which host holds "the truth".
- **Verdict:** reject. It adds the highest risk to the non-negotiable data rules for no gain that A does not give.

### Option C: mini owns routines, dispatches work to the MacBook when awake

- **Shape.** Mini is the host. Agents run provider CLIs on the mini, but tool calls that need MacBook resources go to the MacBook: an SSH shell or workspace, or a MacBook-side worker.
- **Code changes.** Large. No SSH or remote-workspace execution exists in the app [C: `rg -i '\bssh\b'` over `src docs` finds only comments in `provider-drivers.ts:578`, `provider-runtime.ts:1299`, and `docs/remote-session-deployment.md`]. Needed: a remote exec tool or an MCP server on the MacBook (for example a small MCP server, or T3 Code's own `/mcp`), a presence signal (is the MacBook awake), and routine policies ("run on mini" vs "run on MacBook when awake") with a queue for deferred work. Providers run in the workspace path of the agent (`workspaceWritableRoots`), so a remote workspace needs a mount, not a tool.
- **Data consistency.** Good: one database, the mini. Work that dispatches to the MacBook returns results through tool calls.
- **MacBook-only resources.** Reach T3 Code through MCP over Tailscale (same as A). Reach `~/honey` through SSH-based tools, sshfs, or a synced clone.
- **Failure modes.** MacBook asleep: a routine that needs it blocks or fails. Timeouts in tool calls. A run that starts on the mini and needs the MacBook halfway leaves a half-done turn. Security: an SSH key from the mini into the MacBook widens the blast radius.
- **Verdict:** C is A plus an "execution plugin". Build it later, as an MCP server, only for the real MacBook-only tasks. It needs no host-level change.

### Comparison

| | A | B | C |
| --- | --- | --- | --- |
| Delivers "mini runs routines when MacBook is off" | Yes, day one | Yes, after months | Yes, day one (as A) |
| Code change | None to small | Large, cross-cutting | Medium, additive |
| Database risk | None | High | None |
| MacBook-only resources | Local host on MacBook, or MCP over tailnet | Both hosts | MCP or SSH tools |
| Main failure | Mini down, account service down | Split brain | MacBook asleep |

## Recommendation and first milestone

**Choose A. Add C-style MCP access to the MacBook later, only for tasks that need it. Do not build B.**

### Milestone 1: the mini runs routines when the MacBook is off (no code)

1. Mini: install the same OpenBot build (the fork build, or the upstream DMG if the fork has no release yet). Sign in with the account. Set it to share (host) and enable "start on launch". Turn on Settings > General: launch at login, keep this computer awake. In System Settings: auto-login for the user, "Prevent automatic sleeping" on power adapter, restart after power failure. Sign in the provider CLIs on the mini (Claude, Codex) through the app. Grant Screen Recording and Accessibility if agents use Computer Use. [Settings names: C for the app items (`application-services.ts:1280-1284`, `TROUBLESHOOTING.md:196-208`); U for macOS system pane names.]
2. Move agents: on the MacBook, Server settings > Transfer > Export (agents, routines, memories, optionally workspace files). On the mini, Import (`agents.md:770-823`). Chat history does not move. Check the result list for providers that need sign-in on the mini.
3. Turn off the same routines on the MacBook host (pause them, or delete the agents there). Otherwise both hosts run them. This is a manual lease. The pause/resume path marks missed runs skipped (`routine-store.ts:739-750`).
4. Set `missedPolicy` per routine on the mini: `skip` for time-bound jobs, `run-once` for jobs that must run after a mini restart (`ipc-routines.ts:152`; editor needs `routine-recovery-v1`).
5. MacBook: join the mini from the server rail. Use the mini for routine agents. Use "Local" for MacBook-only agents.
6. Acceptance test: close the MacBook lid, wait for a routine due time, open the MacBook, read the run history on the mini. Also check `pmset -g log | grep -E " Sleep | Wake "` on the mini shows no sleep (`TROUBLESHOOTING.md:210`).

Blocker to decide before step 5: the MacBook reaches the mini only through the account service, Signal and WebRTC (loopback-only listener, `listen-loopback.ts:35`). If the account service stays, Milestone 1 works as is. If it is removed, see Milestone 2.

### Milestone 2: a transport that does not need the account service (code)

Goal: the MacBook client reaches the mini over Tailscale with a pinned host identity and a password or token login.

- Bind the Team API to a configurable address and a fixed port (today: `listenLoopback` with port 0, `team-api-server.ts:497`). Alternative with no bind change: `tailscale serve` to forward the loopback port, but the port is random, so add a fixed `preferredPort` (`listenLoopback` already supports `preferredPort`, `listen-loopback.ts:10-18`).
- Add a "connect by address" join path: `apiUrl` + pinned fingerprint + owner password. The local-server flow already does this for `thisComputer` servers (`servers.md:983-985`). The stored shape has `apiUrl`, `fingerprint`, `publicKey` and an optional `transport` (`remote-server-stored-shape.ts:49`). `login` today calls the account service for a ticket (`remote-server-manager.ts:1213`), so a password login for a non-`thisComputer` entry is new work.
- Keep the Team API frozen: add a new optional capability instead of changing wire meaning (`AGENTS.md`, "Released Team API adapters are permanent").
- This overlaps with the account-service researcher. Agree one transport design with them before work starts.

### Milestone 3 (optional): macOS headless mode, and an "MCP bridge" for MacBook-only tools

- macOS server mode (see "Headless on macOS"). Value: no Dock icon and no window on the mini. Low priority.
- T3 Code reach: add an MCP server row on the mini that points at the MacBook's tailnet address (config, not code). Add a tiny MCP "files and shell" server on the MacBook only if the T3 Code MCP is not enough.

## Files to touch

Milestone 1: none. Optional doc: a short `docs/` note for the personal setup.

Milestone 2 (account-free transport), likely:

- `src/main/listen-loopback.ts`, `src/main/team-api-server.ts:497` (bind address and fixed port; keep loopback as default).
- `src/main/host-service.ts` (start path without `registerRemoteHost` and Signal; compare `startLoopbackOnly`, line 1040).
- `src/main/remote-server-manager.ts:920-1260` (join and login by address and password), `src/main/remote-server-store.ts`, `src/main/remote-server-stored-shape.ts` (new transport value; the reader must stay backward compatible, `remote-server-stored-shape.ts` header comment).
- `packages/contracts/src/team-protocol/` (a new optional capability file), `packages/contracts/src/ipc-team-host.ts`, `src/preload/` decoders, `src/renderer/src/preview/mock-openbot.ts` (the IPC mirror rule, `src/main/AGENTS.md`).
- `packages/ui/src/features/servers/` (join dialog fields). Text through `@openbot/i18n`.

Optional macOS headless:

- `src/main/server-mode.ts:53-57`, `src/main/index.ts:221-229,1537`, `src/main/application-services.ts:1128,1280-1284`, new `scripts/hosting/macos/` (plist, control CLI), `docs/self-hosted-server.md` or a new doc.

Option B (not recommended) would touch: `src/backend/routine-store.ts`, `agent/routine-scheduler.ts`, `channel-routine-scheduler.ts`, `workflows/workflow-triggers.ts`, the database schema and migrations (`src/backend/openbot-database-schema.ts`, `openbot-database-schema-history.json`), and every store that writes events.

## Tests

Rule: E2E scripts only; vitest only for migrations, trust boundary, redaction, lint rules (`AGENTS.md`, "Tests"). Do not run broad checks locally (`AGENTS.md`, "Checks"). Commands below are from `package.json`.

Host, server and Team API:

- `bun run test:team-api-routes` (`bun --preload ./scripts/team-api-routes-e2e-electron.mjs scripts/team-api-routes-e2e.ts`) [package.json:312]
- `bun run test:team-legacy-clients` (`scripts/team-api-legacy-clients-e2e.ts`) [:313]
- `bun run test:team-session-revoke` [:314]; `scripts/team-session-end-e2e.ts` has no script alias
- `bun run test:team-live` (`electron scripts/team-webrtc-live-smoke-app`) [:304]
- `bun run test:host-key-rotation` (`scripts/host-key-rotation-e2e.ts`) [:344]
- `bun run test:host-key-handover` (`apps/auth-api/scripts/host-key-handover-e2e.ts`) [:343]
- `bun run test:server-mute` [:315]
- `bun run test:remote-signal-homes`, `test:remote-auth-events`, `test:signal-entry-failover`, `test:invite-acceptance` (account service, Signal) [:339-342]
- `bun run test:signal` (`scripts/signal-security-e2e.ts`) [:309]
- `bun run perf:remote` (`scripts/remote-sync-perf-e2e.ts`) [:164]
- Local servers: `bun scripts/local-servers-e2e.ts --allow-mutations` (needs a running dev app; no script alias; `scripts/local-servers-e2e.ts:1-9`)
- Hosting scripts: `scripts/hosting/hosted-database-durability-e2e.ts` (no script alias) [U: not read]
- Host Manager (macOS): native Swift test in `docs/multi-tenant-hosting.md` ("Developer validation"); `scripts/verify-host-installer.ts`

Routines:

- `bun run test:routine-pause-resume`, `test:routine-timezone-move`, `test:routine-overnight-window` [:321-323]
- `bun run test:routine-fresh-session`, `test:routine-report-failure`, `test:agent-webhook-routine` [:274-276]
- No script alias, run directly: `bun scripts/routine-recovery-e2e.ts --allow-mutations` (missed policy over a joined server; needs `bun run dev:test-client`), `scripts/routine-due-revalidation-e2e.ts`, `routine-flow-sweep-e2e.ts`, `routine-dst-order-e2e.ts`, `routine-cron-syntax-e2e.ts`, `schedule-server-switch-e2e.ts` (needs Storybook URL).

Vitest (protected areas):

- `bun run test:desktop -- <path>`; `bun run test:backend` runs `vitest run src/backend` [:195]; `bun run test:changed`, `bun run test:related -- <source>`.
- Migration tests live in `src/backend/*-migration.test.ts` and `src/backend/openbot-database-schema-parity.test.ts`. Any schema change (Option B) needs new ones.
- Related tests in the repo: `src/main/local-servers/local-servers-redaction.test.ts`, `src/preload/team-decoding.test.ts`. I found no vitest file for `routine-store`, `routine-timer`, `routine-wake`, `keep-awake`, `server-mode` or `host-service` [C: `git ls-files 'src/**/*.test.ts'` filtered by name].

Dev stack for host/client work: `bun run dev` (host), `bun run dev:test-client` (a second client joined to this worktree's host), `bun run dev:status`, `bun run dev:stop` (`package.json:111-146`).

## Open questions

1. **Account service.** If it is removed, what carries MacBook to mini? Needs one decision with the other researcher: self-hosted account service, or the new address-based transport (Milestone 2). The Team API listens on loopback only today.
2. **Chat history.** Instance transfer drops chat history. Is a fresh start on the mini fine, or should the MacBook stay as the archive?
3. **Which agents are MacBook-only?** The list decides what stays in the MacBook "Local" host (T3 Code threads, `~/honey` editing agents) and what moves.
4. **T3 Code reach.** Does T3 Code's MCP server bind beyond loopback, or can it be told to? Not checked (it is outside this repo).
5. **`~/honey` on the mini.** Clone and sync with git, or mount the MacBook folder? Git is simpler and safer.
6. **Provider terms.** Is one Claude or Codex subscription on two computers allowed? `docs/provider-terms.md` was read only in part.
7. **Fork releases.** Does the fork build and sign its own app? Without a signing identity, the mini needs a manual app update flow. Not checked (`electron-builder.yml`, `build-host-installer.ts`).
8. **Memory on 16 GB.** The desktop app does not hold turns for memory (`application-services.ts:1126-1127`). Is a cap on parallel agent turns needed on the mini? A memory alert from `machine-resources-v1` can warn.
9. **Offline mini.** Do clients queue a message for an offline desktop-hosted server? Confirmed only for the hosted-server wake path (`docs/hosted-servers.md:15-17`).
10. **Doc conflict.** `docs/architecture/structure.md:110-113` says `additionalFolders` are local only, but `agent-folders-v1` exists. Fix the doc when touching that area.
