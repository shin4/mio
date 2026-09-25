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
slots and accent tokens. This separation is required by upstream bundle resolution. Neither
ships a fork of the model adapter. Shared framework peers resolve to the upstream workspace.

## Product and release boundaries

- Native welcome accepts MiMo API keys. `tp-` keys select cn/sgp/ams; other keys use PAYG.
- Defaults: `mimo-v2.6-flash`, thinking enabled. Official Off/High labels mean disabled/enabled;
  no graded `reasoning_effort` is sent. Model settings retain the official editing workflow.
- The packaged home is `userData/dsh-desktop`, separate from the old `userData/dsh`.
- Icons reuse existing Mio assets. Windows installer bitmaps are generated during the build.
- `product.json` disables updates. Both packaging and runtime reject DeepSeek's feed for Mio.
- No installer has been published. This preview retains the upstream internal version; Mio
  release numbering, signing and an update feed require the remaining release qualification.

Packaging delegates to upstream: `bun run package:desktop mac-arm64`, `mac-x64`, or `win-x64`.
Only Windows supports `--unsigned`. Prepare the upstream platform-local `.env.macos` or
`.env.windows`; its app ID must equal `product.json`. macOS requires signing/notarization
credentials. Existing Azure Windows signing integration has **not** been ported to the
upstream certificate/token signing path. Never run the upstream `upload:*` commands for Mio.

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

## Optional UltraSpeed model

`desktop/product.json` contains `"enableUltraSpeed": false` by default. Set it to `true`
and run `bun run build:desktop` (or `bun run dev:desktop`) to include
`mimo-v2.6-pro-ultraspeed` in the built app's model catalog. Set it back to `false` and
rebuild to exclude it. This is a build configuration switch, not a runtime settings toggle.
It does not change the default Flash model or grant model access to the account. The tested
CN Token Plan account rejects UltraSpeed; enable it only for an endpoint/account supporting it.
The preparation step validates that the setting is a JSON boolean.
