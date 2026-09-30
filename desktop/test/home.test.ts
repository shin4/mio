import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { resolveMioHome } from "../bundle/home.js"

const product = JSON.parse(readFileSync(new URL("../product.json", import.meta.url), "utf8"))

void test("relative MIO_HOME resolves identically from different launch directories", () => {
  const script = `
    import { resolveMioHome } from ${JSON.stringify(new URL("../bundle/home.js", import.meta.url).href)}
    console.log(resolveMioHome(${JSON.stringify(product)}, { MIO_HOME: "./mio-data" }, process.argv[1]))
  `
  const gui = execFileSync(process.execPath, ["--input-type=module", "-e", script, join(homedir(), "Mio")],
    { cwd: homedir(), encoding: "utf8" }).trim()
  const cli = execFileSync(process.execPath, ["--input-type=module", "-e", script],
    { cwd: tmpdir(), encoding: "utf8" }).trim()
  assert.equal(gui, join(homedir(), "mio-data"))
  assert.equal(cli, gui)
})

void test("GUI and CLI use the existing product home, not the official CLI home", () => {
  const appData = process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support")
    : process.env.APPDATA
  if (!appData) return
  const userData = join(appData, "Mio")
  const environment: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: "/unrelated/dsh" }
  delete environment.MIO_HOME
  assert.equal(resolveMioHome(product, environment), join(userData, "dsh-desktop"))
  assert.equal(resolveMioHome(product, environment, userData), resolveMioHome(product, environment))
})

void test("an explicit Mio home has the same normalization and precedence in GUI and CLI", () => {
  for (const input of ["./workspace 中文", "~/mio-data", resolve("absolute home")]) {
    const environment = { MIO_HOME: input, DSH_HOME: "/unrelated/dsh" }
    const expected = resolve(homedir(), input.replace(/^~(?=$|[/\\])/, homedir()))
    assert.equal(resolveMioHome(product, environment), expected)
    assert.equal(resolveMioHome(product, environment, "/ignored/gui"), expected)
  }
  for (const input of ["", "  ", "\t"]) {
    assert.throws(() => resolveMioHome(product, { MIO_HOME: input }), /must not be empty/)
    assert.throws(() => resolveMioHome(product, { MIO_HOME: input }, "/gui"), /must not be empty/)
  }
})
