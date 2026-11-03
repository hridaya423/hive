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
