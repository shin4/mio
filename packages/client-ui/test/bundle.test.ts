/**
 * Guard the one thing about this package that is not ours to define: the shape
 * of a dsh client plugin bundle.
 *
 * `scripts/bundle.ts` reproduces that shape by hand, because upstream's own
 * preset is a monorepo-internal file wired into build faces Mio does not have.
 * The risk that buys is silent drift — a dsh release changing the loader
 * contract would leave a bundle that builds cleanly and then never materializes
 * in the browser. These assertions are the contract as
 * `@deepseek-ai/dsh-client-modules` documents it, so a break shows up here
 * rather than as a blank page.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const bundle = await readFile(path.join(ROOT, "lib", "client.js"), "utf8")

test("the browser half registers a lazy factory rather than executing", () => {
  // Executing a plugin bundle must only REGISTER its factory; every module body
  // side effect belongs in the closure, run later at materialization.
  assert.match(bundle, /^window\.__ModuleLoader__\.load\(\{/)
  assert.match(bundle, /\tid: "@mio\/client-ui",/)
  assert.match(bundle, /\tfactory: \(require\) => \{/)
  assert.match(bundle, /\t\treturn module\.exports;\n\t\}\n\}\);/)
})

test("the factory exports the cordis plugin surface", () => {
  // What the client Loader reads off the materialized exports.
  assert.match(bundle, /\bapply\b/)
  assert.match(bundle, /\binject\b/)
})

test("only specifiers the loader supplies survive as requires", () => {
  // `react/jsx-dev-runtime` is the trap: it builds fine and then fails at
  // materialization, because the shell seeds the production runtime only.
  const required = [...new Set([...bundle.matchAll(/\brequire\("([^"]+)"\)/g)].map((match) => match[1]!))]
  const supplied = /^(react|react-dom|react\/jsx-runtime|react-dom\/client|@deepseek-ai\/[\w-]+(\/client)?)$/
  const unsupplied = required.filter((specifier) => !supplied.test(specifier))
  assert.deepEqual(unsupplied, [], `the loader cannot supply: ${unsupplied.join(", ")}`)
  assert.ok(required.includes("react/jsx-runtime"), "expected the production JSX runtime to be required")
})

test("no shared runtime is inlined", () => {
  // These carry runtime identity — services, Symbols, singletons — and must be
  // the page's single copy. A second React or cordis is a broken page, not a
  // size regression.
  assert.doesNotMatch(bundle, /^\s*\/\/\s*node_modules\/@deepseek-ai\//m)
  assert.doesNotMatch(bundle, /^\s*\/\/\s*node_modules\/react\//m)
})
