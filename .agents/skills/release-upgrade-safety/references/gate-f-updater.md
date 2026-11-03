# Gate F — The updater itself — `electron-builder.yml`, `src/main/update-service.ts`, `package.json`

Triggered by a change to any of those, or to `package.json` dependencies. Hive does not update itself
(`publish` is removed), so the gate protects the identity fields and the `electron-updater` code that
stays in the tree.

- `appId`, the `publish` owner and repo, `artifactName` and `electronUpdaterCompatibility` are
  unchanged. A changed `appId` breaks the update feed and the `safeStorage` files at once — the
  users who lose their credentials are exactly the ones who successfully updated.
- **An `electron-updater` version bump means re-verifying the four non-public behaviours**
  documented on `UpdateAdapter` in `src/main/update-service.ts`: `MacUpdater.updateDownloaded` only
  asks Squirrel to stage while `autoInstallOnAppQuit` is on, `MacUpdater.quitAndInstall` stages on
  demand, every available check mints and returns a cancellation token, and
  `BaseUpdater.quitAndInstall` can return without quitting. Then update the verified version in
  that doc comment. No test checks these behaviours. If you change that version without
  re-verifying, you get the failure of issue #152.
Compare the installed version with the version that the `UpdateAdapter` doc comment names:

```bash
git diff <tag>..HEAD -- package.json | grep -E '^[-+] +"electron-updater"'
grep -n 'verified against' src/main/update-service.ts
```

If the versions are different, read the four behaviours in the installed
`node_modules/electron-updater` source before you continue.
