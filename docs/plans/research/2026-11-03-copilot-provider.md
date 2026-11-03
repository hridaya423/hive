# Research: GitHub Copilot as a provider

Date: 2026-11-03. Repo: `openbot` at `de784cee2`. No code was changed.
Method: read the repo, then read GitHub docs, GitHub issues (through `gh`), and the web.
Marks: **[confirmed]** = read in a primary source or run on this Mac. **[unconfirmed]** = not tested.

## Summary

1. OpenBot already ships `copilot --acp` as a custom-agent preset (`packages/contracts/src/acp-agent-presets.ts:20`). A zero-code trial is possible today once `copilot` is on `PATH`.
2. Copilot CLI speaks ACP over stdio (`copilot --acp`, public preview since 2026-01-28). It signs in with the user's own Copilot plan and keeps the token in the OS keychain. OpenBot never needs to touch it.
3. Recommendation: **Option A**. Add a first-class `copilot` provider that runs the user's own `copilot` CLI over ACP. Copy the **Hermes** driver (user-installed CLI, no managed download, local-only). Start with Stage 0 (custom agent) to prove it works.
4. Known gaps in `copilot --acp`: no `usage_update`, no mid-turn steer, a model that is reported but not applied until set, and stdio MCP servers in `session/new` that were refused in 1.0.63. OpenBot needs one flavor hook for the model bug and a spike for the rest.
5. Biggest unknowns: (a) does the macOS keychain token work inside OpenBot's "Workspace only" sandbox, (b) does `gh` token reuse work, (c) what text a spent Copilot limit gives. Each is a one-hour spike.

---

## How providers work here

Sources: `docs/architecture/integrations.md:244-306` ("Add a provider"), `docs/architecture/providers.md`, `AGENTS.md`.

### The five layers of a provider

| Layer | Where | What it holds |
| --- | --- | --- |
| Descriptor row | `packages/contracts/src/agent-providers.ts` (`AGENT_PROVIDERS` l.23, table `satisfies Record<AgentProviderId, …>` l.200-572, `LOCAL_ONLY_PROVIDERS` l.640) | Name, default model, skill folders, `reportsUsage`, `steer`, `workspaceEnforcement`. A missing row does not compile. |
| Driver row | `src/backend/provider-drivers.ts` (`BUILT_IN_PROVIDER_DRIVERS`; interface at l.~560-640) | `signIn`, `codeSignIn`, `catalog`, `resolveCli`, `createClient`, `createProfileClient`, `authState`. |
| ACP client | `src/backend/acp-client.ts`, `acp-configuration.ts`, `acp-connection.ts`, `acp-flavor.ts` | Session start/load, streaming, permissions, model/effort options, MCP hand-off. |
| CLI resolution | `src/backend/cli.ts` (`resolveHermesCli` l.444, `resolveKimiCli` l.567, `resolveClineCli` l.522) | Finds the binary, parses `--version`, checks a minimum version. |
| UI and text | renderer, preload, brand, i18n | Picker, settings, logo, strings. |

### ACP driver path

- `AcpAgentClient` is the one ACP client. Each driver passes options: `provider`, `flavor`, `argv`, `env`, `confine`, `extraEnv`, `signInMessage`, `servesModel`, `mcpServers`, `mcpEndpoint`, `history`, optional `readRateLimits`, `additionalModels` (Cline template: `provider-drivers.ts:1074-1090`).
- A **flavor** (`acp-flavor.ts:19-130`) holds per-agent quirks as hooks. `DEFAULT_ACP_FLAVOR = {}` is the protocol's own behavior (Cline, Grok). Kimi's flavor is at `acp-flavor.ts:179`. Rule in the file header: add a hook only for an observed agent version, and name that version.
- OpenBot's own tools reach every ACP agent through a local **HTTP** MCP bridge (`src/backend/local-mcp-bridge.ts:38`, `type: "http"`). The user's own MCP servers go through `acpMcpServers` (`src/backend/mcp-provider-shapes.ts:515-557`), as stdio or http.
- `discoverModels` reads the model list from ACP config options with `category: "model"` (`acp-configuration.ts:351`, `:441`) or the legacy `models` block (`:621-628`). Reasoning effort is read from `thought_level` options (`:310-320`).
- Tool-use: OpenBot's built-in tools (`agent/tool-catalog.ts`, `tool_search`) go to ACP agents through the bridge (`providers.md:35-38`). Skills: `homeSkills` and `skillFolders` in the descriptor decide how the CLI reads them.

### Templates, side by side

| Concern | Hermes (unmanaged ACP) | Cline (managed ACP) | Kimi (managed ACP, region) |
| --- | --- | --- | --- |
| Descriptor | `agent-providers.ts:518-560` | `:345-369` | `:370-396` |
| Driver | `provider-drivers.ts:1164-1224` | `:1056-1104` | `:1105-1163` |
| CLI resolve | `cli.ts:441-475`, system only: "OpenBot never installs Hermes" (`cli.ts:70`) | `cli.ts:518-557`, min version 3.0.68 | `cli.ts:563-602`, min 1.52.0 |
| Sign-in | `cli-command` + `codeSignIn` device + `signInFiles` | `acp-authenticate` + `codeSignIn` device | `cli-command` + `codeSignIn` device + `signOut` |
| Managed runtime | **no** (not in `MANAGED_RUNTIME_PROVIDERS`, `agent-providers.ts:616`) | yes | yes |
| Team API | local only (`LOCAL_ONLY_PROVIDERS` l.640) | local only | local only |

Kimi and Hermes name no frozen Team API protocol (`agent-providers.ts:636-637`). So step 8 of "Add a provider" (a new `providers-vN` capability) is **not** needed for a local-only provider. It is not needed for one user.

### Every file the Kimi provider touches (non-locale, from `git grep -il kimi`)

- Contracts: `packages/contracts/src/agent-providers.ts`, `ipc-agent-status.ts:163`, `ipc-endpoints.ts:804` (comment), `ipc-provider-admin.ts:207-211` (managed runtime decode).
- Backend: `src/backend/provider-drivers.ts`, `cli.ts`, `acp-flavor.ts`, `acp-configuration.ts` (comments), `process-confinement.ts:321-340,405`, `agent-service.ts:237,3676`, `agent/cli-code-login.ts`, `agent/provider-runtime.ts:186`, `agent/thread-items.ts:142`, `kimi-region.ts` (Kimi only).
- Main: `src/main/provider-runtime-descriptors.ts:143-157,836-906`, `provider-runtime-releases.ts:339-365`, `provider-runtime-manager.ts:301`, `ipc/provider-handlers.ts`.
- Preload: `src/preload/provider-runtime.ts:28`, `provider-runtime.test.ts`.
- Renderer: `src/renderer/src/app-defaults.ts:53`, `features/onboarding/SetupProviderPicker.tsx:126`, `preview/mock-provider-runtimes.ts:31`, `providers.tsx:180`, stories (5 files).
- Brand and UI: `packages/brand/src/provider-logo-shape.ts:25,71,115`, `tokens.css:428`, `packages/ui/src/components/ProviderPicker.tsx:76`.
- Runtime lock: `native-runtime.lock.json:1832-1900`, `scripts/agent-runtime-lock.ts:146-160,317-329`, `provider-runtime-blocklist.json`.
- i18n (en): `packages/i18n/src/messages/en/error/provider.ts:254-261`, `en/onboarding.ts:44`. The same keys are in 12 other locales (`de es fr it ja ko nl pl pt ru tr zh`).
- Scripts and tests: `scripts/provider-conformance-e2e.ts:33-50`, `scripts/provider-fakes/agents/conformance.ts`, `scripts/provider-cli-canary.ts:50`, `scripts/team-api-routes-e2e.ts:1567-1599`.
- Docs: `README.md`, `PRIVACY.md`, `docs/architecture/providers.md`, `integrations.md`, `structure.md`, `docs/RELEASING.md`, `docs/docker.md`, `.github/release-announcement.json`, `changelog.d/<branch>.md`.
- Mobile: `apps/mobile/src/features/servers/model/provider-admin.ts` (comments only).

A Hermes-style provider skips the managed-runtime files (about 14 of the above).

### Other mechanisms the plan must know

- **Model catalog**: `ModelCatalog.refresh` (`src/backend/agent/model-catalog.ts`) reads `model/list`. A provider with special needs sets `catalog` on its driver (`providers.md:160-167`; `provider-drivers.ts:551-570`).
- **Usage and limits display**: descriptor `reportsUsage` (renderer reads it, `agent-providers.ts:173-179`) plus optional `readRateLimits` on the client (`acp-client.ts:422`, used at `provider-drivers.ts:931,989,1041`). `reportsUsage: false` shows the provider logo with no ring.
- **Limit detection**: `isUsageLimitDiagnostic` and `isPlanLimitDiagnostic` (`agent/provider-diagnostics.ts:222-257`) read the **text** of an error. A plan-limit match holds the queue for that provider+model until reset (`usage-limit-gate.ts`, `turn-lifecycle.ts:839-860`). A spent balance or quota "does not reset, so it is not one" (`provider-diagnostics.ts:243-245`) and fails with its reason.
- **Backup models**: `providers.md:914-938`. Two holds move an agent to a backup: a plan usage limit, and a provider error classed `billing | provider_unavailable | rate_limit | authentication | network | timeout` when the turn did no work yet (`!acted`). The model is passed over for 10 minutes (`usage-limit-gate.ts:31`).
- **Provider instructions**: descriptor fields `workspaceInstructionFiles`, `skillFolders`, `homeSkills` decide what OpenBot injects. `AGENTS.md` is injected only if the CLI does not read it by itself.
- **Sandbox**: `workspaceEnforcement: "confined-process"` runs the CLI in a sandboxed process with named writable paths (`process-confinement.ts`). The CLI's own state folder must be in the writable list.
- **Runtime/CLI discovery**: `resolveInstalledFirst`, login-shell `PATH` search incl. `~/.local/bin`, `~/.bun/bin`, Homebrew (`providers.md:207-223`).
- **Tests**: unit tests for providers are few. The real coverage is e2e scripts (see Tests).

---

## External facts

All fetched 2026-11-03 unless marked.

### Copilot CLI and ACP

- **ACP is supported, public preview.** `copilot --acp`; `--stdio` is the default; `--port <n>` gives TCP on 127.0.0.1. NDJSON. Docs: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server>. Announcement: <https://github.blog/changelog/2026-01-28-acp-support-in-copilot-cli-is-now-in-public-preview/>. [confirmed]
- Docs: `--available-tools`, `--excluded-tools`, `--effort` are server-level, not per session. Sessions: `session/new` takes cwd and `mcpServers`. Permissions come as `requestPermission`. [confirmed]
- **Versions.** npm `@github/copilot` latest `1.0.105`; prerelease `1.0.106-6` (2026-11-03) (`npm view`). License: GitHub's own (`LICENSE.md`), not OSS. [confirmed]
- **Release assets** on <https://github.com/github/copilot-cli/releases>: `copilot-darwin-arm64.tar.gz`, `-darwin-x64`, `-linux-x64/arm64`, `-win32-x64`, each with a GitHub asset `digest` (sha256). This is the same hash source OpenBot already trusts for Codex, Pi and Kimi (`providers.md:177-178`). [confirmed]
- **License allows redistribution** of the unmodified binary inside an application that has other functionality, with the license text kept (`LICENSE.md` §2, via `gh api`). So a managed download is legally possible later. [confirmed]
- **Install**: `curl -fsSL https://gh.io/copilot-install | bash`, `brew install copilot-cli`, `winget install GitHub.Copilot`, `npm i -g @github/copilot` (README). The binary is **not on this Mac's PATH**. [confirmed]
- **Registry**: the ACP registry lists "Copilot" (`github-copilot-cli`, runs `@github/copilot --acp` through npx). Version shown differs between snapshots. [unconfirmed which version is live]

### Copilot CLI auth

Source: <https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli>. [confirmed]

- `copilot login` (or `/login`): browser flow on a desktop, **device-code flow** on headless hosts. Force with `--web-flow` or `--device-code`. `--host` for GHE data residency. `--with-token` reads a token from stdin.
- Precedence: `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN` > OAuth token in the OS keychain (service `copilot-cli`) > `gh auth token` fallback.
- Keychain by default. Without one, the CLI can write plaintext to `~/.copilot/config.json` after a prompt.
- Token types: `gho_` OAuth, `github_pat_` fine-grained PAT with "Copilot Requests" permission (personal account), `ghu_`. Classic `ghp_` is **not** supported.
- `COPILOT_HOME` moves the config dir (default `~/.copilot`) (CLI command reference).
- Sign-out: `/logout` removes the local token, does not revoke it.

**This Mac** (checked 2026-11-03):

- `~/.copilot/config.json` holds only `firstLaunchAt` (2026-07-27). `~/.copilot/logs` has CLI logs. No keychain item `copilot-cli`. So the CLI has **not** been signed in here. [confirmed]
- `gh` is logged in (`hridaya423`, keyring). Scopes: `gist read:org repo workflow`. Whether Copilot accepts that token through the `gh` fallback is **[unconfirmed]**. Do not rely on it.

### Copilot CLI model list, effort, headless mode

- **Model list over ACP**: issue `github/copilot-cli#4880` (opened 2026-09-16, now closed) measured CLI 1.0.85: `session/new` gave only `mode` and `allow_all`. Later builds give a `model` select and `reasoning_effort` select: CLI 1.0.96 and 1.0.105, per T3 Code issue `pingdotgg/t3code#21567` and PR `#29425`. [confirmed from third-party reports; not run by me]
- **Reasoning effort differs per model.** `auto` has none; some models take `none,low,medium,high,xhigh,max`; others fewer (t3code #21567). OpenBot's `thought_level` handling (`acp-configuration.ts:310-320`) and `scripts/acp-effort-variants-e2e.ts` cover this class. [needs a spike]
- **Bug in 1.0.105**: `session/new` reports `model.currentValue` but the session does not run it until the client sets it with `session/set_config_option`. Until then, setting effort fails with `-32603`. Copilot may run a different model than shown (t3code PR #29425, open). [confirmed in that PR's live trace]
- OpenBot hits this: `acp-configuration.ts:351` skips the set when `thread.currentModelId === value`.
- **Headless/programmatic**: ACP is the programmatic surface for OpenBot. The SDK (below) also drives the CLI over JSON-RPC. The `-p` prompt mode was not read in the docs I could load. [unconfirmed]
- **Open ACP gaps** (all `github/copilot-cli` issues, open on 2026-11-03):
  - `#4233` no `usage_update` (context window and AI credits). `#4363` no session cost. `#1240` no session usage.
  - `#5198` no mid-turn steer in `--acp`.
  - `#3889` stdio MCP servers in `session/new` rejected (seen on 1.0.63; workaround `--additional-mcp-config`). `#1255` MCP config in `session/new`. `#4678` `session/new` blocks up to 192 s on one dead MCP server. `#5336` no per-run switch to disable user MCP servers under `--acp`.
  - `#3161` enterprise auth not supported by the ACP server. `#2590`, `#5269` plugin/skill gaps in ACP.
  - `#5266` a retried model call streams the failed attempt's text as answer text.
  - `#4555` `session/prompt` aborts background sub-agents.

### Plans, quotas, billing

- **Since 2026-06-01 Copilot uses usage-based billing**: premium request units were replaced by GitHub AI Credits, priced from tokens (input, output, cached) at the model's API rate. 1 credit = $0.01. Included per month: Pro $10, Pro+ $39, Business $19, Enterprise $39. Copilot CLI consumes credits. Sources: <https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/>, <https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing>. [confirmed]
- Annual Pro/Pro+ plans stay on the old premium-request model until they end (same sources). Which one the user is on is **[unknown]**. Under the old model one prompt = one premium request on the default model; only prompts count, not tool calls (<https://docs.github.com/en/copilot/concepts/billing/copilot-requests>). [confirmed]
- Fallback to a cheaper model on exhaustion "is no longer available". Individuals can set a budget for extra usage or wait for the monthly reset. **The exact error text at the limit is not documented.** [confirmed gap]
- Third-party agents: "Third-party coding agents" is listed as a credit-consuming feature; the page does not say if OpenCode, ACP or SDK use is covered. [unconfirmed]
- Free plan: marketing page in this repo says the Copilot CLI is included "with limited use" (`apps/auth-api/src/content/providers/custom-agents.ts:75-76`). I did not verify that on GitHub's side. [unconfirmed]

### Copilot SDK

- `@github/copilot-sdk` is **GA since 2026-06-02**: <https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/>. MIT. TS, Python, Go, .NET, Rust, Java. README: <https://github.com/github/copilot-sdk/blob/main/README.md>. npm shows 1.0.24. [confirmed]
- It starts the Copilot CLI in server mode (JSON-RPC) and manages it. Node, Python and .NET packages bundle the CLI. Auth: signed-in user OAuth stored by the CLI, an app-supplied user token, or BYOK keys. Env vars `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`. It has a method that lists runtime models. Billing "matches the Copilot CLI". Experimental in-process mode. [confirmed]
- OpenBot's backend is ACP-first, so the SDK would be a second protocol. No reason to use it for phase 1. It matters only if ACP gaps block the work (usage and steer may be better in the SDK; **[unconfirmed]**).

### How OpenCode and Pi sign in to Copilot

- **OpenCode**: GitHub "officially supports" Copilot Pro, Pro+, Business and Enterprise in OpenCode through "a formal partnership" (changelog 2026-01-16: <https://github.blog/changelog/2026-01-16-github-copilot-now-supports-opencode/>). Flow: `/connect`, choose GitHub Copilot, complete the **GitHub device login** at `github.com/login/device`; then `/models`. "Some models might need a Pro+ subscription." (<https://opencode.ai/docs/providers/>). Where it stores the login is not in the docs; general `/connect` keys go to `~/.local/share/opencode/auth.json`. [confirmed; storage of Copilot token unconfirmed]
- **Pi**: `/login` with GitHub Copilot is a device-code flow with polling, no callback server; asks for an enterprise host (blank = github.com); stores in `~/.pi/agent/auth.json`; the built-in flow enables a hard-coded model list. Source is a third-party analysis, not the pi-mono repo (<https://agent-safehouse.dev/docs/agent-investigations/pi>, a pi package page). Pi docs list `COPILOT_GITHUB_TOKEN` as the env var (<https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/providers.md>). [partly unconfirmed]

### Terms for third-party use

- GitHub says OpenCode use is covered by the Copilot plan and GitHub's terms, and OpenCode's own terms govern the client (GitHub Marketplace listing for OpenCode, via search). The formal partnership is the explicit sanction. [confirmed for OpenCode only]
- `docs.github.com` "GitHub Terms for Additional Products and Features" only says which terms govern Copilot: for individuals, **Section J (AI Features) of the GitHub Terms of Service**; Business/Enterprise: Generative AI Services Terms. It has no clause on third-party clients. I did not read Section J itself. [confirmed gap]
- **Copilot CLI is GitHub's own binary.** OpenBot would run the unmodified `copilot` with the user's own sign-in. That is the same shape as the user running the CLI in a terminal. The CLI license §8 says service use is governed by the service terms. I found no GitHub text that bans driving the CLI through ACP; ACP is documented by GitHub for "IDE integrations, CI/CD, custom frontends, multi-agent systems". [confirmed]
- **Direct calls to the Copilot API** (`api.githubcopilot.com` with a token exchange) have no official GitHub doc. Community proxies say they are "not supported by GitHub" and warn of temporary suspension for anomalous or bulk use. [confirmed that those projects say so; GitHub policy text not found]
- Repo precedent: `docs/provider-terms.md` has only Claude. Add a Copilot section (see Files).

---

## Options

All four give the user's own Copilot plan. Token cost: OpenBot's tool schemas are sent by every ACP agent each step (`providers.md:14-19`); no option changes that.

| | A. Copilot CLI over ACP (new provider) | B. Copilot inside the OpenCode provider | C. Copilot in the Pi path | D. Direct Copilot API |
| --- | --- | --- | --- | --- |
| Sign-in | `copilot login` (browser or device code), keychain token | OpenCode `/connect` device login, `auth.json` | Pi `/login`, `auth.json` | OpenBot would hold the OAuth token |
| Files touched | ~25 for first-class unmanaged (Hermes template); **0** for Stage 0 (custom agent) | ~0 to 4 | ~5 to 15 (see note) | New client, ~30+, new protocol |
| OpenBot tools, MCP, skills kept | Tools via HTTP bridge: yes. User stdio MCP: risky (`#3889`). Skills: native (`.agents/skills`, to verify) | Yes (OpenCode is a mature ACP provider here) | Yes (Pi has `registerMcpServer` ext, `providers.md:1030`) | Only what OpenBot builds itself: no agent loop |
| Models | Per plan, incl. non-GPT, discovered via ACP config options (version dependent) | Whatever OpenCode exposes for Copilot; some need Pro+ | Pi's hard-coded list only (third-party analysis) | Any, but undocumented |
| Usage/limit display | None from CLI today (`#4233`); text-based limit holds only | None | None | Possible, but undocumented |
| Risk | Preview ACP; unsandboxed keychain unknown; CLI bugs listed above | Gets a GitHub-sanctioned path, but OpenBot's OpenCode driver is built around a Go key and the free tier (`provider-drivers.ts:888-954`); Copilot visibility in the picker is **[unconfirmed]** | Weakest login (model list limits); `pi-key-providers.ts` is for **API keys only** | Highest: unsupported API, suspension risk, OpenBot would store a GitHub token |

Notes:

- **B detail.** `opencode auth login` is a terminal UI and cannot be spawned headless (comment at `provider-drivers.ts:889`). OpenBot signs OpenCode in with `kind: "external"`. The user can run `opencode` once in a terminal to connect Copilot. OpenBot's confined OpenCode process may write `~/.local/share/opencode` (`process-confinement.ts:96-112`), so the shared `auth.json` should be read. The catalog hides OpenCode when "signed out" and filters models the stored Go key cannot use (`provider-drivers.ts:895-899`, `model-catalog.ts:67`, `provider-models.ts:31`). Whether a Copilot-only user sees `github-copilot/*` models is **[unconfirmed]**. A 15-minute test: run managed OpenCode, `/connect` Copilot, open OpenBot's model picker.
- **C detail.** `pi-key-providers.ts` (the file named in the request) is **only** a key-injection path for three API-key providers (`inception`, `deepseek`, `openrouter`; `agent-providers.ts:662`). It writes a temp extension with the key in an env var. Copilot has no API key; its token comes from an OAuth device flow. So Copilot cannot be a key provider. It would be a Pi OAuth login (Pi's own terminal sign-in, `providers.md:1035`), with no new files at all, but with Pi's limited model list.
- **D detail.** OpenBot would need its own agent loop, tool use, and token store. It also breaks the repo rule "OpenBot does not read, copy or store credentials" (`docs/provider-terms.md:23-24` for Claude, same stance). Reject.

### Why not B or C first

Both can only expose models that OpenCode or Pi decide to expose, and neither shows Copilot as a named provider with its own limit state. They are useful as a **fallback today**: B and C may already work with no code change. Test B in the same spike.

---

## Recommendation & design

### Recommendation

**Option A**, in three stages. Stage 0 costs nothing and answers the open questions with real runs.

1. **Stage 0: custom agent (no code).** Install `copilot`, sign in, add the existing "GitHub Copilot" preset (`acp-agent-presets.ts:20`), press "Check agent", chat. This gives the model list, tools and skills answers. Custom agents run with `concurrentTurns: false`, no steer, no usage ring, and no state paths in the sandbox (`providers.md:869`, `agent-providers.ts:559`).
2. **Stage 1: first-class `copilot` provider, Hermes-style.** User-installed CLI, local only, no managed runtime. About 25 files, listed below. Gives named provider, model picker group, backup-model failover, sign-in button, instructions, concurrent turns.
3. **Stage 2 (only if wanted): managed runtime.** Pin GitHub release assets with the asset digest. The license allows it. Skip for a personal fork: the user's own CLI is simpler, and `copilot update`/`brew` keep it current.

### Sign-in flow

- Connect button runs `copilot login` in OpenBot's existing `cli-command` path (`provider-drivers.ts:167-181`, `#signIn` in `provider-runtime.ts`). The CLI opens GitHub's page in the browser and stores the token in the OS keychain. OpenBot sees only exit code.
- Device-code option: `codeSignIn: { kind: "cli", flow: "device", command: { argv: ["login", "--device-code"], … } }` (template: Cline `provider-drivers.ts:1067-1072`). The reader in `agent/cli-code-login.ts` parses "enter this code" lines; Copilot's exact output text must be added there (see Tests). Set `localCodeSignIn: "device"` in the descriptor and keep the two in step (`agent-providers.ts:109-119`).
- `signOut: { argv: ["logout"] }` is **not** a Copilot command (`/logout` is a slash command). **[unconfirmed whether `copilot logout` exists]**; if not, omit `signOut` and tell the user to remove the app in GitHub settings (docs say `/logout` does not revoke).
- Account check: after sign-in OpenBot only needs "is the CLI signed in". Options, cheapest first: (a) a `session/new` probe in a temp folder (like the custom-agent check, `providers.md:860-863`); (b) `signInFiles` for `~/.copilot/config.json` (Hermes pattern, `provider-drivers.ts:1186`) — but the token is in the keychain, so file change time is not a reliable signal. Prefer (a), re-run after the sign-in command exits.

### Where credentials live

- Keychain item `copilot-cli` (macOS), or `~/.copilot/config.json` plaintext fallback. **OpenBot never reads, copies or stores them.** This matches the existing stance for Claude (`provider-terms.md:23-24`).
- Do **not** set `COPILOT_GITHUB_TOKEN`/`GH_TOKEN` from OpenBot. An env token silently overrides the stored login (auth docs). Also strip inherited `GH_TOKEN`/`GITHUB_TOKEN` from the agent environment only if a spike shows they cause the wrong account. **[open]**
- Sandbox: `workspaceEnforcement: "confined-process"` (like Hermes/Kimi) needs `copilotStatePaths()` in `process-confinement.ts` with writable `~/.copilot` (or `$COPILOT_HOME`) and a project dir entry `.copilot` (template `process-confinement.ts:218-242,321-340,402-406`). **Risk**: Antigravity needed `AGY_ACP_FORCE_FILE_STORAGE` because a confined process cannot write the macOS Keychain (`provider-drivers.ts:241-246`). Copilot may fail the same way for read or write. If so, Workspace-only agents cannot use Copilot; Full-access agents can. Spike this first.

### Model discovery

- Rely on ACP `model` config options (CLI ≥ 1.0.96 per third-party reports). Set a **minimum CLI version** after the spike (template `cli.ts:22-24`, `isMinimumVersion`). Older CLIs show only `mode` and `allow_all` (issue `#4880`), which leaves OpenBot with one "default" row; fail them with `error.provider.copilotOutdated`.
- Needs a `COPILOT_ACP_FLAVOR` hook: **always send the model** even when the session reports it as current, because Copilot 1.0.105 does not apply a reported model (t3code PR `#29425`). Today `acp-configuration.ts:351` skips the set. Add `alwaysSetModel?: true` to `AcpFlavor` (`acp-flavor.ts`), read it at `:351`. Name the version in the comment, per the file rule.
- Per-model effort options differ (`auto` has none). Check that OpenBot rebuilds effort options from the session after a model set, not from the first session. `scripts/acp-effort-variants-e2e.ts` is the template.
- `catalog: { slowList: true }` if listing needs more than 5 s (Copilot starts a Rust runtime; MCP servers can add delay, `#4678`). Use `discoveryCwd` like Antigravity (`provider-drivers.ts:976`) so no probe session opens in a workspace.
- `defaultModel: ""` in the descriptor (Cline/Kimi do the same) so the CLI's default is used.

### Quota and limits to OpenBot's backup-model fallback

- `reportsUsage: false` (no usage read exists: `#4233`, `#4363`, `#1240`). Same as Cline and Kimi.
- With `reportsUsage: false`, only a **plan-window** text (`isPlanLimitDiagnostic`) holds the queue and moves the agent to a backup (`turn-lifecycle.ts:839-847`). Any other limit text falls through to a provider error. A provider error with no work done (`!acted`) still fails over for 10 minutes if the error classes as `billing | rate_limit | provider_unavailable` (`providers.md:926-933`, `classifyFailure`).
- **Action**: capture the real text of a spent allowance and of a 429 from Copilot (spike: use a throwaway account or a $0 budget), then add one narrow regex to `provider-diagnostics.ts:247` if the text names a reset, or let it classify as `billing` if it names no reset. Do **not** guess the text now. Today GitHub documents no error text (see External facts).
- Backup models need nothing provider-specific; the user lists them in settings (`providers.md:916-917`). A good personal setup is Copilot first, then Claude/Codex.
- Under AI-credit billing there is no cheaper-model fallback inside Copilot (GitHub blog). So OpenBot's fallback matters more here than for other providers.

### Provider-specific instructions

- Skills: Copilot reads `.github/skills`, `.claude/skills`, `.agents/skills` (docs claim, **[unconfirmed]**; the user's `~/.copilot/skills` exists on this Mac). Set `skillFolders` to include `.agents/skills`; set `homeSkills` after checking that Copilot reads `~/.agents/skills` (if not: `"instructions"`).
- `workspaceInstructionFiles`: Copilot reads `AGENTS.md` and `.github/copilot-instructions.md`. **[unconfirmed]** Verify with a probe file, or OpenBot injects `AGENTS.md` twice.
- `steer: "deferred"` (no mid-turn steer, `#5198`). `concurrentTurns`: start `false` until a spike shows two sessions in one process are safe (ACP docs say stdio serves one client; sessions are separate). `approvalsInFullAccess: true`. `foldersInFullAccess: false`.
- Slash commands and picker-style commands are not usable in ACP (docs). OpenBot never sends them.
- MCP: OpenBot's own tools use HTTP, which Copilot supports. User stdio MCP servers in `session/new` were refused in 1.0.63 (`#3889`). Verify on 1.0.105. If still refused, add `mcpServersLoadWithSession`-style reporting or pass them via `--additional-mcp-config` in `argv` (that is a spawn-time argument; OpenBot's MCP set changes per session, so it does not fit). Report them as drops through `reportMcpDrops` instead.

### Terms text

Add a "GitHub Copilot" section to `docs/provider-terms.md`. Say: OpenBot runs the unmodified `copilot` with the user's own sign-in; GitHub's Terms (Section J for individuals) and the CLI license apply; GitHub lists ACP for "custom frontends" and formally partners with OpenCode, but published no OpenBot-specific statement. Mark it unconfirmed with the date. Do not claim approval.

---

## Files to touch (Option A, Stage 1, Hermes template)

| File | Change |
| --- | --- |
| `packages/contracts/src/agent-providers.ts` | Add `"copilot"` to `AGENT_PROVIDERS` (l.23); descriptor row (template Hermes l.518-560); add to `LOCAL_ONLY_PROVIDERS` (l.640); set `pickerOrder` (next free number). |
| `packages/contracts/src/ipc-agent-status.ts` | New `AgentAuthState` arm `{ kind: "copilot"; email: string \| null }` (next to l.163). |
| `src/backend/provider-drivers.ts` | New driver row after `hermes` (template l.1164-1224); `COPILOT_ARGV = ["--acp"]`; `signIn`, `codeSignIn`, `resolveCli: resolveCopilotCli`, `createClient`, `createProfileClient`, `catalog`, `authState`. |
| `src/backend/cli.ts` | `CopilotCliInfo`, `resolveCopilotCli`, `parseCopilotVersion`, `MINIMUM_COPILOT_VERSION` (template `resolveHermesCli` l.444, `parseKimiVersion` l.727). Add to the CLI info union (l.85-87). |
| `src/backend/acp-flavor.ts` | `COPILOT_ACP_FLAVOR` with `alwaysSetModel` and a `sessionNotFound` rule once its error shape is known. Add `alwaysSetModel` to `AcpFlavor`. |
| `src/backend/acp-configuration.ts` | Read `alwaysSetModel` at l.351. |
| `src/backend/process-confinement.ts` | `copilotStatePaths()` (`COPILOT_HOME` or `~/.copilot`); add `.copilot` to the project-folder list (l.402-406). |
| `src/backend/agent/provider-runtime.ts` | Add `"copilot"` to `SPAWN_ENVIRONMENT_PROVIDERS` (l.180-189). |
| `src/backend/agent/thread-items.ts` | Add to the missing-session provider list (l.139-145). |
| `src/backend/agent/provider-diagnostics.ts` | Narrow limit regex after the spike (l.247). |
| `src/backend/agent/cli-code-login.ts` | Parse Copilot's device-code lines (template: Cline lines at l.290). |
| `packages/brand/src/provider-logo-shape.ts`, `tokens.css` | Logo variant (`:71,:115`) and `[data-provider="copilot"]` colors (`:428`). |
| `src/renderer/src/features/onboarding/SetupProviderPicker.tsx` | String-to-key map (l.126). Also check `setup-provider-props.ts`, `host-setup-provider-props.ts`, `providers.tsx`, `ProviderSettingsSection.tsx`, `packages/ui/.../ProviderPicker.tsx`. |
| `src/renderer/src/app-defaults.ts`, `preview/mock-provider-runtimes.ts` | **Not needed** for an unmanaged provider (Hermes has no runtime entry). Confirm with the type checker. |
| `packages/i18n/src/messages/en/error/provider.ts`, `en/onboarding.ts` | `error.provider.copilotMissing`, `copilotNotStarted`, `copilotOutdated`, `copilotVersionUnreadable`, `copilotSignIn`; `onboarding.provider.copilotAccount`. Other 12 locales have a fallback in `packages/i18n` (`docs/i18n.md:128`); check whether the parity test needs all of them. |
| `scripts/provider-conformance-e2e.ts`, `scripts/provider-fakes/agents/conformance.ts` | Add a `DriverCase` row for `copilot`; fake the `model`-not-applied behavior. |
| `scripts/provider-cli-canary.ts` | Add `copilot` to the "needs an account" map (l.50). |
| `scripts/team-api-routes-e2e.ts` | Add `copilot` to the per-protocol hidden-provider lists (l.1567-1599). |
| `docs/provider-terms.md`, `docs/architecture/providers.md`, `PRIVACY.md`, `changelog.d/<branch>.md` | Copilot section; provider section; outbound data to GitHub; changelog entry. |

Stage 2 adds: `native-runtime.lock.json`, `scripts/agent-runtime-lock.ts`, `src/main/provider-runtime-descriptors.ts`, `provider-runtime-releases.ts`, `provider-runtime-manager.ts`, `src/preload/provider-runtime.ts`, `ipc-provider-admin.ts`, `MANAGED_RUNTIME_PROVIDERS`, renderer defaults and mocks (the Kimi list above).

Stage 0 and Options B/C touch no file.

---

## Tests

The repo says: run the narrowest test, one at a time, no broad checks (`AGENTS.md` "Checks"). The unit runner is Vitest. `bun run test:desktop -- <path>` runs one file. Provider behavior is mostly covered by e2e scripts that run with `bun`.

### Existing files to copy from

| What to test | Copy from | Run |
| --- | --- | --- |
| Driver start, model list, turn, model switch, cancel, resume, missing session, sign-in required | `scripts/provider-conformance-e2e.ts` (`DRIVERS` l.38-56) with fake `scripts/provider-fakes/agents/conformance.ts` | `bun run test:provider-conformance` |
| Flavor hook: model not applied until set | `scripts/acp-flavor-e2e.ts`; fake `scripts/provider-fakes/agents/cursor-model-set.ts` is the closest | `bun run test:acp-flavors` |
| Reasoning effort options that change per model | `scripts/acp-effort-variants-e2e.ts` | `bun run test:acp-effort-variants` |
| Stall, instructions once, MCP names, directories | `acp-turn-stall-e2e.ts`, `acp-instructions-once-e2e.ts`, `acp-mcp-server-names-e2e.ts`, `acp-additional-directories-e2e.ts` | `bun run test:acp-turn-stall`, `test:acp-instructions-once`, `test:acp-mcp-names`, `test:acp-directories` |
| Device-code parsing | tests that cover `cli-code-login.ts` samples (the file says "the tests hold samples", l.208). Find them with `git grep -l parseDeviceCode -- '*.test.ts'` and add a Copilot sample | `bun run test:desktop -- <that file>` |
| Custom agent as a pre-check | `scripts/custom-acp-agent-e2e.ts` | `bun run test:custom-agents` |
| Team API hidden providers | `scripts/team-api-routes-e2e.ts` | `bun scripts/team-api-routes-e2e.ts` |
| Preload decode | `src/preload/provider-runtime.test.ts` | `bun run test:desktop -- src/preload/provider-runtime.test.ts` |
| CLI version parse | no test for `parseKimiVersion` found. A new `src/backend/cli.test.ts` is the place. Use plain table tests. | `bun run test:desktop -- src/backend/cli.test.ts` |
| Plan-limit regex | no existing test file found for `provider-diagnostics.ts` (my `git ls-files` search found none). Add `src/backend/agent/provider-diagnostics.test.ts` with the **captured** Copilot text | `bun run test:desktop -- src/backend/agent/provider-diagnostics.test.ts` |
| Changed files only | any | `bun run test:changed` |
| Types, one project at a time | any | `bun run typecheck:node`, then `bun run typecheck:renderer` |

### Real-CLI spikes (no fake can answer these)

Run in a scratch directory, not in the repo's tests. Record the output in `progress.md`.

1. `copilot login` on this Mac. Check the keychain item `copilot-cli` appears.
2. `copilot --acp` with a 30-line Node client (the T3 issue has one). Record: `session/new` options, model ids, effort options per model, behavior of `set_config_option model`.
3. Same, with `mcpServers` of type `http` (OpenBot's bridge) and `stdio`.
4. Run the CLI inside OpenBot's sandbox (a "Workspace only" agent) and see whether the keychain read works.
5. Run with `gh` only (no `copilot login`) to test the `gh auth token` fallback.
6. Force a limit (budget at $0, or a rate burst) and capture the error text.
7. Option B: managed OpenCode, `/connect` GitHub Copilot, open the picker in OpenBot.

---

## Open questions

1. Is the user on a monthly plan (AI credits) or an annual Pro/Pro+ plan (premium requests)? It changes which limit text appears and how fast the allowance ends.
2. Does the macOS keychain work inside OpenBot's "Workspace only" sandbox? If not, is "Full access only" acceptable for Copilot agents?
3. Does `gh auth token` reuse work for this account? (Docs say yes as the lowest-priority fallback.)
4. What exact error text does Copilot give for a spent allowance, a rate limit, and a disabled model? Not documented. Needs a capture.
5. Does Copilot ≥ 1.0.105 still refuse stdio MCP servers in `session/new` (`#3889`)? If yes, user MCP servers that use stdio are dropped for Copilot agents.
6. Does Copilot read `~/.agents/skills`, `.agents/skills` and `AGENTS.md` by itself? Needed for `homeSkills`, `skillFolders`, `workspaceInstructionFiles`.
7. Is `concurrentTurns: true` safe (two sessions in one ACP process)?
8. Does a Copilot-only user see `github-copilot/*` models in OpenBot's OpenCode provider (Option B)? If yes, B is a free fallback today.
9. Is `copilot logout` a real CLI command? If not, no `signOut` in the driver.
10. Which ACP behaviors are fixed in 1.0.106 (prerelease)? The retry-streams-partial-answer bug (`#5266`) and the `session/prompt` blocking on async shells (`#5293`) affect turn quality.
11. Does the user want Stage 2 (managed runtime)? Recommended no for a personal fork.
12. GitHub Terms Section J was not read. Does it say anything about automated or agentic use that the plan should quote?

## Sources

- GitHub ACP server docs: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server>
- ACP preview changelog (2026-01-28): <https://github.blog/changelog/2026-01-28-acp-support-in-copilot-cli-is-now-in-public-preview/>
- Copilot CLI auth: <https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli>
- Copilot CLI command reference: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference>
- Copilot CLI repo, README, LICENSE.md, releases, issues `#4880 #4233 #4363 #5198 #3889 #4678 #5336 #3161 #5266`: <https://github.com/github/copilot-cli> (read with `gh`, 2026-11-03)
- T3 Code issues: <https://github.com/pingdotgg/t3code/issues/21567>, <https://github.com/pingdotgg/t3code/pull/29425>
- Copilot SDK GA (2026-06-02): <https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/>; README <https://github.com/github/copilot-sdk/blob/main/README.md>
- OpenCode and Copilot (2026-01-16): <https://github.blog/changelog/2026-01-16-github-copilot-now-supports-opencode/>; <https://opencode.ai/docs/providers/>
- Pi: <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/providers.md>; <https://agent-safehouse.dev/docs/agent-investigations/pi>
- Billing: <https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/>; <https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing>; <https://docs.github.com/en/copilot/concepts/billing/copilot-requests>
- Terms index: <https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features>
- Unofficial Copilot API proxies (risk statements): <https://github.com/messense/copilot-api-proxy>
