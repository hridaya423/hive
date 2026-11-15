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
  Anthropic, xAI, Google, Cursor, Cline, Moonshot AI, Cognition, Mistral, Nous or GitHub. Hive sends
  the conversation to that provider through the CLI, under the provider's own policy.
- **Gemini.** Hive downloads Google's Antigravity CLI from its GitHub releases when you select
  Download. The CLI sends prompts to Google. It keeps its login in `~/.gemini/antigravity-acp`.
- **Devin.** Hive downloads the Devin CLI from `static.devin.ai` when you select Download. The CLI
  sends prompts to Cognition (`app.devin.ai` and `api.devin.ai`). It keeps its login in
  `~/.local/share/devin`. Hive reads only the change time of `credentials.toml`. The CLI sends its
  own product analytics to Cognition, and Hive does not change that.
- **GitHub Copilot.** Hive downloads the GitHub Copilot CLI from GitHub Releases
  (`github.com/github/copilot-cli`) when you select Download. The CLI sends prompts to GitHub
  (`api.githubcopilot.com` and `api.github.com`). It keeps its login in the Keychain and its files
  in `~/.copilot`. Hive does not read them. The CLI uses `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` or
  `GITHUB_TOKEN` when the environment of Hive has one. The CLI sends its own usage data to GitHub,
  and Hive does not change that.
- **Mistral.** Hive downloads the Mistral Vibe ACP server from GitHub Releases
  (`github.com/mistralai/mistral-vibe`) when you select Download. Vibe sends prompts to Mistral
  (`api.mistral.ai`) and asks `console.mistral.ai` and `chat.mistral.ai` for your account details and
  the settings of your organization. It keeps its sign-in in the Keychain, or in `~/.vibe/.env`.
  Hive starts Vibe with its telemetry off, and turns on its model catalogue, so Vibe asks Mistral for
  the models of your account and keeps the list in `~/.vibe`.
- **Backup models.** An agent can have a list of backup models. When the first provider fails, Hive
  sends the conversation to the next provider in the list. The list is yours: Hive adds no provider.
- **Provider CLI release checks.** Hive checks for new provider CLI releases when it starts, once an
  hour, and when you select `Check for updates`. It asks the release source of each CLI, such as
  `api.github.com`, `registry.npmjs.org`, `x.ai/cli`, `static.devin.ai`, `downloads.cursor.com` and
  the ACP registry on `raw.githubusercontent.com`. These requests carry no account, agent, conversation or file data.
  The list of blocked versions is the file `provider-runtime-blocklist.json` in the app.
- **Plugin and MCP servers.** Hive reaches an MCP server or plugin that you add at its own address.
  When the server asks for a sign-in, Hive talks to the authorization service of that server.
- **Pages and previews.** A page that you or an agent opens in the embedded browser uses the
  network. HTML that an agent shows runs in a sandbox. It can load scripts, styles, fonts and images
  from any address.
- **Voice models.** When you turn on voice, Hive downloads the pinned speech models from
  `huggingface.co`. The phone downloads its pinned Qwen3-ASR model from the same host. These
  requests carry no user data. Local models keep the audio and the text on the device.
- **Cloud voice.** If you choose ElevenLabs or Groq for dictation, Hive sends the recorded audio to
  `api.elevenlabs.io` or `api.groq.com` with your own key. If you choose ElevenLabs or xAI for spoken
  replies, Hive sends the text of each reply that it reads to `api.elevenlabs.io` or `api.x.ai` with
  your own key. Hive sends no conversation, file or instruction. Each key is encrypted by the secret
  storage of the operating system and never goes back to the app window. If you turn on Codex live
  voice, the microphone audio goes to OpenAI through your own Codex sign-in.
- **Other services that you connect.** Bitwarden, 1Password, Link and Proton Pass connect to their
  own servers only after you connect them. Hive downloads Proton's `pass-cli` from `proton.me` and
  checks it against a pinned SHA-256. Hive sends these services no conversations and no files.
- **Sunra.** A workflow step with a Sunra model sends its prompt, the model, the size settings and
  the input pictures to `mcp.sunra.ai`, with the Sunra sign-in that you made in Apps. Sunra keeps the
  result in a project in your account, and your credits pay for it. Sunra's privacy policy applies.
- **Skills from GitHub.** When you paste a GitHub link in the skill search, Hive reads that public
  repository from `api.github.com` and `raw.githubusercontent.com` with no GitHub account. The
  requests name the repository, the folder and the commit.
- **Browser profile proxy.** An owner or admin can give a named browser profile a proxy. The pages of
  that profile then go through that proxy server, which can see the sites that the profile opens.
  Hive keeps the proxy password encrypted, sends it only to that proxy, and does not log it.
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

A WhatsApp number links as a device of the computer that runs Hive, as WhatsApp Web does. The
computer connects directly to WhatsApp's servers. No Hive service takes part: the account service
and Signal do not know the number, the link or any message. To link, the user scans a QR code that
Hive shows, or types a pairing code on the phone. Before each connection, Hive asks
`web.whatsapp.com` for the current WhatsApp Web version, as a browser does. Hive uses an unofficial
client, WhatsApp protocol code that is vendored in the repository, so WhatsApp can restrict or block
a number that it sees as automated.

- **Stored on the host.** The device's keys, its Signal sessions, the messages that Hive sent in the
  last day, the last 30 minutes of received messages that the agents took, and the reply chains of
  the last 7 days are in `<userData>/whatsapp/`. Every value is encrypted with a random key that the
  operating system's secret storage keeps, and the file is readable only by the user. The database
  holds the number, a masked name, which agent is the WhatsApp Orchestrator, the contacts and groups
  that the owner allowed, and one row for each conversation that an agent answers. The messages of
  the allowed chats that Hive sees are kept in the database for 90 days, so that an agent can read
  and search them. The files of these messages are downloaded when they arrive, up to 100 MB each,
  to `<userData>/whatsapp/files/`, and are deleted with their message. The copies of one number use
  at most 2 GB: when they use more, the oldest copies are deleted first. Disconnect logs the device
  out, deletes its keys, the saved messages and their files, and keeps the conversations, the
  workspace memories and the allowed senders.
- **Read from WhatsApp.** WhatsApp gives a linked device every message of the account. Hive reads
  only the owner's own "Message yourself" chat, direct messages of the contacts that the owner
  allowed, and the groups that the owner allowed. Every other chat is dropped when it arrives and is
  not stored. Hive keeps only contact names from the first history that WhatsApp sends, in memory,
  and does not ask WhatsApp for the full history.
- **Given to agents.** Every new WhatsApp request goes first to the WhatsApp Orchestrator. It runs on
  its provider like any other agent and passes the work to another agent.
- **Managed from another computer.** An owner or admin of a joined server can link and manage the
  host's numbers from their own computer. The host sends that computer the QR code or pairing code
  of a link, the numbers and their names, the allowed contacts and groups, and the pairing requests
  that wait, over the encrypted connection of the server. The QR code holds the one-use secret of
  that link. The stored keys of the device do not leave the host.
- **Sent to WhatsApp.** The answers of the agents and the files they attach, short status posts,
  reactions, and approval requests with the command, folder and reason that the provider gave,
  redacted. On a number that only Hive uses, a person whom the owner did not allow gets one message
  with a pairing code. On the owner's personal number, Hive never writes first to anyone else.

Anyone whom the owner allowed can give the agents work. The agents run on the host with the access
that the user gave them.

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
