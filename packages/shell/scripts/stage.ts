#!/usr/bin/env bun
/**
 * Stage the app tree electron-builder packages.
 *
 * The workspace is installed by Bun, whose layout keeps most transitive
 * packages in `node_modules/.bun` rather than a walkable `node_modules` tree.
 * electron-builder has no Bun dependency-tree extractor and falls back to file
 * traversal, which silently misses those packages — a build made straight from
 * the workspace ships an incomplete dsh and dies at runtime on the first
 * unresolvable import.
 *
 * So packaging never reads the workspace tree. This script writes a minimal
 * app package into `.package/` and installs its production dependencies with
 * npm, which produces the ordinary layout electron-builder understands.
 *
 * Mio contributes no *provider* package here — MiMo is served by dsh's own
 * `llm-pi-ai` adapter through `mio.patch.yml`, which ships as an extra
 * resource. It does contribute `@mio/client-ui`, whose browser half the client
 * module system serves to the page, so that one is packed in.
 */
import { $ } from "bun"
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const SHELL = path.resolve(import.meta.dir, "..")
const CLIENT_UI = path.resolve(SHELL, "..", "client-ui")
const STAGE = path.join(SHELL, ".package")
const WORKSPACE = path.resolve(SHELL, "..", "..")

/**
 * Every package the app's own dependency closure resolved, at the exact
 * version the workspace resolved it to.
 *
 * The source is `bun.lock`, not the installed tree. Three separate reasons
 * make the lockfile the only honest input:
 *
 * - **`node_modules/.bun/node_modules` is a lossy view.** It holds one
 *   directory per package *name*, so a name the tree legitimately resolves at
 *   two versions shows up as whichever one Bun hoisted, and pinning from it
 *   silently collapses the other.
 * - **It is also not pruned.** Bun leaves entries there from previous
 *   installs — a long-lived checkout accumulates packages no current
 *   dependency asks for. Reading it made packaging depend on the machine's
 *   install history: a stale directory was enough to pin, and ship, a version
 *   the lockfile never mentions. CI never saw this; only developer machines
 *   did.
 * - **`@deepseek-ai/*` was never the whole risk.** dsh reaches native and wire
 *   libraries through `^` ranges of its own — `sharp` decides the bytes
 *   `dsh-attachment-local` produces, and `@earendil-works/pi-ai` is the wire
 *   library that actually serves MiMo. npm resolves those to whatever is
 *   newest, so the app shipped libraries the replay suite never ran against.
 *
 * Scoped to the closure reachable from `@deepseek-ai/dsh` so the workspace's
 * own tooling never leaks into the app's pin set. A name the closure resolves
 * at more than one version is deliberately left unpinned rather than flattened
 * — one pin cannot express two versions, and quietly picking either is the bug
 * this function was rewritten to stop. Those are returned so the caller can
 * say so out loud.
 */
async function pinnedVersions(): Promise<{ pins: Record<string, string>; ambiguous: string[] }> {
  // bun.lock is JSONC: line comments and trailing commas, neither of which
  // JSON.parse accepts. The file has no block comments, and its only `//` is
  // inside quoted values this never splits on.
  const raw = await readFile(path.join(WORKSPACE, "bun.lock"), "utf8")
  const lock = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")) as {
    packages?: Record<string, unknown[]>
  }

  const versions = new Map<string, Set<string>>()
  const edges = new Map<string, Set<string>>()
  for (const entry of Object.values(lock.packages ?? {})) {
    const spec = entry[0]
    if (typeof spec !== "string") continue
    const at = spec.lastIndexOf("@")
    if (at <= 0) continue
    const version = spec.slice(at + 1)
    // A workspace member resolves to `workspace:packages/...` and is packed
    // separately; it carries no registry version to pin.
    if (version.startsWith("workspace:") || version.startsWith("file:")) continue
    const name = spec.slice(0, at)
    versions.set(name, (versions.get(name) ?? new Set()).add(version))

    const info = entry.find((field): field is Record<string, unknown> => typeof field === "object" && field !== null)
    const declared = [info?.["dependencies"], info?.["peerDependencies"]]
      .filter((table): table is Record<string, string> => typeof table === "object" && table !== null)
      .flatMap((table) => Object.keys(table))
    edges.set(name, new Set([...(edges.get(name) ?? []), ...declared]))
  }

  // Walk by name, not by lockfile key: keys are resolution *paths*, so a
  // nested copy lives under a different key and a path walk would miss it.
  const reachable = new Set<string>()
  const visit = (name: string) => {
    if (reachable.has(name)) return
    reachable.add(name)
    for (const dep of edges.get(name) ?? []) visit(dep)
  }
  visit("@deepseek-ai/dsh")

  const resolved = [...reachable].flatMap((name) => {
    const found = versions.get(name)
    if (found === undefined) return []
    return [[name, [...found]] as const]
  })
  return {
    pins: Object.fromEntries(resolved.filter(([, found]) => found.length === 1).map(([name, found]) => [name, found[0]])),
    ambiguous: resolved
      .filter(([, found]) => found.length > 1)
      .map(([name, found]) => `${name} (${[...found].sort().join(", ")})`)
      .sort(),
  }
}

/**
 * Refuse to package a dsh family that is not internally consistent.
 *
 * dsh pins its own siblings with `^` ranges and several of its packages are
 * reachable only as peerDependencies, which Bun resolves once and then holds
 * across bumps. The drift is silent: `bun install` succeeds, the gates pass,
 * and the tree carries a mix of releases — eighteen packages sat six releases
 * behind the pin through four consecutive bumps before anyone looked. A
 * release is the worst place to find that out, so it is checked here as well
 * as in `packages/runtime/test/tree.test.ts`.
 */
function assertOneDshFamily(pins: Record<string, string>, expected: string) {
  const strays = Object.entries(pins)
    .filter(([name, version]) => name.startsWith("@deepseek-ai/dsh") && version !== expected)
    .map(([name, version]) => `${name}@${version}`)
  if (strays.length > 0)
    throw new Error(
      `stage: ${strays.length} dsh package(s) disagree with the ${expected} pin: ${strays.join(", ")}; run bun install`,
    )
}

const shellPkg = await Bun.file(path.join(SHELL, "package.json")).json()

/**
 * The version electron-builder stamps into the app. `packages/shell` is private
 * and never version-bumped, so a release supplies the number through the
 * environment rather than through a commit that mutates a tracked file.
 */
const appVersion = (process.env.MIO_VERSION ?? shellPkg.version).replace(/^v/, "")

await $`bun run --cwd ${CLIENT_UI} build`
await $`bun run --cwd ${SHELL} build`

await rm(STAGE, { recursive: true, force: true })
await mkdir(STAGE, { recursive: true })

// `npm pack` honors the plugin's `files` field, so the staged copy carries its
// published surface and nothing from the checkout.
await $`npm pack --pack-destination ${STAGE} --silent`.cwd(CLIENT_UI).quiet()
const tarball = (await readdir(STAGE)).find((entry) => entry.endsWith(".tgz"))
if (!tarball) throw new Error("stage: npm pack produced no tarball")

const { pins, ambiguous } = await pinnedVersions()
// Never a silent truncation: a name the closure resolves at several versions
// is left to npm, and saying which ones keeps that visible in the build log.
if (ambiguous.length > 0) console.log(`stage: ${ambiguous.length} package(s) left unpinned (multi-version): ${ambiguous.join(", ")}`)
if (pins["@deepseek-ai/dsh"] !== shellPkg.dependencies["@deepseek-ai/dsh"])
  throw new Error(
    `stage: workspace has dsh ${pins["@deepseek-ai/dsh"]} but package.json pins ${shellPkg.dependencies["@deepseek-ai/dsh"]}; run bun install`,
  )
assertOneDshFamily(pins, shellPkg.dependencies["@deepseek-ai/dsh"])

/**
 * The dsh family, which the app must install outright.
 *
 * Only this subset becomes `dependencies`: it is the set whose peers npm will
 * not materialize on its own. Everything else the workspace resolved rides in
 * `overrides` below, where it constrains what npm pulls in transitively
 * without adding the workspace's own tooling to the app tree.
 */
const dshPins = Object.fromEntries(Object.entries(pins).filter(([name]) => name.startsWith("@deepseek-ai/")))

await writeFile(
  path.join(STAGE, "package.json"),
  `${JSON.stringify(
    {
      // Electron derives the app name — and therefore `app.getPath("userData")`
      // — from this file. The workspace's scoped name would put user data under
      // `Application Support/@mio/shell`.
      name: "mio",
      productName: "Mio",
      version: appVersion,
      description: shellPkg.description,
      private: true,
      type: "module",
      main: "./lib/main.js",
      dependencies: { ...dshPins, "@mio/client-ui": `file:${tarball}` },
      // Every resolved version as an override, so anything npm pulls in
      // transitively collapses onto the verified one instead of introducing a
      // second copy or drifting to a newer release. An override for a package
      // the app tree never requests is inert, which is why this can be the
      // whole lockfile rather than a hand-picked list that goes stale.
      overrides: pins,
    },
    null,
    2,
  )}\n`,
)

// npm 11 blocks install scripts unless approved, and they stay blocked here:
// every native binary dsh needs arrives prebuilt in a platform package
// (@koromix/koffi-*, @vscode/ripgrep-*, node-addon-require-builtin-*), so the
// three pending scripts are a source build koffi does not need, a protobufjs
// warning, and a no-op echo. Do not blanket-approve them to silence the warning.
await $`npm install --omit=dev --no-audit --no-fund`.cwd(STAGE)
await rm(path.join(STAGE, tarball), { force: true })
// `fs.cp` rather than a shell copy: this script runs on the Windows and Linux
// CI runners too.
await cp(path.join(SHELL, "lib"), path.join(STAGE, "lib"), { recursive: true })

const staged = (await readdir(path.join(STAGE, "node_modules", "@deepseek-ai"))).length
console.log(`stage: app tree ready at ${STAGE} v${appVersion} (${staged} dsh packages)`)
