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
`node-addon-require-builtin` native addon. That addon is compiled against Node's ABI, not
Electron's, so under Electron it fails to load. Without the flag, two things break — and only one
of them is loud:

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

Packaging must therefore ship the built plugin as a real directory (`asarUnpack`), since the copy
reads it with plain `fs`.

## Port and profile

The runtime is started with `--port 0`, so the OS picks a free port and the shell reads the URL
back from the runtime's own startup line. A stray `bun run dev:runtime` can never collide with it.

`$DSH_HOME` defaults to the app's data directory when packaged, and to the repo-local
`packages/runtime/.dsh` in development — so the shell boots the same composition
`bun run dev:runtime` provisions rather than a second, empty one.

## Not built yet (MIGRATION.md, Phase 2)

Auto-update, `mio://` deep links, native menus, shell-env import, and system CA / proxy
propagation. Packaging (electron-builder) is not set up.
