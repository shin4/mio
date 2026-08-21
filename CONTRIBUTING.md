# Contributing to Mio

Mio is maintained as a focused desktop coding agent for the MiMo runtime.
Keep changes small, evidence-backed, and aligned with the existing package
boundaries.

## Before Changing Code

- Read `MIGRATION.md` first — it is the plan of record for the move onto
  DeepSeek Harness (dsh), and records which archived behavior was deliberately
  not ported, and why.
- Read `AGENTS.md` for the local style guide and repository-specific commands.
- **dsh-native is the mainline.** Ship dsh's own behavior wherever dsh has an
  answer; add MiMo-specific code only where dsh structurally cannot serve MiMo.
  Check dsh's shipped plugins before building anything, and prefer configuring
  one over writing one.
- New runtime capabilities are new Cordis plugins added to
  `packages/runtime/mio.patch.yml` — never forks of dsh internals.
- Use MiMo project paths and environment variables for new code: `.mio/`,
  `mio.json`, `mio.jsonc`, and `MIO_*`. `.mimo/` and `mimo.json` are read-only
  legacy.
- Do not add default reads or writes for upstream OpenCode project state such
  as `.opencode/`, `opencode.json`, `opencode.jsonc`, or `OPENCODE_*`.
- Do not introduce new providers or release infrastructure without a design
  discussion. The current product direction is MiMo-first.
- `archive/` is frozen reference: port logic out of it, never edit it.

## Development

Install dependencies from the repository root:

```bash
bun install
```

Run the desktop app (starts the dsh runtime and opens the shell):

```bash
bun run dev:desktop
```

Run the runtime on its own, serving the dsh web UI in a browser:

```bash
bun run dev:runtime
```

## Package Checks

Do not run tests from the repository root. Run checks inside package
directories:

```bash
cd packages/llm-mimo && bun typecheck && bun run test
cd packages/shell && bun typecheck
```

Use `bun typecheck`, not `tsc` directly.

## Runtime Composition

Mio composes dsh rather than forking it. Inspect what a change does to the plugin
tree before booting:

```bash
cd packages/runtime
bunx dsh --profile web --dump-default-config          # dsh's own tree
bunx dsh web --patch ./mio.patch.yml --dump-config    # with Mio's layer applied
```

Review generated files before committing.

## Pull Requests

- Use conventional commit-style titles: `type(scope): summary`.
- Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`.
- Scopes are optional; use package names such as `runtime`, `llm-mimo`, `shell`,
  `core`, `llm`, `sdk`, or `plugin` when helpful.
- Include the verification commands you ran and any commands you could not run.
- Keep UI changes accompanied by screenshots or a short recording when the
  visual behavior is material.

## Style

Follow the style guide in `AGENTS.md`. The short version:

- Prefer Bun APIs where they fit.
- Keep logic in one function unless extraction names a real reusable concept.
- Avoid unnecessary destructuring, `let`, `try`/`catch`, and `any`.
- Prefer functional array methods over loops when the result stays readable.
- Add comments for constraints or surprising behavior, not obvious assignments.
