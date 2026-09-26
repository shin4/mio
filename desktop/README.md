# Mio on official dsh Desktop

The active development desktop is the complete upstream **0.1.7-rc.2** workspace plus a
reviewed product overlay. It uses the official welcome/workspace layout. There is no legacy
data migration. The first release targets macOS arm64/x64 and Windows x64.

## Run

Install Node 24, pnpm **11.7.0**, and the native toolchain required by upstream (Xcode command
line tools on macOS; upstream Windows native prerequisites on Windows). From this repository:

```sh
node script/desktop/run.mjs build
node script/desktop/run.mjs start
```

Equivalent Bun shortcuts: `bun run build:desktop`, `bun run start:desktop`,
`bun run dev:desktop` (build then start). `bun run prepare:desktop` only prepares sources.
The first start downloads and verifies upstream's bundled Node/Python/office runtime.
Development data lives under `.desktop-build`; use `MIO_HOME` for an explicit runtime home.
The old shell is available through `bun run dev:legacy`.

## Verify

After a build, run from this directory:

```sh
node --test test/*.test.ts
```

Tests run the real pinned runtime. Historical V2.5 API cassettes verify request composition,
stream parsing, errors and tools; they do not prove live V2.6 availability. The Web test boots
the real product bundle, checks client-plugin discovery and model metadata, and calls the
native welcome backend against the real authenticated HTTP RPC server.

`upstream.lock.json` fixes the commit and original lockfile checksum. `patches` includes the
reviewed dependency additions. Installs are frozen; the three-day release-age rule is removed.
Never edit only `.desktop-build/upstream`: changes there are generated and are not the source
of record. The prepare script stops on a wrong checkout or an incompatible patch.

`@mio/desktop` is a composition bundle; its separate `@mio/brand` dependency owns browser
slots and accent tokens. `@mio/asr` (`desktop/asr`) registers MiMo ASR as the cloud recognizer
of the official voice-input bundle, reading the MiMo route's live `baseURL` and `MIO_API_KEY`.
New profiles ship voice input enabled; profiles created by 0.4.0 enable it under Plugins.
`@mio/tts` (`desktop/tts`) adds a read-aloud action to every finalized reply; it serves
`POST /api/mio/tts` behind browser authentication and synthesizes with MiMo TTS on the same route.
Its voice is chosen and previewed under Settings → General (`GET`/`PUT /api/mio/tts/voice`) and
saved into the profile patch. `@mio/media` (`desktop/media`) registers the agent tool
`mimo_media_read`: dsh saves any attached file verbatim and names its read-only path to the model,
but carries no audio or video to a model, so the tool reads the file through the mounted `fs`
backend and asks MiMo (`mimo-v2.6-flash` by default) about it on the MiMo route, returning text.
It accepts MiMo's documented audio (MP3/WAV/FLAC/M4A/OGG) and video (MP4/MOV/AVI/WMV) formats up to
50 MB base64. PDF is refused: MiMo Chat Completions has no file content part. `@mio/asr` adds the voice-input language (`GET`/`PUT /api/mio/asr`,
persisted by the official speech service) and a microphone-access row beside it. This separation is required by upstream bundle resolution. Neither
ships a fork of the model adapter. Shared framework peers resolve to the upstream workspace.

## Product and release boundaries

- Native welcome accepts MiMo API keys. `tp-` keys select cn/sgp/ams; other keys use PAYG.
- `@mio/desktop` disables official rows rather than patching their source: DeepSeek sign-in (Account
  settings, sidebar account menu, account-billed model route), and message feedback and `/feedback`.
  The `deepseek-account` service and `account-controller` stay mounted because Electron's welcome
  backend reads them.
- Agent presets offered are `standard` and `cordis` (Creator). `ptc` and `minimal` stay registered —
  a session resumes under the preset its log recorded, so disabling them strands 0.4.x sessions —
  and are hidden from Settings and the new-session picker by a `ui-agent-preset` overlay hunk.
  `hidden-presets.js` (inserted by `@mio/desktop`) moves a saved default among them to `standard`;
  its list must equal the hunk's `HIDDEN_PRESETS`.
  The DeepSeek Harness preview notice ships acknowledged (`welcomeNoticeVersion`, re-check against
  upstream on every dsh bump) and the browser DeepSeek API-key onboarding is off
  (`credentialOnboarding: false`); Desktop already suppressed both, this covers a browser on the Host.
- Defaults: `mimo-v2.6-flash`, thinking enabled. Official Off/High labels mean disabled/enabled;
  no graded `reasoning_effort` is sent. Model settings retain the official editing workflow.
  Any Settings write to `llm-pi-ai` (welcome's endpoint write, a Models page save) snapshots the
  whole provider table into the user layer; `saved-model-input.js` copies a bundle-declared `input`
  onto saved model rows that state none, so a profile saved on 0.4.3 still gets V2.6 image input.
- The packaged home is `userData/dsh-desktop`, separate from the old `userData/dsh`.
- Icons reuse existing Mio assets. Windows installer bitmaps are generated during the build.
- Updates come from the latest GitHub release (`product.json` `updateOrigin`, a flat
  `releases/latest/download` feed). `publish-release.mjs` uploads `nightly.yml` and one
  `nightly-mac.yml` merged from both macOS architectures; electron-updater picks the arm64 or x64
  ZIP by name. DeepSeek's COS feed and mandatory-update policy are never used. The unsigned Windows
  build updates too, verified by the feed's SHA-512 only.
- Mio installers use `product.json` version `0.4.5`; the bundled dsh runtime remains pinned
  to `0.1.7-rc.2`.
- macOS signs with `com.apple.security.device.audio-input`; `verify-release.mjs` rejects a build
  without it (0.4.1 shipped without it and macOS silently denied the microphone).

Packaging delegates to upstream: `bun run package:desktop mac-arm64`, `mac-x64`, or `win-x64`.
Only Windows supports `--unsigned`. Prepare the upstream platform-local `.env.macos` or
`.env.windows`; its app ID must equal `product.json`. macOS requires signing/notarization
credentials. The approved v0.4.x Windows distribution is explicitly unsigned and uses the `-unsigned`
filename suffix. Never run the upstream `upload:*` commands for Mio.

See [the current plan](../docs/mio-desktop-plan.md) for completion evidence and remaining gates.

## Opt-in live validation

With `MIO_API_KEY` supplied through the process environment, run from `desktop/`:

```sh
node --expose-internals test/live-probe.mjs
```

Requires the prepared, built upstream tree. Uses a temporary profile, the native welcome
backend and official streaming adapter against CN Token Plan. Makes six live generation
requests, removes temporary credentials, and writes sanitized results to
`.desktop-build/live-validation.json`. It is excluded from the automatic test glob.
See `VALIDATION.md` for scope and `live-validation.json` for the latest evidence.

Voice uses the same opt-in shape: `MIMO_API_KEY` (or `MIO_API_KEY`) plus `MIO_REGION` for a Token Plan
key, then `node --expose-internals test/voice-live-probe.mjs`. It saves the key through the native
welcome backend, transcribes the landing-page clips, reads a reply aloud through `/api/mio/tts`, and
hears that speech back through voice input. Sanitized evidence: `voice-live-validation.json`.

Image input uses the same shape: `MIO_API_KEY` (plus `MIO_REGION` for a Token Plan key), then
`node --expose-internals test/image-live-probe.mjs`. It sends one generated PNG to Flash and Pro
through the attachment store and official adapter. Sanitized evidence: `image-live-validation.json`.

Audio and video: `node test/media-live-probe.mjs <samples>` asks every listed chat model directly;
`node test/media-tool-live-probe.mjs <samples>` runs real headless agent turns that must call
`mimo_media_read` themselves. Sanitized evidence: `media-live-validation.json`,
`media-tool-live-validation.json`.

## Optional UltraSpeed model

`desktop/product.json` contains `"enableUltraSpeed": false` by default. Set it to `true`
and run `bun run build:desktop` (or `bun run dev:desktop`) to include
`mimo-v2.6-pro-ultraspeed` in the built app's model catalog. Set it back to `false` and
rebuild to exclude it. This is a build configuration switch, not a runtime settings toggle.
It does not change the default Flash model or grant model access to the account. The tested
CN Token Plan account rejects UltraSpeed; enable it only for an endpoint/account supporting it.
The preparation step validates that the setting is a JSON boolean.

## Release qualification

The manual `official-desktop-release` workflow builds macOS arm64/x64 with the repository's
Developer ID and Apple notarization credentials, and Windows x64 with `--unsigned`. It
uploads installers only after bundled-runtime smoke checks, application version/identity
checks, and regression tests pass. macOS DMG/ZIP signatures, stapled tickets and Gatekeeper
acceptance are verified; Windows runs a silent installation and tests its installed runtime.

Artifacts contain `qualification.json` with source commit, hashes and explicit signing state.
The workflow does not publish automatically. Publish the exact qualified artifacts as the `product.json` version
after all three jobs pass; never substitute artifacts from another source commit. Signing
inputs exist only on their macOS runner and are cleaned after the job.

After merging the qualified source, dispatch `publish-qualified-desktop` on `main` with the
successful qualification run ID. It requires an exact Git tree match, all three qualified
artifacts, matching source/version/signing records, and correct byte counts and SHA-256 hashes.
It then creates a new version tag and draft release, uploads those installers plus checksums
and evidence, and publishes the release only after confirming every upload. Existing version
tags are never overwritten. Release notes live in `desktop/releases/v<version>.md`.
