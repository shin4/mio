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
cannot reach Node's internals from there. Without the flag, two things break — and only one of
them is loud:

- the loader silently falls back to resolving plugin entries from its own location, so profile
  plugins (including `@mio/llm-mimo`) are not found;
- the HMR service refuses to start and takes the boot down with it.

## How Mio's plugins reach the runtime

dsh resolves a plugin entry **relative to the profile directory**, walking up from
`$DSH_HOME/profiles/web`. The profile lives in the user's data directory, whose parent chain never
reaches the app bundle, so a plugin shipped inside the app is invisible until it is placed in the
profile itself.

`src/profile.ts` does that at startup: a plain directory copy of the plugin's published surface
(`package.json` + `lib/`), re-copied when the shipped version differs so an app update replaces
what the previous version left behind. No package manager runs on the user's machine — dsh
symlinks its own installation's packages into `profiles/node_modules` when it scaffolds, and the
copied plugin resolves its `peerDependencies` through that farm.

`@mio/llm-mimo` is a dependency of this package for one reason only: so electron-builder collects
it into the app. Module resolution never goes through it — the runtime resolves the copy in the
profile. Packaging ships it as a real directory (`asarUnpack`) since the startup copy reads it
with plain `fs`.

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

## Not built yet (MIGRATION.md, Phase 2)

Auto-update, `mio://` deep links, native menus, shell-env import, and system CA / proxy
propagation. Packaging (electron-builder) is not set up.
