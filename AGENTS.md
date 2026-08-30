# AGENTS.md

Style guide and working rules for this repository. `MIGRATION.md` is the plan of record for the
move onto DeepSeek Harness (dsh) — read it before touching runtime, provider, or shell code.

- The default branch is `main`.
- `archive/` is frozen reference code: port logic **out** of it, never edit it.

## Architecture Rules

These outrank stylistic preferences.

- **dsh-native is the mainline.** Ship dsh's own behavior wherever dsh has an answer. Add
  MiMo-specific code only where dsh structurally cannot serve MiMo. Check dsh's shipped plugins
  before building anything, and prefer configuring one over writing one.
- **Verify against the real thing, not against the old code.** Every MiMo capability in this repo
  was settled by probing the live API or reading dsh's shipped source — not by copying what the
  archived runtime did. MIGRATION.md records which archived behavior was audited and rejected.
- **New capabilities are new Cordis plugins** added to `packages/runtime/mio.patch.yml`, never
  forks of dsh internals. Patch semantics: a bare `id` merges config into an existing row,
  `insert:` appends new rows.
- **Deployment-varying choices are validated `Config` fields**, never hardcoded. A user's billing
  track belongs in settings; product composition belongs in the patch layer.

### dsh plugin discipline (from upstream AGENTS.md)

- Registrations are effects that return disposers.
- Everything model-visible must be reconstructable from the append-only session log.
- Waterfall listeners must call `next()` to delegate.
- Cross-boundary IDs are branded, never bare strings.

## Packages

| Package | Tier | Runs on |
|---|---|---|
| `packages/runtime` (`@mio/runtime`) | dsh composition (`mio.patch.yml` + profile setup) | Node ≥22.19 |
| `packages/llm-mimo` (`@mio/llm-mimo`) | Cordis plugin: the MiMo provider adapter | Node ≥22.19 |
| `packages/shell` (`@mio/shell`) | Electron desktop shell | Electron (bundled Node) |

## Language and Runtime

The runtime tier targets **Node**, not Bun. Do not reach for `Bun.file()` or other Bun APIs in
`packages/{runtime,llm-mimo,shell}` source — `node:fs/promises` and friends are the vocabulary.
Bun is the package manager and task runner, and may be used in build/setup scripts
(`packages/runtime/scripts/setup-profile.ts` is one).

**Erasable syntax only.** These packages are run by Node's type stripping, which rejects enums,
runtime namespaces, and constructor parameter properties. `erasableSyntaxOnly` is on in their
tsconfigs, so the typechecker catches this before Node does.

```ts
// Bad — parameter property; Node's strip-only mode refuses it
constructor(private readonly options: Options) {}

// Good
readonly options: Options
constructor(options: Options) {
  this.options = options
}
```

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable.
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the
  helper is reused, hides a genuinely complex boundary, or has a clear independent name that
  improves the caller.
- Avoid `try`/`catch` where possible.
- Avoid the `any` type.
- Rely on type inference; avoid explicit annotations unless needed for exports or clarity.
- Prefer functional array methods (`flatMap`, `filter`, `map`) over for loops; use type guards on
  `filter` to keep inference downstream.
- Reduce total variable count by inlining a value used only once.

```ts
// Good
const usage = JSON.parse(await readFile(path.join(dir, "usage.json"), "utf8"))

// Bad
const usagePath = path.join(dir, "usage.json")
const raw = await readFile(usagePath, "utf8")
const usage = JSON.parse(raw)
```

### Wire Types

Types that describe a provider's wire format must say what the provider actually sends, verified
against a cassette. MiMo sends explicit `null` for absent fields, so the types say `| null` rather
than implying the key is merely optional.

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else`. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Complex Logic

When a function has several validation branches or supporting details, make the main function read
as the happy path and move supporting details into small helpers below it.

```ts
// Good
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) {
  ...
}
```

- Keep helpers close to the code they support, below the main export when that improves readability.
- Do not over-abstract simple expressions into single-use helpers; extract only when it names a
  real concept like `requireConfig` or `readMetadata`.
- Add comments for non-obvious constraints and surprising behavior — a provider quirk, a flag that
  is load-bearing, a deliberate omission — not for obvious assignments or control flow.

## Testing

- Avoid mocks. Exercise the real implementation.
- Provider behavior is tested by **replaying cassettes captured from the live API**
  (`packages/llm-mimo/script/record.ts` records them; `test/adapter.test.ts` replays them over a
  local HTTP server). Cassettes never contain credentials.
- Tests cannot run from the repo root (guard: `do-not-run-tests-from-root`). Run them from the
  package directory: `cd packages/llm-mimo && bun run test`.
- The runtime tier's tests run under `node --test` with type stripping, not `bun test`.

## Type Checking

Run `bun typecheck` from a package directory, or `bun run typecheck` (turbo) from the root. Never
invoke `tsc` — typechecking uses `tsgo` (TypeScript native preview).

## Dependencies

- dsh packages are pinned **exact** and gated by `bunfig.toml`'s `minimumReleaseAge` (3 days). dsh
  is a developer preview that warns of breaking changes: bump the pin deliberately, then re-run
  the replay suite and boot the shell.
- A plugin's dsh packages belong in `peerDependencies` (plus `devDependencies` for local checks)
  so an installed plugin resolves the host's copies. Two copies of `dsh-llm` means two
  `LlmAdapter` classes and silently divergent `instanceof` behavior.

## Commits and PR Titles

Use conventional commit-style messages and PR titles: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes are optional; use
the affected package: `runtime`, `llm-mimo`, `shell`.

Examples: `feat(llm-mimo): expose MiMo's reasoning-effort tiers`,
`chore(shell): pin the runtime child to Electron's Node`, `docs: align AGENTS.md to dsh`.
