# @mio/runtime

Mio's agent runtime, composed on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(dsh) instead of the archived OpenCode-derived Effect runtime. See MIGRATION.md at the repo root
for the full replacement plan; this package is the Phase 1/2 seam.

## What lives here

- `mio.patch.yml` — the Mio patch layer over dsh's `web` profile: registers the
  `@mio/llm-mimo` provider adapter, defaults sessions to `mimo-v2.5`, and disables
  the DeepSeek/pi-ai routes.
- `dev` script — `dsh web --patch ./mio.patch.yml`, boots the dsh Web UI with the
  Mio composition (`bun run dev:runtime` from the repo root).

## Known gaps (tracked in MIGRATION.md)

- dsh profiles install plugins via pnpm into `$DSH_HOME/profiles/<name>`; loading
  `@mio/llm-mimo` from the workspace needs either `dsh plugin add` with a packed
  tarball or a build step — Node refuses to type-strip TS inside node_modules, so
  the plugin needs compiled JS before it can be installed into a profile.
- The Electron shell still spawns the archived sidecar stub; wiring it to a dsh
  runtime (stdio JSON-RPC SDK or the web host) is Phase 2.

## Useful commands

```bash
bunx dsh --profile web --dump-default-config   # inspect the base profile tree
bunx dsh web --patch ./mio.patch.yml           # boot the Mio composition
```
