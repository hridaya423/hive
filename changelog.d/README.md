# Unreleased notes

Each change writes its release notes in its own file here. Name the file after the branch, with `-`
for `/`: `changelog.d/fix-web-empty-bubbles.md`.

Use the groups and item rules of [the release notes](../docs/RELEASING.md#release-notes). A file can
have more than one group:

```md
### Fixed

- Show the full server name in the mobile server list. Before, the name stopped after 20
  characters.
```

The pre-commit hook and the Changelog workflow check each file. A pull request with no change
that a user can see gets the `no-changelog` label.

The notes of the iPhone app go in [`apps/mobile/changelog.d/`](../apps/mobile/changelog.d/README.md).
