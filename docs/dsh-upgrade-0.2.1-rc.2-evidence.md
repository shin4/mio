# dsh 0.2.1-rc.2 upgrade — 2026-10-21

## Source and scope

- Baseline: dsh `0.2.0-rc.2`, `639ed015397290b3745d163aafe02ffee4aa3f84`.
- Target: `dsh-v0.2.1-rc.2`, `687f282e8625c6b8d11ff58211a90524be2e4317` (prerelease).
- Toolchain: Node 24.18.0, pnpm 11.28.5; target's original lockfile hash is in `desktop/upstream.lock.json`.
- Upgrade source was committed and pushed as `f4eea4e32`; basic CI and three-platform build CI passed.
- Mio v0.5.1 was published on 2026-10-22 from `da6a1c35907193b19bea5a9aec387abc1e85ff13`, after successful three-platform qualification of that exact source tree. No data import, legacy-package change or `archive/` edit.

## Native behavior and retained product integration

The 54-file overlay applies exactly to a pristine target index and passes repeated preparation/source-drift verification. Upstream supplies loopback/random ports, the `build:official` entry, and the reorganized runtime preparation stages; the redundant port and build-entry hunks are removed. New packaging checks, unsigned macOS local builds, update-channel metadata and Windows directory validation remain upstream-owned. Mio retains its identity, data home, CLI ownership, GitHub update feed, native MiMo welcome, brand, and voice bundle composition. Production wrappers still permit unsigned release artifacts only on Windows.

Schedule is now built into Web/Desktop. Upstream removes the retired experimental bundle from saved profile manifests and retains tasks and settings. Existing user overrides still apply; explicitly disabled rows are not reset. The regression initializes configuration only on the previous-build baseline. Upgrade and restart consume the existing files without rewriting them. After each shutdown, it compares `cordis.yml` and `cordis.patch.yml` byte-for-byte and checks that the manifest changes only by removing the retired bundle selection. The enabled scenario also checks task storage bytes and the customized 17-day history-retention value. A separate explicitly disabled scenario checks that Schedule and its client UI remain unmounted on the baseline, upgraded and reopened runtimes, with the disabled overrides preserved on disk.

Credential resolution follows the official adapter: saved credentials on Desktop/Web, launch environment when the headless profile has no credentials service. ASR/TTS/media use the optional service through `ctx.get()` and upstream `launchEnvironmentOf()`. They do not introduce a new credential store or re-enable one in headless. Regressions cover saved-key precedence and a real headless media tool turn with a conflicting stored key.

The official pi-ai lock resolves 1.1.0 (with upstream's patch), despite the release summary mentioning 1.0.2. `listModels()` now returns an empty catalog for a route with no resolvable key. Tests preserve this behavior and check Flash, Pro and the optional UltraSpeed catalog after storing a test key; the model adapter is unmodified. The welcome notice version remains `2026-09-28.1`.

Preset hiding is retained: upstream's Coding Tools-dependent filtering is not equivalent to Mio's fixed offered roster. Historical presets remain registered for session continuation. Hero text has no equivalent text slot in this release, so the small existing locale/component overlay remains.

## Validation

Local macOS arm64 evidence is under ignored `.desktop-build/upgrade-021-*.log`.

- Frozen install and complete official build: 9 gates passed (native addon, Host/Client compilers and bundles, Desktop bundle, Web build, Host/Client aggregate checks).
- Upstream focused regressions: 1064 passed, 1 Windows-only test skipped. Includes native CLI ownership, launcher, profile normalization, credentials, pi-ai, Schedule restart, session migration and general settings.
- Desktop regression: cassette streaming/errors/thinking/tool continuation, previous-build session continuation and full-backup rollback, headless media credentials, real Web/native-welcome composition, Schedule retention, home paths, packaging/feed and source verification. Final run after the Schedule review fix: 28 passed, no skips (`upgrade-021-schedule-full-regression.log`).
- Schedule review follow-up: closed the fixture-rewrite gap that could mask lost persisted overrides. The focused enabled/disabled upgrade-and-restart suite passed 2/2 (`upgrade-021-schedule-fix.log`). Lint was rerun: 0 errors, 43 existing warnings (`upgrade-021-schedule-lint.log`). This follow-up changes tests and this record only; the prior product build, packaging and live results remain applicable.
- Final review: confirmed baseline-only fixture initialization, post-shutdown configuration comparisons, and disabled runtime/UI assertions across all three boots. Rechecked the exact upstream commit, pristine lock checksum, preparation drift checks and every recorded build-input hash; no mismatch or additional blocking finding. The previously completed 28-test Desktop run covers the final test sources.
- Lint: 0 errors, 43 existing warnings.
- Root legacy typecheck: 3 packages passed (cache hits); this does not substitute for the official build above.
- The initial sandboxed run failed to bind localhost (`EPERM`); the tests were rerun on the host. No product code was changed to bypass sandbox restrictions.

- Actual unsigned macOS arm64 directory package: passed upstream packaging, prepared and packaged runtime smoke, native addons, offline CLI plugin installation/removal, and DOCX/XLSX/PPTX-to-PDF checks. Bundled Node is 24.21.0. The CLI smoke sets `MIO_HOME` alongside `DSH_HOME` so the installed product CLI uses the same isolated fixture home.
- Packaged GUI: launched with isolated home and Electron user-data directories; verified native Mio welcome, entered the main conversation UI, opened the built-in automation task panel, and exited normally. No saved account was copied into that GUI profile.
- Live API regression: explicitly authorized by the user, using the locally saved MiMo key without recording it. Flash/Pro text (`off`) and reasoning (`high`) passed; Flash tool call and continuation passed. Flash/Pro both identified the red/blue test image correctly. Chinese and English ASR and Chinese TTS-to-ASR roundtrip passed. Real headless audio/video turns invoked `mimo_media_read` and returned `42 blue apples` and `Red, green`. All four live probe processes exited 0. Headless logs report inactive UI-only TTS/hidden-preset entries because `connection`/`agentPresets` are absent; the media plugin and tool turns activated and completed successfully.
- Final wrapper build after the packaging smoke adjustment: all 9 gates passed and build-record artifact hashes refreshed.

Sanitized live reports are `.desktop-build/{live,image-live,voice-live,media-tool-live}-validation.json`; logs use the `upgrade-021-` prefix. Historical V2.5 cassettes establish parser/request compatibility; the live checks above establish current Flash/Pro and media availability for this account. These local results did not substitute for cross-platform qualification. The completed three-platform release checks are recorded below; production updater/rollback drills and a full manual UI matrix are not claimed.

## Reproduce

From the repository root:

```sh
node script/desktop/run.mjs build
bun run lint
bun run typecheck
```

From `desktop/`, set `MIO_BASELINE_ROOT` to a preserved, built previous Desktop checkout:

```sh
MIO_BASELINE_ROOT=/absolute/path/to/upstream-0.2.0-rc.2 node --test test/*.test.ts
node ../script/desktop/test-upgrade.mjs
```

Preserve the complete application data/home before upgrading. To roll back, restore the complete pre-upgrade backup with the previous binary; do not make the older runtime read newer appended session data.

## Pre-release qualification follow-up

[Qualification run 39620528314](https://github.com/shin4/mio/actions/runs/39620528314) tested upgrade commit `f4eea4e32` with the previous product version. macOS arm64 and Windows x64 passed packaging, packaged-runtime checks and regressions. macOS arm64 passed Developer ID signing, notarization, stapling and Gatekeeper; Windows was explicitly unsigned. macOS x64 passed build and packaged-runtime checks but failed Apple CloudKit ticket validation with `NSURLErrorDomain -1005` and stapler error 68 on both attempts. Its downstream qualification and regressions did not run. This run is **not** release-qualified and is not reused for 0.5.1.

For 0.5.1, the publication workflow must verify all three fresh qualification artifacts against the release source tree, upstream SHA, package hashes and signing evidence before creating the release and update feeds. The published qualification JSON records the final run and per-platform results.

0.5.1 preparation validation: all 9 official build gates passed; Desktop regression passed 28/28 with the previous-build baseline and no skips; lint reported 0 errors and 43 existing warnings. README and entry-page English/Chinese copy were updated. Browser checks confirmed language switching and no horizontal overflow at 390px; download links resolved the current published release and retain a latest-release fallback.

## Intel CI network follow-up — 2026-10-22

The 0.5.1 preparation run [39629853071](https://github.com/shin4/mio/actions/runs/39629853071) passed arm64 and Windows qualification but failed Intel twice. Attempt 1 reported DMG `ETIMEDOUT` and notarytool failure. Attempt 2 reached ticket stapling/validation, then failed Apple CloudKit with `NSURLErrorDomain -1005` / error 68. Its macOS 15.7.9 image `20260824.0482.1` in westus matches [runner-images#14924](https://github.com/actions/runner-images/issues/14924), where maintainers reproduced HTTP/3 failures and verified TCP fallback.

The release workflow now blocks outbound UDP 443 only on the ephemeral Intel runner before packaging. All official signing, notarization, stapling, Gatekeeper, runtime and regression checks remain required. No dsh source or product overlay changes are made. Failed jobs export only parsed packaging event journals, redacted again using CI signing credentials and runtime-token patterns; raw streams and signing inputs are excluded. The exporter regression verifies nested/escaped credentials, token removal, preserved failure details and malformed-input rejection. Publication selects only the three qualified installer artifacts, excluding diagnostic artifacts retained by failed attempts; successful-run, exact-source, signing and hash checks remain unchanged.

Local validation: Desktop 29/29 with the previous-build baseline; lint has 0 errors and 43 pre-existing warnings. Workflow YAML and failure/upload conditions were checked. Remote TCP fallback and release qualification subsequently passed on `da6a1c359`; see the completed release record below.

## Completed qualification and publication — 2026-10-22

- Release source and tag `v0.5.1`: `da6a1c35907193b19bea5a9aec387abc1e85ff13`. Later documentation commits do not change the qualified binaries or move the release tag.
- [Three-platform qualification 39697333462](https://github.com/shin4/mio/actions/runs/39697333462): all three jobs succeeded on the first attempt after the Intel TCP fallback. All retained build, packaged-runtime, identity, signature and regression gates passed.
- [Publication 39700694968](https://github.com/shin4/mio/actions/runs/39700694968): succeeded after verifying exact source/upstream commits, signing evidence, installer SHA-256, update SHA-512 and uploaded assets.
- [Mio v0.5.1](https://github.com/shin4/mio/releases/tag/v0.5.1) was published at **2026-10-22 08:38:19 Asia/Taipei** (00:38:19 UTC), is neither draft nor prerelease, and was verified as GitHub latest. The bundled dsh `0.2.1-rc.2` remains an upstream release candidate.
- The same commit passed [basic CI](https://github.com/shin4/mio/actions/runs/39697333284), [three-platform build CI](https://github.com/shin4/mio/actions/runs/39697333036), and [Pages deployment](https://github.com/shin4/mio/actions/runs/39697332953).

| Target | Installer/signing qualification | Desktop regression | Upstream regression |
| --- | --- | --- | --- |
| macOS arm64 | DMG/ZIP; Developer ID signed, notarized, stapled, Gatekeeper accepted | 26 passed, 3 baseline-dependent skips | 1064 passed, 1 platform skip |
| macOS x64 | DMG/ZIP; Developer ID signed, notarized, stapled, Gatekeeper accepted; Intel TCP fallback executed | 26 passed, 3 baseline-dependent skips | 1064 passed, 1 platform skip |
| Windows x64 | Explicitly unsigned EXE; actual installation and installed-runtime checks passed | 26 passed, 3 baseline-dependent skips | 1043 passed, 22 platform skips |

The three Desktop skips are previous-build session/backup rollback and the enabled/disabled Schedule upgrade tests. They passed locally with the preserved previous-build baseline in the 29/29 run; CI skips are not counted as passes. All platforms passed the packaged runtime checks, offline CLI plugin installation/removal and Office-to-PDF checks. The new diagnostics-export regression passed in each platform's Desktop suite. No failure occurred in this qualification run, so the failure-only artifact upload branch was not exercised remotely.

The release has **9 assets**: two macOS DMGs, two macOS ZIPs, one Windows unsigned EXE, `SHA256SUMS.txt`, `mio-0.5.1-qualification.json`, `nightly-mac.yml`, and `nightly.yml`. The [published qualification report](https://github.com/shin4/mio/releases/download/v0.5.1/mio-0.5.1-qualification.json) records all three platforms as passed on the release commit. Both update feeds declare `0.5.1`; the published checksum list matches the report's five installer hashes. Windows remains unsigned by explicit policy, with SHA-512 update integrity checks.

Post-publication documentation review checked the English/Chinese README version, upstream pin, platform filenames and signing descriptions against the release asset list. The entry page uses the same product/core versions and release date, with GitHub asset discovery and latest-release fallback links. Historical failed runs above are retained as diagnosis evidence, not release qualification.
