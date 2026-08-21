#!/usr/bin/env bun
/**
 * Build the two halves of a dsh client plugin.
 *
 * The browser half is not an ordinary module. dsh's client module system is a
 * lazy CJS table: a plugin bundle is a classic script whose execution only
 * *registers* a factory —
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => … })
 *
 * — and every module body side effect runs later, when the loader materializes
 * that factory. Externals are resolved through the `require` the loader injects
 * rather than through an import map, so the bundle must emit CJS with its
 * shared dependencies left as bare `require()` calls.
 *
 * That contract is dsh's published one: `@deepseek-ai/dsh-client-modules`'
 * README specifies it, and `docs/cookbook/adding-a-settings-card.md` states
 * that a third-party plugin appears "as soon as a `cordis.yml` mounts it — no
 * rebuild of the web application".
 *
 * Upstream builds its own client packages with a shared tsdown preset
 * (`packages/client/tsdown.client.ts`). It is deliberately **not** vendored
 * here: it is ~590 lines wired into dsh's monorepo build faces
 * (`DSH_BUILD_FACE`, the static-link roster, the bundle purity gate, a
 * lightningcss module-CSS pipeline) and imports three repo-internal files, none
 * of which is published. Tracking it would break on every dsh bump to buy
 * machinery Mio does not use. What is reproduced instead is only the artifact
 * shape above, which is small enough to read in one screen, and `test/` asserts
 * that shape so a change to the loader contract fails there rather than as a
 * blank page.
 */
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")
const LIB = path.join(ROOT, "lib")
const pkg = await Bun.file(path.join(ROOT, "package.json")).json()

/**
 * Specifiers the loader supplies, which must survive as `require()` calls.
 *
 * Inlining any of these would be worse than a size regression: the shell seeds
 * one React and one Cordis for the whole page, and a second copy in a plugin
 * bundle means a second hook dispatcher and a second set of service identities.
 */
const EXTERNAL = ["react", "react-dom", "react/*", "@deepseek-ai/*"]

await rm(LIB, { recursive: true, force: true })
await mkdir(LIB, { recursive: true })

// Production JSX. Without it the bundle requires `react/jsx-dev-runtime`,
// which the shell does not seed — the plugin would build cleanly and then fail
// to materialize in the browser. dsh's own client bundles require
// `react/jsx-runtime`.
process.env.NODE_ENV = "production"

const built = await Bun.build({
  entrypoints: [path.join(ROOT, "src", "client", "index.tsx")],
  target: "browser",
  format: "cjs",
  minify: false,
  define: { "process.env.NODE_ENV": '"production"' },
  // Bun accepts glob patterns here, so the whole harness scope is one entry.
  external: EXTERNAL,
})
if (!built.success) {
  for (const log of built.logs) console.error(log)
  throw new Error("bundle: the browser half failed to build")
}

const body = await built.outputs[0]!.text()

// The purity check upstream's preset performs with a plugin: nothing from the
// harness may be inlined, because those packages carry runtime identity
// (services, Symbols, singletons) that must be the page's single copy.
const inlined = body.match(/^\s*\/\/\s*node_modules\/@deepseek-ai\/.*$/m)
if (inlined) throw new Error(`bundle: a harness package was inlined into the browser half: ${inlined[0].trim()}`)

// Every surviving require must be something the loader can actually answer.
// `react/jsx-dev-runtime` is the one that bites: it builds fine and then fails
// at materialization, because the shell seeds the production runtime only.
const SUPPLIED = /^(react|react-dom|react\/jsx-runtime|react-dom\/client|@deepseek-ai\/[\w-]+(\/client)?)$/
const required = [...body.matchAll(/\brequire\("([^"]+)"\)/g)].map((match) => match[1]!)
const unsupplied = [...new Set(required)].filter((specifier) => !SUPPLIED.test(specifier))
if (unsupplied.length > 0)
  throw new Error(`bundle: the loader cannot supply ${unsupplied.join(", ")} — see the client module table`)

const wrapped = [
  `window.__ModuleLoader__.load({`,
  `\tid: ${JSON.stringify(pkg.name)},`,
  `\tfactory: (require) => {`,
  `\t\tvar module = { exports: {} };`,
  `\t\tvar exports = module.exports;`,
  body,
  `\t\treturn module.exports;`,
  `\t}`,
  `});`,
  ``,
].join("\n")

await writeFile(path.join(LIB, "client.js"), wrapped)

// The Node half: plain ESM for the Loader, with the harness left external so
// it resolves to the host's single copy through the profile symlink farm.
const host = await Bun.build({
  entrypoints: [path.join(ROOT, "src", "index.ts")],
  target: "node",
  format: "esm",
  external: ["@deepseek-ai/*"],
})
if (!host.success) {
  for (const log of host.logs) console.error(log)
  throw new Error("bundle: the node half failed to build")
}
await writeFile(path.join(LIB, "index.js"), await host.outputs[0]!.text())

console.log(`bundle: ${pkg.name} → lib/client.js (${(wrapped.length / 1024).toFixed(1)} kB), lib/index.js`)
