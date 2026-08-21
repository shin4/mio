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
 * Every dsh package the workspace installed, at the exact version it installed.
 *
 * Both halves matter. The versions are carried over because dsh pins its own
 * siblings with `^` ranges: npm would resolve them to whatever is newest, so a
 * build would ship dsh rc.6 with rc.7 internals — a combination nothing here
 * was tested against. Bun stops at the tested set because `bunfig.toml`'s
 * `minimumReleaseAge` gates newer releases; npm has no such gate.
 *
 * The whole set is then declared explicitly rather than left to npm's
 * resolution, because dsh's packages depend on each other largely through
 * peerDependencies — `dsh-app-boot` imports `cordis-plugin-group` at runtime
 * and declares it only as a peer, which `npm install --omit=dev` does not
 * materialize. Shipping the resolved set is also simply the honest thing: it is
 * the set the replay suite and the shell were verified against.
 */
async function pinnedVersions(): Promise<Record<string, string>> {
  const store = path.join(WORKSPACE, "node_modules", ".bun", "node_modules", "@deepseek-ai")
  const entries = await readdir(store)
  const pins: Record<string, string> = {}
  for (const entry of entries) {
    const raw = await readFile(path.join(store, entry, "package.json"), "utf8").catch(() => undefined)
    if (raw === undefined) continue
    const version = (JSON.parse(raw) as { version?: string }).version
    if (version) pins[`@deepseek-ai/${entry}`] = version
  }
  return pins
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

const pins = await pinnedVersions()
if (pins["@deepseek-ai/dsh"] !== shellPkg.dependencies["@deepseek-ai/dsh"])
  throw new Error(
    `stage: workspace has dsh ${pins["@deepseek-ai/dsh"]} but package.json pins ${shellPkg.dependencies["@deepseek-ai/dsh"]}; run bun install`,
  )

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
      dependencies: { ...pins, "@mio/client-ui": `file:${tarball}` },
      // Also as overrides, so anything npm pulls in transitively collapses onto
      // the same versions instead of introducing a second copy.
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
