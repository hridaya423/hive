# Handoff: Hive, the personal OpenBot fork

## Your job
Implement the plan at `/Users/hridyaagrawal/honey/openbot/docs/plans/2026-11-03-personal-openbot.md`, phase by phase, starting at Phase 0, Task 0.1. The plan holds every decision, task, file, command and pass check. Do not re-derive them.

## State on 2026-11-03
- Repo: `/Users/hridyaagrawal/honey/openbot`, branch `personal`, latest commit on `personal`. `main` equals upstream `de784cee2`. Remote `upstream` = nightly-labs/openbot. No `origin`; do not push or create a GitHub repo unless Hridya asks.
- No code changed yet. Only `progress.md`, the plan and the research reports were added.
- Resume from `progress.md` at the repo root. Update it after every task.
- Research with file:line evidence: `docs/plans/research/*.md`. Token measurement scripts: `docs/plans/research/measure/`.

## Context the plan does not hold
- Hridya (15, London, builds full time) uses the **upstream** OpenBot 0.59.0 app in `/Applications/OpenBot.app` daily on the MacBook. It has five Codex agents set up from `~/honey/openbot-crew` (Chief of Staff, Hackathon Hunter, Coding Manager, Launch Manager, Badminton Booker paused). Its data folder `~/Library/Application Support/OpenBot` is live. Never point a dev or fork build at it.
- What Hridya asked for, in their words: nothing goes to upstream (the account may stay, on Hridya's own server); paid servers removed; GitHub Copilot as a proper provider; fallback chains across accounts and providers (Codex account 1 → Codex account 2 → Copilot); servers on the MacBook and the mini so the mini runs things when the MacBook is off; as performant and token-efficient as possible; remove commercial-licence and buy slop; personal to them, named Hive. The Dynamic Island is out of scope: do no island work and leave its code alone. The phone is Android. They invoked `perfection` and `be-ambitious`: depth over breadth, evidence for every claim.
- Hridya does not need the account removed, only kept off upstream. The plan keeps the protocol and moves the account service onto the mini with owner sign-in (decision D4). Explain this to Hridya if they ask why an "auth-api" still exists. Ask before switching to the full rip-out (Option B).
- Machines: MacBook Pro (48 GB, sleeps with the lid). Mac mini M4 16 GB, always on, reachable as cua Space `mini` for shell and as the "Hridya's mini" T3 environment. Drive GUIs on the mini only. Android builds and the emulator run on the Windows PC (`ssh win-pc`, AVD `Pixel_API_37`). On the mini, cua has no Screen Recording grant, but `screencapture` from `space_bash` works; download the PNG to look at it.
- Codex on the MacBook is signed in with Hridya's ChatGPT plan. `~/.codex/config.toml` has `suppress_unstable_features_warning = true` (set on purpose).

## Ask Hridya (only these)
Copilot browser sign-in (3.1, 3.3); second Codex account sign-in (4.1); the ntfy app on the phone (7.3); the Phase 5 fallback if the spike fails. Already answered: Android phone, Copilot Pro via GitHub Education, name Hive.

## Suggested skills
- `handoff` (receive direction), then `executing-plans`.
- `test-driven-development` for each failing-test step.
- `performance` for Tasks 1.7 and 1.8.
- `code-review` (thermo-nuclear) and `code-deslop` after each phase.
- `computer-use` for visual checks on the mini.
- `readme` for Task 2.8. `prose` for docs and commit messages (the repo also requires ASD-STE100 English).
- `verification-before-completion` before claiming any phase is done.
