import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join, relative } from "node:path"
import { test } from "node:test"
import { resolveMioHome } from "../bundle/home.js"
import { developmentEnvironment } from "../../script/desktop/development-environment.mjs"
import { root, upstream } from "../../script/desktop/prepare.mjs"

const product = JSON.parse(readFileSync(new URL("../product.json", import.meta.url), "utf8"))

void test("explicit MIO_HOME is shared by GUI, CLI and development from different launch directories", () => {
  const script = `
    import { resolveMioHome } from ${JSON.stringify(new URL("../bundle/home.js", import.meta.url).href)}
    import { developmentEnvironment } from ${JSON.stringify(new URL("../../script/desktop/development-environment.mjs", import.meta.url).href)}
    const product = ${JSON.stringify(product)}
    const env = { MIO_HOME: process.argv[1], DSH_HOME: "/unrelated/dsh" }
    console.log(JSON.stringify([
      resolveMioHome(product, env, "/ignored/gui"),
      resolveMioHome(product, env),
      developmentEnvironment(product, env).DSH_HOME,
    ]))
  `
  for (const [input, expected] of [
    ["./mio-data", join(homedir(), "mio-data")],
    ["workspace 中文/../mio data", join(homedir(), "mio data")],
    ["~/mio-data", join(homedir(), "mio-data")],
    ["~", homedir()],
    [join(tmpdir(), "absolute home 中文"), join(tmpdir(), "absolute home 中文")],
  ]) {
    for (const cwd of [homedir(), upstream, tmpdir()]) {
      const homes = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script, input],
        { cwd, encoding: "utf8" }))
      assert.deepEqual(homes, [expected, expected, expected], `${input} launched from ${cwd}`)
    }
  }
})

void test("the real Desktop CLI resolves a relative home before checking the profile and preserves cwd", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "mio-cli-home-")))
  const home = join(directory, "profile 中文")
  const script = `
    import { runDesktopCli } from ${JSON.stringify(new URL("../../.desktop-build/upstream/apps/desktop-host/lib/cli.js", import.meta.url).href)}
    process.on("exit", () => console.log(JSON.stringify({ home: process.env.DSH_HOME, cwd: process.cwd() })))
    process.argv = [process.execPath, "mio", "plugin", "--profile", "desktop", "list"]
    await runDesktopCli(${JSON.stringify(upstream)}, ${JSON.stringify(join(directory, "runtime"))})
  `
  try {
    for (const name of ["gui launch", "terminal 中文"]) {
      const cwd = join(directory, name)
      mkdirSync(cwd)
      const cli = spawnSync(process.execPath, ["--expose-internals", "--input-type=module", "-e", script], {
        cwd, encoding: "utf8", timeout: 30_000,
        env: { ...process.env, MIO_HOME: relative(homedir(), home), DSH_HOME: join(directory, "ignored") },
      })
      assert.ifError(cli.error)
      // An empty home must retain upstream's refusal without creating a desktop profile.
      assert.equal(cli.status, 1, cli.stderr)
      assert.match(cli.stderr, /initialize its profile/)
      assert.deepEqual(JSON.parse(cli.stdout), { home, cwd })
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

void test("development without MIO_HOME retains its isolated directories and launch settings", () => {
  const env = { DSH_HOME: "/ignored/dsh", DSH_DESKTOP_OPEN_DEVTOOLS: "1", MIO_API_KEY: "test-only" }
  const environment = developmentEnvironment(product, env)
  assert.equal(environment.DSH_HOME, join(root, ".desktop-build", "home"))
  assert.equal(environment.DSH_DESKTOP_USER_DATA_DIR, join(root, ".desktop-build", "electron-user-data"))
  assert.equal(environment.DSH_CLIENT_TITLE, product.name)
  assert.equal(environment.DSH_DESKTOP_OPEN_DEVTOOLS, "1")
  assert.equal(environment.MIO_API_KEY, "test-only")
  assert.equal(developmentEnvironment(product, {}).DSH_DESKTOP_OPEN_DEVTOOLS, "0")
  assert.equal(env.DSH_HOME, "/ignored/dsh")
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

void test("empty MIO_HOME is rejected by GUI, CLI and development", () => {
  for (const input of ["", "  ", "\t"]) {
    assert.throws(() => resolveMioHome(product, { MIO_HOME: input }), /must not be empty/)
    assert.throws(() => resolveMioHome(product, { MIO_HOME: input }, "/gui"), /must not be empty/)
    assert.throws(() => developmentEnvironment(product, { MIO_HOME: input }), /must not be empty/)
  }
})

void test("the development entry rejects empty MIO_HOME before preparing or launching upstream", () => {
  for (const input of ["", "  ", "\t"]) {
    const launch = spawnSync(process.execPath, [join(root, "script/desktop/run.mjs"), "start"], {
      cwd: tmpdir(), encoding: "utf8", timeout: 30_000, env: { ...process.env, MIO_HOME: input },
    })
    assert.ifError(launch.error)
    assert.equal(launch.status, 1, launch.stderr)
    assert.match(launch.stderr, /MIO_HOME must not be empty/)
    assert.equal(launch.stdout, "")
  }
})
