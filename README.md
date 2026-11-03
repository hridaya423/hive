# Hive

Hive is a personal fork of [OpenBot](https://github.com/nightly-labs/openbot), a local-first desktop
workspace for persistent AI agents. Each agent has its own workspace and conversation. Agents run
on the local CLIs of Codex, Claude Code, Grok, OpenCode, Gemini, Cursor, Cline, Kimi and Hermes.

The fork removes the paid hosted servers, the licence purchase flow and the telemetry. It keeps the
app id `dev.hridaya.hive` and the data folder `Hive`, so it does not touch an installed OpenBot.

> [!WARNING]
> Agents run with `danger-full-access` and `approvalPolicy: never`. They can read and change
> files, run commands and use the network without a prompt for each action. Run only agents and
> tasks you trust, and keep backups. See [SECURITY.md](SECURITY.md).

## Requirements

- macOS 13 or newer. The fork builds for macOS only.
- [Bun](https://bun.sh) 1.4.2 and Node 24 or newer.
- The CLI of each provider you want to use. Hive can download pinned copies of most of them.

## Run from source

```bash
bun install --frozen-lockfile
bun run dev
```

`bun run dev` opens a development profile tied to the worktree. Add `--shared` to open the shared
`OpenBot Dev` profile. See [Commands](#commands) for the other scripts.

## Build the app

```bash
bun run package
```

The command writes an unsigned `Hive.app` under `dist/`. `bun run dist:mac` writes a DMG and a ZIP.
The build downloads the remote desktop runtime from a GitHub release that `native-runtime.lock.json`
pins by SHA-256. The fork has no auto-update: copy the new app over the old one.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the desktop app with its local services. |
| `bun run dev:stop` | Stop the stack of this worktree. |
| `bun run build` | Build the Electron bundles. |
| `bun run package` | Build an unpacked, unsigned macOS app. |
| `bun run package:verify` | Build the app and verify its contents. |
| `bun run dist:mac` | Build an unsigned DMG and ZIP. |
| `bun run typecheck:node` | Type-check the main process, backend, preload and scripts. |
| `bun run typecheck:renderer` | Type-check the renderer and `packages/ui`. |
| `bun run knip:check` | Find unused files and dependencies. |
| `bun run check:doc-links` | Check Markdown links and anchors. |
| `bun run test:desktop -- <path>` | Run one Vitest file. |

Each end-to-end test is a script under `scripts/` with a `test:*` entry in `package.json`. Read
[AGENTS.md](AGENTS.md) before you run a broad check: some commands load the whole computer.

## Where data lives

Everything stays on the computer that runs Hive.

- `~/OpenBot/Agents/<agent-id>` holds one working directory per agent.
- `~/OpenBot/Shared` holds files that agents share.
- The Electron user data folder holds `openbot.db`, the source of truth for agents, conversations,
  queues and attachments.
- `~/.codex`, `~/.claude`, `~/.grok` and the other provider folders hold the logins and session
  history that each provider CLI manages.

Hive sends nothing to an analytics service. [PRIVACY.md](PRIVACY.md) lists every network
connection.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) is the entry point to the architecture notes.
- [docs/development-checks.md](docs/development-checks.md) explains the checks.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) covers common failures.
- [docs/plans](docs/plans) holds the plan for this fork.

## License

Hive is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). You may use and modify
the code for noncommercial purposes. Versions of OpenBot up to and including 0.1.11 remain
available under Apache-2.0.

Hive is a modified copy of OpenBot, copyright 2026 Synthetify Labs spółka z ograniczoną
odpowiedzialnością. [NOTICE](NOTICE) holds the attribution and the third-party notices. Hive is not
affiliated with, endorsed by, or sponsored by Synthetify Labs, OpenAI or Anthropic.
