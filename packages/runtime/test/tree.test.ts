/**
 * The resolved dsh tree must be one release, not a mixture.
 *
 * dsh pins its own siblings with `^` ranges, and eighteen of its packages are
 * reachable *only* as peerDependencies — nothing in the tree declares them as
 * an ordinary dependency. Bun resolves an auto-installed peer once and then
 * holds it: bumping the `@deepseek-ai/dsh` pin moves everything reachable
 * through a normal dependency edge and leaves those eighteen where they were.
 *
 * Nothing complains when that happens. `bun install` succeeds, typecheck and
 * the replay suites pass, and the tree quietly carries a mix of releases —
 * eighteen packages sat at `0.1.0-rc.6` through four consecutive bumps, eight
 * of them at a version that satisfied *no* declared range in the tree, while
 * their own stale ranges dragged in a second private copy of twenty-three core
 * packages at `0.1.0-rc.8`. `packages/shell/scripts/stage.ts` copies the
 * resolved set into the app, so that mixture is what releases shipped.
 *
 * The fix is the eighteen explicit pins in this package's `dependencies`,
 * which turn peer edges into ordinary ones so a bump moves them too. This test
 * is what keeps the fix honest: `bun.lock` is the reviewed record of what the
 * suites actually ran against, so it is what gets asserted. Bun's `overrides`
 * are deliberately not used — they do not reach auto-installed peers, which
 * was verified against this exact tree.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RUNTIME = path.resolve(HERE, "..")
const WORKSPACE = path.resolve(RUNTIME, "..", "..")

/** Every package `bun.lock` resolved, as name → the versions it resolved to. */
async function resolvedVersions(): Promise<Map<string, Set<string>>> {
  // bun.lock is JSONC — line comments and trailing commas, neither of which
  // JSON.parse accepts. The file has no block comments, and the only `//` in
  // it lives inside quoted values this never splits on.
  const raw = await readFile(path.join(WORKSPACE, "bun.lock"), "utf8")
  const lock = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")) as {
    packages?: Record<string, unknown[]>
  }

  const versions = new Map<string, Set<string>>()
  for (const entry of Object.values(lock.packages ?? {})) {
    const spec = entry[0]
    if (typeof spec !== "string") continue
    const at = spec.lastIndexOf("@")
    if (at <= 0) continue
    const version = spec.slice(at + 1)
    // Workspace members carry `workspace:packages/...` rather than a version.
    if (version.startsWith("workspace:") || version.startsWith("file:")) continue
    const name = spec.slice(0, at)
    versions.set(name, (versions.get(name) ?? new Set()).add(version))
  }
  return versions
}

/** The version this package pins, which the whole family must agree with. */
async function pinnedDshVersion(): Promise<string> {
  const raw = await readFile(path.join(RUNTIME, "package.json"), "utf8")
  const pkg = JSON.parse(raw) as { dependencies: Record<string, string> }
  const pin = pkg.dependencies["@deepseek-ai/dsh"]
  assert.ok(pin, "packages/runtime no longer pins @deepseek-ai/dsh")
  return pin
}

test("every dsh package resolves to the pinned release", async () => {
  const [versions, pin] = await Promise.all([resolvedVersions(), pinnedDshVersion()])

  const strays = [...versions]
    .filter(([name]) => name.startsWith("@deepseek-ai/dsh"))
    .flatMap(([name, found]) => [...found].filter((v) => v !== pin).map((v) => `${name}@${v}`))
    .sort()

  assert.deepEqual(
    strays,
    [],
    `${strays.length} dsh package(s) disagree with the ${pin} pin. A peer-only package needs an ` +
      `explicit entry in packages/runtime/package.json dependencies to move with a bump.`,
  )
})

test("no dsh package is resolved at two versions at once", async () => {
  const versions = await resolvedVersions()

  const doubled = [...versions]
    .filter(([name, found]) => name.startsWith("@deepseek-ai/") && found.size > 1)
    .map(([name, found]) => `${name} (${[...found].sort().join(", ")})`)
    .sort()

  // A second private copy is how the stale peers stayed invisible: they were
  // one version behind, and the tree grew a nested older copy of everything
  // they depended on rather than reporting a conflict.
  assert.deepEqual(doubled, [], `${doubled.length} package(s) resolve at more than one version`)
})

test("the peer-only packages are pinned explicitly, not left to peer resolution", async () => {
  const raw = await readFile(path.join(RUNTIME, "package.json"), "utf8")
  const pkg = JSON.parse(raw) as { dependencies: Record<string, string> }
  const pin = await pinnedDshVersion()

  const declared = Object.entries(pkg.dependencies).filter(([name]) => name.startsWith("@deepseek-ai/dsh-"))
  // Not an exact-count assertion: upstream may add or retire a peer-only
  // package, and the test above already catches a family that drifts apart.
  // What must not happen is the list silently emptying out.
  assert.ok(declared.length > 0, "the explicit peer pins are gone; a bump will leave them behind again")

  const disagreeing = declared.filter(([, version]) => version !== pin).map(([name, version]) => `${name}@${version}`)
  assert.deepEqual(disagreeing, [], `explicit pins must move with the dsh pin (${pin})`)
})
