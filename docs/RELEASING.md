# Releasing Hive

Hive has no release pipeline. You build the app on a Mac and copy it to the computers that run it.
The fork has no auto-update, no signing identity, and no GitHub Release workflow.

## Build the app

```bash
bun install --frozen-lockfile
bun run package
```

The command writes an unsigned `Hive.app` under `dist/`. `bun run dist:mac` also writes a DMG and a
ZIP. Build one architecture at a time: the voice runtime and the remote desktop runtime on disk are
for the architecture of the machine that made them.

Codex, Claude and Grok runtimes are optional downloads. They are not part of the application
package. Installed apps offer the latest upstream release of each provider CLI (see
[Provider CLI updates](architecture/providers.md#provider-cli-updates)). The pinned version is the
first-install fallback. To stop a broken upstream release, add its version to the provider's list in
`provider-runtime-blocklist.json`. The app reads the bundled list at its next check.

## Build the remote desktop runtime

`native-runtime.lock.json` pins the upstream source for Sunshine `v2026.516.143833` and Moonlight Web
`v2.10.0` by full commit and source archive SHA-256. Each entry also records the reviewable OpenBot
patch applied to that source. Build on the target platform:

```bash
bun run build:remote-desktop-runtime
bun run verify:remote-desktop-runtime
```

The command writes binaries, the static Moonlight viewer, GPL-3.0 licenses, corresponding-source
metadata, and SHA-256 checksums under `build/remote-desktop-runtime/<platform>/<arch>`. Publish the
exact corresponding source for both GPL components with every binary release. A release must stop if
a binary, license, source manifest, checksum, platform signature, or notarization result is missing.

The build of the fork downloads a runtime that `native-runtime.lock.json` pins by release tag and
SHA-256. To make a new runtime version, build it on the target platform with the commands above,
publish the archives as a GitHub prerelease, and pin its manifest:

```bash
bun scripts/pin-remote-desktop-runtime.ts remote-desktop-runtime-manifest.json
```

Commit the rewritten `native-runtime.lock.json` with the recipe change. A lock with no pin makes
`prepare-remote-desktop-runtime.ts` throw, and so every `package` and `dist:mac` run.

Package and release steps use:

```bash
bun run install:remote-desktop-runtime
bun run verify:remote-desktop-runtime
```

The installer accepts only the exact prerelease and assets in the lock file. It rejects a changed
manifest, a changed archive, an unsafe archive path, and a mismatched source manifest. Do not replace
assets in an existing runtime prerelease. Increase `recipeVersion` when the build process changes.

### Sunshine security backports (runtime recipe 12)

The Sunshine upstream base remains `v2026.516.143833` to keep the tested macOS input backend.
The OpenBot patch includes these upstream security changes and regression tests:

- `1583e7c4a7e99538c7700315a1d2a2101c6d2812`: validate input packets before queueing and
  dispatch (GHSA-26q2-58j6-qmvv and GHSA-6w33-pjh7-p77c).
- `82bccdf69894ee03ac422cc787f1ac9654da359d`: reject short ENet control packets
  (GHSA-c428-87f8-rrv5).
- `ccf97e38796be6cfcbff0ef248a684d39e181eba`: bind pairing approval to an explicit,
  expiring request ID (GHSA-36ff-frg7-492f).
- `4d768847fcd88cc94ac745c4611715c67d7d67e1`: require the exact enabled client
  certificate and canonicalize stored certificate identities (GHSA-6jvv-jqr7-m6m3).

Backport adaptations retain the older platform APIs and test fixtures. Native CI builds and runs
only the relevant packet, pairing, REST authorization, and certificate regression tests. The local
Moonlight client uses a random pairing name and approves only its matching loopback request ID.
Moonlight now builds from the same upstream commit with the existing OpenBot patch and a fix
that sends the configured pairing name instead of the upstream hard-coded name.
The published runtime uses a new recipe/input digest; no existing release assets are replaced.
The Linux GUI capability advisory GHSA-fp6g-27w5-489j does not apply: the Linux runtime is built
with the tray off, and OpenBot gives Sunshine no file capabilities.

### Linux runtime (recipe 16)

The `linux-x64` target builds on Ubuntu 24.04 with GCC 14, X11 capture and software encoding only
(CUDA, DRM, KWin, VAAPI, Vulkan, Wayland, portal and tray are off). The OpenBot patch adds an XTest
input backend, because Xvfb does not read uinput devices. It also links libcap when DRM is off and
adds a `vaMapBuffer2` shim, because the prebuilt FFmpeg needs libva 2.21 and Ubuntu 24.04 has 2.20.
The runtime uses the system libraries of Ubuntu 24.04 that Ubuntu 26.04 also has; the hosted server
template installs them (the remote desktop part of `scripts/hosting/packages.txt`). Since recipe 16,
Boost.Locale has no ICU backend, and the runtime carries `lib/libminiupnpc.so.17` with its Debian
licence, because Ubuntu 26.04 has only `libminiupnpc21`. Sunshine finds it through its RUNPATH
`$ORIGIN/lib`. The build job checks with `ldd` that each executable finds all its libraries on
Ubuntu 26.04.
Linux arm64 builds only for local development and has no release artifact.

## Pin the Gemini server

`native-runtime.lock.json` pins Google's Antigravity ACP server for the Gemini provider by hand:
the version from the ACP registry entry `antigravity-acp`, and for each target the zip name, its
SHA-256 and size, and the SHA-256 of `agy_acp_server` and `localharness_external` in it. Download
each zip from the registry `archive` URL, hash the zip and the two files, and set `installedBytes`
above the extracted size. Do not commit the zip: Google's license does not allow redistribution.

## Pin the Cursor CLI

`native-runtime.lock.json` pins the Cursor CLI by hand. Read the ACP registry entry `cursor`: its
`version` is the date, and each `archive` URL has the build, a date and a commit such as
`2026.09.28-64d2043`. Set `version` to the build. For each target, download
`downloads.cursor.com/lab/<build>/<os>/<arch>/agent-cli-package.tar.gz` (`.zip` on Windows), and
set the archive SHA-256 and size, `installedBytes` above the extracted size, and the SHA-256 of
each file in `files`. The paths in `files` are relative to `dist-package/`. Do not commit the
archives: Cursor's terms do not allow redistribution.

## Pin the Cline CLI

`native-runtime.lock.json` pins the Cline CLI by hand. Read the npm `latest` version of
`@cline/cli-darwin-arm64` and set `version`. For each target, download the platform package
`@cline/cli-<os>-<arch>` (`windows-x64` for Windows) from `registry.npmjs.org`, and set the tarball
SHA-256 and size, the SHA-256 of `bin/cline` (`bin/cline.exe` on Windows) and of
`extensions/plugin-sandbox-bootstrap.js`, and `installedBytes` above the extracted size. The npm
packages have no license file, so set `licenseSha256` to the SHA-256 of `LICENSE` at the
`cli-v<version>` tag of `github.com/cline/cline`.

## Pin the Kimi CLI

`native-runtime.lock.json` pins the Kimi Code CLI by hand. Read the `releases/latest` tag of
`github.com/MoonshotAI/kimi-cli` and set `version` and `tag` (the tag has no `v`). For each target,
download `kimi-<version>-<triple>-onedir.tar.gz` (`.zip` on Windows) from that release, and set the
asset SHA-256 and size, `installedBytes` above the extracted size, and the SHA-256 of each file in
`files`: `kimi` (`kimi.exe` on Windows), `_internal/base_library.zip` and the Python library. The
paths in `files` are relative to the archive's `kimi/` folder. Do not follow or copy the symbolic
links in the archive. Set `licenseSha256` to the SHA-256 of `LICENSE` at the version tag.

## Pin the OpenCode CLI

`native-runtime.lock.json` also pins the OpenCode CLI that OpenBot downloads for the OpenCode
provider before its first update check answers, by `@opencode/cli-*` npm platform package (OpenCode 2), asset SHA-256,
extracted binary SHA-256, byte counts, and the MIT license file. The OpenCode 2 tarballs carry no license, so the lock
names an `opencode-ai` (OpenCode 1) release in `licensePackage` and the app installs the same MIT file from it. Codex,
Claude, and Grok are pinned in the same file by hand; OpenCode has a script, because the version, all five platform
packages, and the license have to agree:

```bash
bun run pin:opencode-runtime                # the newest published release
bun run pin:opencode-runtime 2.1.1          # one exact version
bun run pin:opencode-runtime 2.1.1 1.19.3   # and one exact `opencode-ai` release for the license
```

The script downloads all five platform tarballs, checks that `package/package.json` names the package
and version the lock claims, hashes the extracted binary and the license, and runs the extracted
binary of the target that matches the host with `--version` and refuses a value that is not the pinned one. That last check is
what protects `verifyInstalledRuntime`, which compares the installed version for exact equality. The
script prints the block for review instead of rewriting the lock, so paste it over the `opencode`
entry and re-run it with that exact version: the command reports `already pins OpenCode <version>`
when the committed block matches byte for byte.

Run it on a version bump only. A bump also needs the Windows checks in
[the OpenCode notes](architecture/providers.md#opencode-and-acp): the `win32-x64` values come from the
published tarball read on macOS, so a staged `opencode.exe --version` must be confirmed on Windows
before release.

## Pin the Computer Use driver

`native-runtime.lock.json` pins `cua-driver`, the third-party binary that gives every provider
Computer Use, by release tag, asset SHA-256, and one SHA-256 for each file OpenBot ships. Unlike the
provider CLIs, the driver is packaged rather than downloaded on demand, so the release carries it and
the user installs nothing.

```bash
bun run pin:cua-driver 0.34.0
```

The script downloads all four `-binary` release assets, hashes each shipped file, and refuses a
release that renamed an asset or dropped a file. It prints the block for review instead of rewriting
the lock, so paste it over the `cuaDriver` entry. Use the versioned `cua-driver-rs-v*` tags; the
`nightly-cua-driver-rs-v*` tags are rebuilt daily and are not a pin.

`bun run prepare:cua-driver` then writes `build/cua-driver/<platform>/<arch>` from the pin, verifying
every digest before and after it installs, and `electron-builder.yml` copies that directory to
`resources/cua-driver/<platform>/<arch>`. Every `package` and `dist:mac`
run does this first. The installer carries only the driver of its own target. The package verifier checks that the driver is present.

On macOS the driver arrives signed by Cua AI with the hardened runtime, a secure timestamp, and the
Automation entitlement. `mac.signIgnore` keeps that signature: re-signing it under OpenBot's
inherited entitlements would drop the entitlement and break the driver's Automation route.
Notarization accepts a nested binary signed by another Developer ID team, and
`verify-macos-package.ts` fails if the Cua AI authority or the hardened runtime flag is ever lost.

## Pin the Bun tool runtime

`native-runtime.lock.json` also pins Bun, which is not a provider CLI: it is the runtime a STDIO MCP
server is started with on a computer that has no Node, and the staged layout puts a second name
`bunx` beside it so that `npx -y <package>` has something to answer it. The pin has its own script
for the same reason OpenCode does - the version, five platform packages, and the MIT license have
to agree:

```bash
bun run pin:bun-runtime         # the newest published release
bun run pin:bun-runtime 1.4.2   # one exact version
```

It works like the OpenCode script: it downloads all five platform tarballs, checks
`package/package.json` against the registry metadata, hashes the extracted binary and
`LICENSE.md`, runs `--version` on the target that matches the host, and prints the block for review
instead of rewriting the lock. Paste it over the `bun` entry and re-run it with that exact version
to get `already pins Bun <version>`.

The x64 entries are the `baseline` builds. Bun's plain x64 build needs AVX2 and answers a spawn on
an older machine with an illegal instruction and no message, which would reach the user as an MCP
server that never starts.

Move this pin at release preparation, with the release-upgrade-safety audit, and not on a schedule:
a pinned runtime is OpenBot's supply chain, and a Bun security release only reaches users through an
OpenBot release. One reviewed commit per release.

## Release notes

Each change writes its notes in its own file, `changelog.d/<branch>.md` with `-` for `/`. The fork
has no script that moves the files into `CHANGELOG.md`: `CHANGELOG.md` keeps the history of the
upstream project, and `changelog.d` holds the notes of the fork.

- Put each change that a user can see in the file, in one of these groups:
  `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, `### Security`.
- Write one `- ` item for each change, for a user and not for a developer. Say what changed. For a
  fix, say what happened before.
- Write a step that the user must do after the upgrade as a bold sentence that ends with a full
  stop, for example `**Sign in again after you upgrade.**`. Do not use bold for other sentences.

The pre-commit hook checks each staged `changelog.d` file with `scripts/check-release-notes.ts
--fragments`. The `Changelog` workflow checks each file and fails a pull request that adds none,
unless the pull request has the `no-changelog` label. Use the label when a user sees no change.
