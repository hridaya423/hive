# Privacy

Hive is a personal fork of OpenBot. It is local-first, but it is not offline-only. This page lists
where data stays and which network connections Hive makes.

Hive makes no connection to any host of the upstream project. It sends no analytics and no error
reports. It has no telemetry service and no automatic update check for itself.

## Data that stays on the computer

Agent workspaces, conversations, attachments, browser data and team data stay on the computer that
runs Hive. The SQLite file `openbot.db` in the Hive user data folder is the source of truth. Files
that agents create are in `~/Hive`. Each provider CLI keeps its own login and session history in its
own folder, for example `~/.codex` or `~/.claude`.

A signed-in phone keeps an encrypted, read-only copy of the agents, sections and recent chats of its
servers. The copy stays on that phone. Sign-out, an expired session and the removal of a server
delete it.

## Connections that Hive makes

- **Providers.** A provider CLI that you set up connects to its own service, such as OpenAI,
  Anthropic, xAI, Google, Cursor, Cline, Moonshot AI, Nous or GitHub. Hive sends the conversation to
  that provider through the CLI, under the provider's own policy.
- **GitHub Copilot.** Hive does not download the Copilot CLI. It starts the `copilot` that you
  installed. That CLI keeps its login in the Keychain and its files in `~/.copilot`. Hive does not
  read them.
- **Backup models.** An agent can have a list of backup models. When the first provider fails, Hive
  sends the conversation to the next provider in the list. The list is yours: Hive adds no provider.
- **Provider CLI release checks.** Hive checks for new provider CLI releases when it starts, once an
  hour, and when you select `Check for updates`. It asks the release source of each CLI, such as
  `api.github.com`, `registry.npmjs.org`, `x.ai/cli` and the ACP registry on
  `raw.githubusercontent.com`. These requests carry no account, agent, conversation or file data.
  The list of blocked versions is the file `provider-runtime-blocklist.json` in the app.
- **Plugin and MCP servers.** Hive reaches an MCP server or plugin that you add at its own address.
  When the server asks for a sign-in, Hive talks to the authorization service of that server.
- **Pages and previews.** A page that you or an agent opens in the embedded browser uses the
  network. HTML that an agent shows runs in a sandbox. It can load scripts, styles, fonts and images
  from any address.
- **Voice models.** When you turn on voice, Hive downloads the pinned speech models from
  `huggingface.co`. These requests carry no user data. If you choose ElevenLabs, Hive sends the
  audio to `api.elevenlabs.io` with your own key.
- **Other services that you connect.** Bitwarden, 1Password and Link connect to their own servers
  only after you connect them. Hive sends them no conversations and no files.
- **GitHub.** The GitHub connection is off until `fork.config.json` names a GitHub App in
  `githubApp` (`clientId` and `slug`), or you set `OPENBOT_GITHUB_CLIENT_ID` and
  `OPENBOT_GITHUB_APP_SLUG`. It then signs in to that App through device flow. You own the App,
  so you set its webhook.
- **Slack, Discord and Telegram.** These connectors need an app that you register yourself. A message
  that mentions Hive goes from that service to Signal on your Mac mini, then to your computer.
- **WhatsApp.** WhatsApp connects straight to WhatsApp, as a linked device. See
  [WhatsApp connections](#whatsapp-connections).

## Account service and Signal on your Mac mini

Hive uses an account service and a Signal host. Both run on the owner's Mac mini. Only the owner's
tailnet can reach them, through `tailscale serve`. Funnel stays off. The addresses are in
`fork.config.json`, and the build reads them. Setup and removal steps are in
[ops/mini/README.md](ops/mini/README.md).

- **Sign-in.** The account service signs in one owner account. It trusts the Tailscale login header
  that `tailscale serve` adds. No email goes out.
- **What the account service holds.** It holds the owner account, avatars, remote host
  configuration, memberships, invitations and logical sessions. It does not hold chats, files or
  commands. The database is a local file on the mini.
- **What Signal does.** Signal sets up the connection between two Hive devices. Chats and files
  travel through the encrypted connection between the two devices, not through Signal.
- **No relay.** No TURN relay runs. The two devices connect directly over the tailnet.
- **Who sees what.** Tailscale knows the devices of your tailnet and their addresses. It cannot read
  the traffic between them.

## Android notifications through ntfy

A host that has the environment variables `HIVE_NTFY_URL` and `HIVE_NTFY_TOPIC` sends the
notifications of Android phones to that ntfy server. The host decides who is away and which events
notify. The build has no Firebase file. The phone gives the host a fixed placeholder in place of a
Firebase token, and the host ignores it.

For each notification, the host sends one HTTP `POST` to the ntfy server. The request holds the agent
name, the text, and a link that opens the agent in the app. The text holds the answer only when the
preview is on. The text is plain, not sealed. `HIVE_NTFY_TOKEN` is the access token of the ntfy
server. The host sends the token to that server only. The host logs neither the token nor the text.

Run the ntfy server on your own network. The ntfy server, the host and the phone must be on your
tailnet, because nothing else protects the plain text.

## WhatsApp connections

The user links their own WhatsApp account to this computer as a linked device, the way WhatsApp Web
works. The computer opens a WebSocket straight to the servers of WhatsApp through the unofficial
Baileys library. No Hive server is in the path. The account service, Signal and the tailnet see no
chat, no phone number and no message. The settings page shows a QR code. The phone scans it, and
WhatsApp gives this computer the keys of the new device.

- **Stored on the host.** Hive stores the login of the linked device. It writes one JSON file for
  each key in the `whatsapp/auth` folder of the application data folder. Hive does not encrypt these
  files. Anyone who can read that folder can use the account until the user unlinks the device.
- **Stored in the database.** The database holds the connection record, the name of the WhatsApp
  Orchestrator agent, and one row for each conversation that an agent answers. Hive keeps the
  messages of that conversation as a conversation of that agent, with the WhatsApp name of each
  author. It keeps the files that people send with the attachments of the agent.
- **Stored with other secrets.** The list of allowed chats is encrypted by the secret storage of the
  operating system. Hive also keeps the last messages of an allowed chat in memory until Hive quits.
- **Read from WhatsApp.** WhatsApp delivers every message of the account to a linked device. The
  library decrypts each message in memory. The host drops a message from a chat that is not on the
  allowlist before it reads, stores, logs or passes on the content. It logs only the number of drops.
- **Given to agents.** Messages from an allowed chat reach the agent. These are every message of a
  direct chat and each message that mentions the account in a group. A new request goes first to
  the WhatsApp Orchestrator. It runs on its provider like any other agent.
- **Sent to WhatsApp.** Hive sends the answers of the agents, their files and reactions only to a
  chat on the allowlist. They appear as messages from the user's own account. WhatsApp has no
  buttons for a linked device, so an approval request does not go to the chat. The user approves in
  the app.
- **Linked from a joined computer.** An owner or admin of the server can link, unlink and edit the
  allowed chats from a computer that joined the server (Team API capability `whatsapp-link-v1`). The
  host sends the pairing QR code, the state of the account and the allowed chats only to that
  computer. A member who is not an owner or admin gets a refusal. The QR code is a short-lived
  secret: a person who scans it links the login of the host to their own account. The login files
  and the messages stay on the host.
- **Unlink.** Unlink logs the device out of WhatsApp and removes it from the linked devices of the
  phone. Hive deletes the `whatsapp/auth` folder, the allowed chats, and the WhatsApp Orchestrator
  with its conversations. For a paused connection, Hive opens a short connection from the saved
  login to log out. If WhatsApp does not answer in 10 seconds, Hive deletes the login and writes a
  log line. The phone can then still list the device until the user removes it in WhatsApp. If the
  phone removes the device first, the host deletes the login and shows that the account must be
  linked again.

An unofficial client can break the terms of service of WhatsApp, and WhatsApp can block the number.
Anyone in an allowed chat can give the agents work. The agents run on the host with the access that
the user gave them.

## Agent access

Agents run with `danger-full-access` and `approvalPolicy: never`. They can read and change local
files, run programs, use the network and control the embedded browser without a confirmation. Keep
backups. Do not give an agent a task that you would not allow a command-line tool to do.

## Exports and deletion

The account menu can export agent profiles, conversation snapshots, queues and message attachments
as a ZIP file. The export leaves out CLI credentials, browser cookies and workspace files. The
diagnostics export holds versions, counts and timings. It holds no conversations, URLs, email
addresses or file paths.

To delete local data, quit Hive. Then remove the Hive user data folder and `~/Hive`. Hive does not
delete the folders of the provider CLIs. Use each CLI to remove its own data.

To delete the account service and Signal data, follow the removal steps in
[ops/mini/README.md](ops/mini/README.md). Delete the folder `Hive Control Plane` in the Application
Support folder of the mini.

## Questions

Report a vulnerability as [SECURITY.md](SECURITY.md) describes. Do not attach credentials or
conversations.
