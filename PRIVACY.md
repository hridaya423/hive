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
  goes to your computer through Signal. WhatsApp connects straight to WhatsApp's servers, as a
  linked device. See [WhatsApp connections](#whatsapp-connections).

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

## Android notifications through ntfy

A host that has the environment variables `HIVE_NTFY_URL` and `HIVE_NTFY_TOPIC` sends the notifications
of Android phones to that ntfy server instead of the account service. It decides who is away, and
which events notify, as it does above. The phone gives the host a fixed placeholder in place of a
Firebase token when the build has no Firebase file, and the host ignores it. The host sends one HTTP
`POST` to the ntfy server for each notification, with the agent name, the text, which holds the
answer only when the preview is on, and a link that opens the agent in the app. The text is plain, not
sealed. `HIVE_NTFY_TOKEN` is the access token of that ntfy server. The host sends the token to that
server only, and logs neither the token nor the text. Run the ntfy server on your own network. ntfy,
the host and the phone must be on your tailnet, because nothing else protects the plain text.

## WhatsApp connections

The user links their own WhatsApp account to this computer as a linked device, the way WhatsApp Web
works. The computer opens a WebSocket straight to WhatsApp's servers through the unofficial Baileys
library. No OpenBot or Hive server is in the path: the account service, Signal and Cloudflare see no
chat, no phone number and no message. A link shows a QR code in the settings page. The phone scans
it, and WhatsApp then gives this computer the keys of the new device.

- **Stored on the host.** The login of the linked device, as one JSON file per key in the
  `whatsapp/auth` folder of the application data folder (`creds.json`, session, pre-key and
  sender-key files). These files are not encrypted by the application: anyone who can read that
  folder can use the account until the user unlinks the device. The list of allowed chats is kept
  with the other connection secrets, encrypted by the operating system's secret storage. The database
  holds the connection record, which agent is the WhatsApp Orchestrator, and one row per
  conversation that an agent answers. The messages of that conversation are kept as a conversation
  of that agent, with the WhatsApp name of each author, and files people send are kept with the
  agent's attachments. The last messages of an allowed chat are also kept in memory for context,
  until Hive quits.
- **Read from WhatsApp.** WhatsApp delivers every message of the account to a linked device, and the
  library decrypts each one in memory. The host drops a message from a chat that is not on the
  allowlist before it reads, stores, logs or passes on its content, and logs only the number of
  drops. Messages from an allowed chat reach the agent: every message of a direct chat, and a
  message that mentions the account in a group.
- **Given to the WhatsApp Orchestrator.** Every new request goes first to the orchestrator agent,
  which runs on its provider like any other agent and passes the work to a teammate with the facts
  it needs.
- **Sent to WhatsApp.** The agents' answers and the files they attach, and reactions, only to a chat
  on the allowlist. They appear as messages from the user's own account. WhatsApp has no buttons for
  a linked device, so an approval request does not go to the chat: the user approves in the app.
- **Linked from a joined computer.** An owner or admin of the server can also link, unlink and edit the
  allowed chats from a computer that joined it (the `whatsapp-link-v1` capability of the Team API). The
  host sends the pairing QR code, the state of the account and the allowed chats to that computer, over
  the Team API, and to no one else: a member who is not an owner or admin gets a refusal. The QR code is a
  short-lived secret. Whoever scans it in WhatsApp links the host's login to their own account. Neither
  the login files nor any message ever leaves the host.
- **Unlink.** Unlink logs the device out of WhatsApp, which removes it from the phone's linked
  devices, deletes the `whatsapp/auth` folder and the allowed chats, and deletes the WhatsApp
  Orchestrator with its conversations. If the phone removes the device first, the host deletes the
  login and shows that the account must be linked again.

Using an unofficial client can break WhatsApp's terms of service, and WhatsApp can block the number.
Anyone in an allowed chat can give the agents work. The agents run on the host with the access the
user gave them.

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
