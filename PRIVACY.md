# Privacy

Hive is a personal fork of OpenBot. It is local-first, but it is not offline-only. This page lists
where data stays and which network connections Hive makes.

## Data that stays on the computer

Agent workspaces, conversations, attachments, browser data and team data stay on the computer that
runs Hive. The SQLite file `openbot.db` in the Electron user data folder is the source of truth.
Files that agents create are in `~/OpenBot`. Each provider CLI keeps its own login and session
history in its own folder, for example `~/.codex` or `~/.claude`.

A signed-in phone keeps an encrypted, read-only copy of the agents, sections and recent chats of its
servers. The copy stays on that phone. Sign-out, an expired session and the removal of a server
delete it.

## What leaves the computer

Hive sends no analytics and no error reports. It has no telemetry service. Hive has no automatic
update check for itself.

Hive makes network connections only in these cases:

- **Providers.** A provider CLI that you set up connects to its own service, such as OpenAI,
  Anthropic, xAI, Google, Cursor, Cline, Moonshot AI, Nous or GitHub. Hive sends the conversation to that
  provider through the CLI, under the provider's own policy. Hive does not download the GitHub
  Copilot CLI: it starts the `copilot` that you installed. That CLI keeps its login in the Keychain
  and its files in `~/.copilot`, and Hive does not read them.
- **Provider CLI release checks.** Hive checks for new provider CLI releases when it starts, once
  an hour, and when you select `Check for updates`. It asks the release source of each CLI, such as
  `api.github.com`, `registry.npmjs.org`, `x.ai/cli` and the ACP registry on
  `raw.githubusercontent.com`. These requests carry no account, agent,
  conversation or file data. The list of blocked versions comes from the file
  `provider-runtime-blocklist.json` in the app.
- **Plugin and MCP servers.** An MCP server or plugin that you add is reached at its own address.
  When it asks for a sign-in, Hive talks to that server's authorization service.
- **Pages and previews.** A page that you or an agent opens in the embedded browser uses the
  network. HTML that an agent shows runs in a sandbox and can load scripts, styles, fonts and
  images from any address.
- **Voice models.** When you turn on voice, Hive downloads the pinned speech models from
  `huggingface.co`. These requests carry no user data. If you choose ElevenLabs, Hive sends the
  audio to `api.elevenlabs.io` with your own key.
- **Other services that you connect.** GitHub, Bitwarden, 1Password and Link connect to their own
  servers only after you connect them. Hive sends them no conversations and no files.
- **Messaging.** Slack, Discord and Telegram connect through Signal. A message that mentions Hive
  goes to your computer through Signal.

## OpenBot account service and Signal

Until Phase 5 of the plan in [docs/plans](docs/plans), Hive still uses the OpenBot account service
at `api.openbot.run` and the Signal host at `signal.openbot.run`.

- The account service handles email sign-in, avatars, remote host configuration, memberships,
  invitations and logical sessions. It does not hold chats, files or commands.
- Signal and TURN carry the connection set-up for remote sessions. Chats and files travel through
  the encrypted connection between the two devices, not through Signal.
- Both hosts are run by the upstream project, not by the owner of this fork. They see your network
  address and the data that the two services need.

Phase 5 moves the account service and Signal to the owner's own server. After that move, Hive makes
no connection to `openbot.run` hosts. This page changes at the same time.

## Agent access

Agents run with `danger-full-access` and `approvalPolicy: never`. They can read and change local
files, run programs, use the network and control the embedded browser without a confirmation. Keep
backups. Do not give an agent a task that you would not allow a command-line tool to do.

## Exports and deletion

The account menu can export agent profiles, conversation snapshots, queues and message
attachments as a ZIP file. The export leaves out CLI credentials, browser cookies and workspace
files. The diagnostics export holds versions, counts and timings, and no conversations, URLs, email
addresses or file paths.

To delete local data, quit Hive. Then remove the Hive user data folder and `~/OpenBot`. Hive does
not delete the folders of the provider CLIs. Use each CLI to remove its own data.

## Questions

Report a vulnerability as [SECURITY.md](SECURITY.md) describes. Do not attach credentials or
conversations.
