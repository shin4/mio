# @mio/shell

Mio's desktop shell: a thin Electron wrapper that starts the dsh runtime and shows its web UI.
Written from scratch for the dsh architecture — it shares no code with the archived
OpenCode-derived desktop app.

```bash
bun run dev:desktop      # from the repo root
```

## What the shell does, and what it deliberately does not

It owns exactly three things: the runtime child process, one window, and the desktop lifecycle
around them (single instance, macOS activate/quit behavior, window bounds, external links).

It owns **no** agent logic, no renderer of its own, and no IPC surface. The window renders the dsh
web UI with `contextIsolation` on, `nodeIntegration` off, and `sandbox` on, and the shell exposes
no preload bridge: everything the product does is a dsh plugin, and a privileged channel here
would be a way around that.

## Why the runtime is spawned with `--expose-internals`

The runtime runs as a child process using Electron's bundled Node (`ELECTRON_RUN_AS_NODE`), so no
system Node install is required. That child **must** be started with `--expose-internals`.

dsh reaches Node's internal ESM loader one of two ways: the `--expose-internals` flag, or the
`node-addon-require-builtin` native addon. The addon *loads* fine under Electron — it is N-API, so
the ABI is not the problem — but its lookup then fails with `Unsupported/no-realm (no compatible
GetAlignedPointerFromEmbedderData)`: Electron runs JavaScript in its own V8 realm, and the addon
cannot reach Node's internals from there. Without the flag the loader falls back to resolving
plugin entries from its own location, so profile plugins are not
found, and the HMR service refuses to start.

Both take the runtime down — but **after** it has printed its URL. dsh serves before the plugin
tree finishes loading, so a late failure used to leave the shell holding a window pointed at a
server that was already gone, with nothing shown to the user. `startRuntime` now keeps watching
the child after it reports ready and surfaces an unexpected exit with the runtime's own output.

## How Mio's plugins reach the runtime

dsh resolves a plugin entry **relative to the profile directory**, walking up from
`$DSH_HOME/profiles/web`. The profile lives in the user's data directory, whose parent chain never
reaches the app bundle, so a plugin shipped inside the app is invisible until it is placed in the
profile itself.

`src/profile.ts` does that at startup: a plain directory copy of the plugin's published surface
(`package.json` + `lib/`), replaced wholesale on every launch so an app update cannot serve what
the previous version left behind. No package manager runs on the user's machine — dsh symlinks its
own installation's packages into `profiles/node_modules` when it scaffolds, and the copied plugin
resolves its `peerDependencies` through that farm.

**The list is empty today.** MiMo is served by dsh's own `llm-pi-ai` adapter through configuration
alone (`packages/runtime/mio.patch.yml`), so Mio ships no runtime plugin and nothing needs
placing. The machinery stays because the next Mio surface — the client UI plugin carrying
onboarding and branding — needs exactly this placement, and re-deriving it would be churn
(MIGRATION.md, Phase 3 Stage 2).

## Port and profile

The runtime is started with `--port 0`, so the OS picks a free port and the shell reads the URL
back from the runtime's own startup line. A stray `bun run dev:runtime` can never collide with it.

`$DSH_HOME` defaults to the app's data directory when packaged, and to the repo-local
`packages/runtime/.dsh` in development — so the shell boots the same composition
`bun run dev:runtime` provisions rather than a second, empty one.

## Packaging

```bash
bun run package:mac      # stage + build (unsigned unless signing env is set)
```

`scripts/stage.ts` writes a minimal app package into `.package/` and installs it with **npm**;
electron-builder packages that tree via `--projectDir .package`. The workspace tree is never
packaged, for three reasons found the hard way — each produced a build that completed without a
warning and then failed at runtime:

- electron-builder has no Bun dependency-tree extractor and falls back to file traversal, which
  cannot see the packages Bun keeps in `node_modules/.bun`. A build straight from the workspace
  shipped 183 of dsh's packages and was missing 52.
- dsh pins its own siblings with `^` ranges. npm resolves those to whatever is newest, so a naive
  staging step shipped dsh rc.6 with rc.7 internals. The stage script carries the workspace's
  resolved versions over as explicit dependencies and `overrides`, because Bun stops at the tested
  set (`bunfig.toml`'s `minimumReleaseAge`) and npm has no such gate.
- dsh's packages reference each other largely through `peerDependencies` — `dsh-app-boot` imports
  `@deepseek-ai/cordis-plugin-group` at runtime and declares it only as a peer, which
  `npm install --omit=dev` does not materialize. Declaring the whole resolved set covers this.

`directories.app` alone does **not** redirect the build; electron-builder silently keeps packaging
the workspace. `--projectDir` is what works, and the config path must then be absolute.

Two things must be real files rather than asar entries, because the runtime child process and the
startup plugin copy both read them with plain `fs`:

- the whole of `node_modules/**` is `asarUnpack`ed, not just the scoped parts: the child resolves
  imports from inside `app.asar.unpacked`, so anything left in the archive is simply absent from
  its search path (`js-yaml` proved it)
- `dshBin()` rewrites its resolved path from `app.asar` to `app.asar.unpacked`

`mio.patch.yml` ships as an extra resource — it is product data the runtime reads, not app code.

### Cross-architecture builds

Only the host architecture is verified. dsh depends on native modules (ripgrep, koffi, sharp,
`node-addon-require-builtin`) whose binaries arrive in platform-specific packages, and the staging
step installs the ones for the machine it runs on. Producing Intel-Mac, Windows, or Linux
artifacts needs a build on each platform — a CI matrix, not a flag.

### Signing and notarization

Credential-gated, so an unsigned build never fails: `CSC_LINK` (+ `CSC_KEY_PASSWORD`) signs, and
`APPLE_TEAM_ID` (+ `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`) additionally notarizes. A team id
without a certificate degrades to an unsigned build rather than erroring, because notarizing
requires a signed app. `.github/workflows/release.yml` supplies all of them; `build-check.yml`
sets `CSC_IDENTITY_AUTO_DISCOVERY=false` and supplies none.

Three things about this setup are easy to get wrong:

- **Signed is not notarized.** A local `bun run package` picks up whatever Developer ID sits in
  the keychain through electron-builder's identity auto-discovery, so the result is signed and
  hardened — and Gatekeeper still refuses it (`spctl: rejected, source=Unnotarized Developer ID`).
  Notarization is a round trip to Apple and only happens in the release job.
- **The app and the DMG are notarized separately.** electron-builder notarizes the `.app` and
  *then* builds the image around it, so the container a user double-clicks would otherwise carry
  no ticket at all — not "notarized but unstapled", which Gatekeeper's online lookup would still
  rescue, but never submitted. `v0.3.0-rc.1` shipped exactly that, and Apple's
  `syspolicy_check distribution` called it fatal. The `afterAllArtifactBuild` hook in the config
  submits each DMG to `notarytool`, staples it, and validates the ticket; anything short of
  `Accepted` fails the build.
- **The entitlements are ours, not electron-builder's.** `resources/entitlements.mac.plist` is
  checked in and wired explicitly, including as `entitlementsInherit` — left unset, nested
  binaries get electron-builder's bundled template instead. The path in the config is absolute
  because `codesign` receives it verbatim; electron-builder does not resolve it against the
  project directory, and this config is loaded with `--projectDir .package` anyway.
  `disable-library-validation` is the one doing real work: the runtime child is spawned from
  `process.execPath` — the main app executable, so it inherits the app's entitlements — and loads
  thirteen native modules out of `app.asar.unpacked`.
- **The Apple secrets are scoped to the macOS runners.** electron-builder resolves the *Windows*
  signing certificate from `WIN_CSC_LINK` falling back to `CSC_LINK`, so passing the macOS
  Developer ID `.p12` to every job would feed it to signtool's certificate resolution.

Windows signing goes through Azure Trusted Signing (`script/sign-windows.ps1`, wired as
`win.signtoolOptions.sign`). The script exits 0 when the `AZURE_TRUSTED_SIGNING_*` variables are
absent, which is the current state — Windows installers are unsigned, and users see a SmartScreen
prompt. Adding the three secrets is all that is needed; no code change.

## Not built yet (MIGRATION.md, Phase 2)

The app-side updater (`electron-updater`), and with it the `latest*.yml` feed: the config sets
`publish: null` on purpose, because a publish provider makes electron-builder emit updater
metadata that nothing consumes, and per-arch metadata needs a merge step to be correct. Also
`mio://` deep links, native menus, shell-env import, and system CA / proxy propagation.
