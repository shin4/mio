# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mio is a native desktop coding agent for the MiMo model family. Its agent core is being rebuilt on
**DeepSeek Harness** (dsh, `@deepseek-ai/dsh` — Cordis plugin architecture); the previous
OpenCode-derived Effect runtime is **frozen under `archive/`** (branch `archive/opencode-baseline`,
tag `opencode-final`). **`MIGRATION.md` is the plan of record** — read it before touching runtime,
provider, or desktop-shell code. dsh is a fast-moving developer preview: its version is pinned
exact and bumped deliberately.

The repo is a Bun workspace monorepo orchestrated by Turborepo. The product UI is **dsh's native
web client** hosted by a thin Electron shell (`packages/shell`). The legacy SolidJS UI tier and the
OpenCode-derived Electron app were archived on 2026-08-19 — new UI work happens as dsh client UI
plugins (React), which load dynamically from the profile and need no fork of dsh. The workspace
targets Node ≥22.19 (dsh requirement).

## Commands

Run from the repository root unless noted:

```bash
bun install                 # install all workspace deps
bun run dev:runtime         # boot the dsh runtime (web profile + Mio patch layer)
bun run dev:desktop         # run the Electron shell (spawns the runtime, loads the dsh web UI)
bun run lint                # oxlint across the repo (archive/ excluded)
bun run typecheck           # turbo typecheck across all packages
```

**Typecheck** uses `tsgo` (TypeScript native preview), never `tsc`. Per package: `cd packages/<pkg> && bun typecheck`.

**Tests cannot run from the repo root** — the root `test` script intentionally exits (guard
`do-not-run-tests-from-root`). Run them inside a package:

```bash
cd packages/runtime && bun run test      # node --test, type-stripped; boots the real composition
                                        # against replayed MiMo cassettes
cd packages/client-ui && bun run test    # node --test; bundle artifact shape + endpoint/slot rules
```

Packaging and release (see `packages/shell/README.md`):

```bash
cd packages/shell && bun run package    # stage the app tree, then electron-builder for this host
```

Useful dsh inspection commands (from `packages/runtime`):

```bash
bunx dsh --profile web --dump-default-config          # base profile tree
bunx dsh web --patch ./mio.patch.yml --dump-config    # tree with the Mio layer applied
```

## Packages

Active workspace:

- **`packages/runtime`** (`@mio/runtime`) — the dsh-based agent runtime: `mio.patch.yml` composes
  the dsh `web` profile MiMo-first — it configures dsh's own `llm-pi-ai` to serve MiMo (model
  catalog, `reasoning_effort` tiers, `MIO_API_KEY` as a credential reference), inserts
  `@mio/client-ui`, and defaults new sessions to `mimo-v2.5`. **Mio ships no provider code**:
  `@mio/llm-mimo` was deleted in Stage 1 (2026-08-22) once the live API was measured to accept
  `Authorization: Bearer`, the one claim that had justified a Mio-written adapter.
- **`packages/client-ui`** (`@mio/client-ui`) — Mio's dsh client UI plugin, both halves. The Node
  half is a Loader seat (which is what serves the browser half) plus the brand surfaces no slot
  reaches (document title, favicon); the browser half occupies dsh's declared slots for the brand
  mark/name and replaces dsh's onboarding credential step with MiMo account connection
  (billing track derived from the key prefix, region only for a token plan, key proven by a live
  `discoverModels` call before it is stored).
- **`packages/shell`** (`@mio/shell`) — the Electron app, written from scratch. Spawns the dsh
  runtime as a child process, reads its URL back, and loads it in a sandboxed window. Signed and
  notarized on release (macOS app *and* DMG). `packages/shell/README.md` documents the two
  environment facts that cost real debugging (`--expose-internals`, profile-relative plugin
  resolution) plus the signing seams.

That is the whole active workspace — three packages.

Frozen (not installed, built, linted, or tested — reference only, do not modify):

- **`archive/packages/{agent,llm,plugin,http-recorder}`** — the OpenCode-derived core.
- **`archive/packages/{app,ui,core,sdk,desktop}`** — the Solid UI tier and the old Electron app,
  archived 2026-08-19. Still the reference for MiMo UX, the onboarding flow, the TTS/dictation
  implementations, and the app icon set (`desktop/icons/prod/`).

`archive/README.md` lists the highest-value porting references. Port logic out of it, but see the
scope principle below before assuming something should be ported at all.

## Architecture

**Runtime: everything is a dsh plugin.** Capabilities compose via Cordis; the Mio composition is a
patch-list overlay (`packages/runtime/mio.patch.yml`) over dsh's `web` profile. Patch semantics:
a bare `id` entry merges config into an existing row, `insert:` appends new rows. New runtime
capabilities are new Cordis plugins (workspace packages) added to the patch layer — not forks of
dsh internals. Model providers register via `ctx.llm.registerAdapter(routes, adapter)`; streaming
model calls are interceptable through the `llm/stream` waterfall event — the seam for any future
MiMo-specific stream handling, none of which is currently planned (see the Phase 1 audit).

**Desktop = thin shell around the dsh web UI.** Electron main spawns the dsh runtime (web profile
+ Mio patch layer) as a child process and loads the local dsh host URL. There is no BFF and no
renderer port. `dsh-web-frontend` is a prebuilt static dist served by the dsh host, with `zh`/`en`
locales — but that dist is **not** a wall: client UI plugins load dynamically from the profile at
runtime, and the host exposes `ctx.webServer.tapIndex()` plus named exact routes that shadow dist
files. MiMo product UX lands as dsh client UI plugins on those seams, not as a fork (MIGRATION.md,
Phase 3 Stage 2).

**dsh discipline (from upstream AGENTS.md):** registrations are effects returning disposers;
everything model-visible must be reconstructable from the append-only session log; waterfall
listeners must call `next()` to delegate; cross-boundary IDs are branded, never bare strings;
deployment-varying choices belong in validated `Config` fields, never hardcoded.

## Mio project-state isolation (important)

Mio deliberately runs beside upstream OpenCode without sharing local state. When adding code:

- Read/write **`.mio/`** for project-local agents/commands/skills/plugins/tools/plans, and
  **`mio.json` / `mio.jsonc`** for project config. Use **`MIO_*`** environment variables
  (the old registry is archived at `archive/packages/core/src/flag/flag.ts`; live uses today are
  `MIO_API_KEY` and `MIO_VERSION`). Phase 3 bridges these onto cordis.yml layers.
- **`.mimo/`** and **`mimo.json` / `mimo.jsonc`** are **read-only legacy** — do not add new writes.
- Do **not** add default reads/writes for `.opencode/`, `opencode.json`, `opencode.jsonc`, or
  `OPENCODE_*` env.
- The `@opencode-ai/*` package names and `createOpencode*` symbols **retired with the Solid tier**
  on 2026-08-19; no compatibility shim survives in the active workspace.
- **Providers (revised 2026-08-22):** Mio keeps dsh's **native DeepSeek compatibility** alongside
  native-level MiMo support — the earlier MiMo-first line that dropped the bundled provider routes
  is superseded by an explicit product decision (MIGRATION.md, Phase 3). Both route families now
  ship enabled: MiMo rides `llm-pi-ai` and gets a real editor on dsh's own Models page, and
  `llm-deepseek` came back beside it once Mio owned onboarding — with it enabled but no Mio step,
  a first launch opened on DeepSeek's credential prompt. Beyond those, no new model providers
  without a design discussion.
- **dsh-native is the mainline** (MIGRATION.md scope principle): ship dsh's own behavior wherever
  dsh has an answer; add MiMo-specific code only where dsh structurally cannot serve MiMo. Check
  dsh's shipped plugins before building anything, and prefer configuring one over writing one.
  Do not port archived behavior just because the old core had it — MIGRATION.md records which
  archived pieces were audited and rejected, and why.

## Conventions

- Follow the style guide in **`AGENTS.md`** (Bun APIs in UI-tier packages, no `try`/`catch`/`else`/
  `any`, early returns, `const` over `let`, inline single-use values, functional array methods).
  New runtime-tier packages (`packages/runtime`, `packages/client-ui`) target Node ≥22.19 with
  erasable-syntax TypeScript (Node type-stripping: no enums, no runtime namespaces).
- Avoid mocks in tests; exercise real implementations. With no Mio adapter left to unit-test,
  `packages/runtime` boots the real headless composition against a local server replaying real
  MiMo cassettes (`test/fixtures`, captured from the live API) and asserts the answer a user
  would see (`node --test`, type-stripped) — no stubbed clients.
- dsh dependencies are pinned **exact** and gated by `bunfig.toml`'s `minimumReleaseAge` (3 days).
- Commits and PR titles use conventional `type(scope): summary` — types `feat`/`fix`/`docs`/`chore`/
  `refactor`/`test`; scopes are package names (`runtime`, `client-ui`, `shell`, `app`, `desktop`,
  `core`, `ui`, `sdk`). The default branch is `main`.
