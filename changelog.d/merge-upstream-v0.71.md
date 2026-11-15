### Changed

- Hive now has the features and fixes of OpenBot 0.60 to 0.71. Hive still sends nothing to OpenBot's
  servers, and the removed products stay removed.
- WhatsApp uses OpenBot's WhatsApp client, with no `baileys` package. Link a number in
  Marketplace › Apps › WhatsApp.
- GitHub Copilot uses OpenBot's Copilot provider. Hive downloads the Copilot CLI, and keeps the no-plan
  row, its own MCP servers only, and the clear message when Copilot has no room.
- A hidden agent keeps working and runs its routines. Routines of agents that were hidden before the
  update are turned off once; turn on the ones that you want.

### Removed

- The co-author line in agents' git commits, the bug reports to the OpenBot team, the social media
  prompt, and the install of a server on another computer.

### Fixed

- A routine of an agent that moves to another host runs on one host only. Before this fix, with
  hidden agents that keep working, the routine could run on both hosts during the move.
