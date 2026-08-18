# @mio/runtime

Mio's agent runtime, composed on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(dsh) instead of the archived OpenCode-derived Effect runtime. See MIGRATION.md at the repo root
for the full replacement plan.

## What lives here

- `mio.patch.yml` — the Mio patch layer over dsh's `web` profile: registers the
  `@mio/llm-mimo` provider adapter, defaults sessions to `mimo-v2.5`, and disables
  the bundled DeepSeek/pi-ai routes.
- `scripts/setup-profile.ts` — provisions the repo-local profile in `.dsh/` (gitignored)
  and installs the plugin there. Idempotent; re-run after changing `packages/llm-mimo`.

```bash
bun run dev:runtime      # from the repo root: setup + boot the Mio composition
```

## Why the plugin is installed as a tarball, not a link

`setup-profile.ts` packs `@mio/llm-mimo` and installs the tarball. A `link:` install would
resolve the plugin's `@deepseek-ai/*` imports from the repo's own `node_modules`, so the
runtime would hold **two copies** of `dsh-llm`: the `LlmAdapter` the plugin extends would
not be the class the profile's `ctx.llm` knows, and `instanceof`-shaped behavior (error
classification, retry policy) would silently diverge. Installing the tarball lets the
plugin's `peerDependencies` resolve to the profile's copies, exactly as a published
install would.

## Supplying the MiMo API key

The dsh Models page renders a key input only for provider families it ships a hand-written
card for (`layoutOf()` in `dsh-client-ui-settings-models` knows `llm-deepseek` and
`llm-pi-ai`; everything else falls back to a read-only card). Until Mio ships its own
provider card as a dsh client UI plugin (MIGRATION.md, Phase 3), supply the key through the
credentials seam instead — export it in the launching environment:

```bash
MIO_API_KEY=<your key> bun run dev:runtime
```

`.env` files and the credentials store also work; the reference name is configurable via the
plugin's `apiKeyEnv` config.

## Useful commands

```bash
bunx dsh --profile web --dump-default-config          # base profile tree
bunx dsh web --patch ./mio.patch.yml --dump-config    # tree with the Mio layer applied
```

## Known gaps (tracked in MIGRATION.md)

- The Electron shell still spawns the archived sidecar stub; Phase 2 turns it into a thin
  wrapper around this runtime.
- MiMo product UI (connection form, cache meter, quota dialogs) is not built yet.
