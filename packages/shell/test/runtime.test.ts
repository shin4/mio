import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { installBundledPlugins } from "../src/profile.ts"
import { redactLaunchTokens, startRuntime } from "../src/runtime.ts"

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

void test("launch tokens are removed from Electron navigation errors and LAN hints", () => {
  assert.equal(
    redactLaunchTokens(
      "ERR_FAILED loading 'http://127.0.0.1:1234/?token=secret&view=chat' (LAN: http://host/?token=other)",
    ),
    "ERR_FAILED loading 'http://127.0.0.1:1234/?token=[redacted]&view=chat' (LAN: http://host/?token=[redacted])",
  )
})

void test(
  "the shell exchanges launch tokens, reloads with a cookie, and stops its runtime",
  { timeout: 90_000 },
  async (t) => {
    const home = await mkdtemp(path.join(tmpdir(), "mio-shell-auth-"))
    t.after(() => rm(home, { recursive: true, force: true }))
    await installBundledPlugins(home, "web", [{ name: "@mio/client-ui", source: path.join(PACKAGES, "client-ui") }])
    const logs: string[] = []
    const runtime = await startRuntime({
      dshHome: home,
      cwd: home,
      patch: path.join(PACKAGES, "runtime/mio.patch.yml"),
      onLog: (line) => logs.push(line),
    })
    t.after(() => runtime.stop())
    const token = new URL(runtime.url).searchParams.get("token")
    assert.ok(token)
    assert.ok(logs.some((line) => line.includes("token=[redacted]")))
    assert.ok(logs.every((line) => !line.includes(token)))
    const origin = new URL(runtime.url).origin
    assert.equal((await fetch(origin)).status, 401)
    const exchange = await fetch(runtime.url, { redirect: "manual" })
    assert.equal(exchange.status, 303)
    const cookie = exchange.headers.get("set-cookie")
    assert.ok(cookie)
    assert.match(cookie, /HttpOnly/i)
    assert.match(cookie, /SameSite=Strict/i)
    const headers = { cookie: cookie.split(";")[0] }
    for (const route of ["/", "/favicon.svg", "/manifest.webmanifest"]) {
      const response = await fetch(`${origin}${route}`, { headers })
      assert.equal(response.status, 200, route)
      assert.match(await response.text(), route === "/favicon.svg" ? /<svg/ : /Mio/)
    }
    assert.equal((await fetch(origin, { headers })).status, 200, "a reload keeps the authenticated browser session")
    await runtime.stop()
    await assert.rejects(fetch(origin), "the runtime listener must be gone after stop")
  },
)
