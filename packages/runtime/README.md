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

## How the plugin reaches the runtime

dsh resolves a plugin entry **relative to the profile directory**, walking up from
`$DSH_HOME/profiles/web`. So a plugin is installed by copying its published surface
(`package.json` + `lib/`) into `profiles/web/node_modules/@mio/llm-mimo` — that is all
`setup-profile.ts` does, and the desktop shell does the same thing at startup
(`packages/shell/src/profile.ts`).

No package manager is involved. When dsh scaffolds a profile it symlinks the running
installation's packages into `profiles/node_modules`, so the copied plugin resolves its
`peerDependencies` through that farm and shares the host's single `dsh-llm` — two copies
would mean two `LlmAdapter` classes and silently divergent `instanceof` behavior.

The copy may run before the profile exists: dsh scaffolds around it and leaves it in place.

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

## Selecting the billing track

The composition ships `pay-as-you-go`. A token-plan account sets its track and region in the
profile's **user settings** (`$DSH_HOME/settings.yaml`, i.e. `.dsh/settings.yaml` for the
repo-local profile) — not in `mio.patch.yml`, which is product composition rather than a
deployment choice:

```yaml
llm-mimo:
  billing: token-plan
  region: cn
```

The settings section is live: `installSettingsSection` re-resolves the connection per request, so
a changed track, region, or key reaches the next request without a restart. Never put the API key
in this file — it belongs in the credentials seam.

## Headless checks and the directory picker

`directory-picker-auto` resolves to the **native** OS dialog on a desktop session, which an
automated check cannot drive. To pick a workspace from inside the page, pin the browse pair with
an extra overlay (test-only — do not fold this into `mio.patch.yml`):

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

```bash
dsh web --patch ./mio.patch.yml --patch ./browse-picker.yml
```

## Useful commands

```bash
bunx dsh --profile web --dump-default-config          # base profile tree
bunx dsh web --patch ./mio.patch.yml --dump-config    # tree with the Mio layer applied
```

## Known gaps (tracked in MIGRATION.md)

- The Electron shell still spawns the archived sidecar stub; Phase 2 turns it into a thin
  wrapper around this runtime.
- MiMo product UI (connection form, cache meter, quota dialogs) is not built yet.
