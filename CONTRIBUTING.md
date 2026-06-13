# Contributing to Mio

Mio is maintained as a focused desktop coding agent for the MiMo runtime.
Keep changes small, evidence-backed, and aligned with the existing package
boundaries.

## Before Changing Code

- Read `AGENTS.md` for the local style guide and repository-specific commands.
- Use MiMo project paths and environment variables for new code: `.mimo/`,
  `mimo.json`, `mimo.jsonc`, and `MIO_*`.
- Do not add default reads or writes for upstream OpenCode project state such
  as `.opencode/`, `opencode.json`, `opencode.jsonc`, or `OPENCODE_*`.
- Keep package scope and SDK compatibility symbols such as `@opencode-ai/*`
  and `createOpencode*` unless a dedicated API migration says otherwise.
- Do not introduce new providers or release infrastructure without a design
  discussion. The current product direction is MiMo-first.
- The v2 session/provider path under `packages/agent/src/v2/` is an in-progress
  migration. `src/v2/provider-parity-checklist.md` tracks legacy behavior still
  to be ported from `src/provider/provider.ts` — consult it before touching
  provider setup, model filtering, or auth.

## Development

Install dependencies from the repository root:

```bash
bun install
```

Run the desktop app:

```bash
bun run dev:desktop
```

Run the agent and app separately:

```bash
bun run dev:agent
bun run dev:app
```

## Package Checks

Do not run tests from the repository root. Run checks inside package
directories:

```bash
cd packages/agent && bun typecheck
cd packages/app && bun typecheck
cd packages/core && bun typecheck
cd packages/desktop && bun typecheck
cd packages/llm && bun typecheck
```

Use `bun typecheck`, not `tsc` directly.

## SDK Generation

If API or SDK output changes, regenerate the JavaScript SDK with:

```bash
./packages/sdk/js/script/build.ts
```

Review generated files before committing.

## Pull Requests

- Use conventional commit-style titles: `type(scope): summary`.
- Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`.
- Scopes are optional; use package names such as `agent`, `app`, `desktop`,
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
