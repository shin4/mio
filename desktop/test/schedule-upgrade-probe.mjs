/** Separate processes keep the old and new Cordis module identities isolated. */
import assert from "node:assert/strict"
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [source, home, stage] = process.argv.slice(2)
process.env.DSH_HOME = home
process.env.DSH_CLIENT_VERSION = stage === "baseline" ? "0.4.5" : "0.5.0-rc.1"
delete process.env.MIO_API_KEY
const directory = join(home, "profiles/desktop")
await mkdir(directory, { recursive: true })
const bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@mio/desktop"]
if (stage === "enabled") bundles.push("@deepseek-ai/dsh-experimental-schedule-bundle")
await writeFile(join(directory, "package.json"), JSON.stringify({ private: true, dsh: { profile: { bundles } } }))
await writeFile(join(directory, "cordis.yml"), "[]\n")
await writeFile(join(directory, "cordis.patch.yml"),
  "- id: schedule\n  disabled: false\n  config:\n    deliveryHistoryDays: 17\n- id: time-context\n  disabled: false\n- id: ui-schedule\n  disabled: false\n")
await mkdir(join(directory, "node_modules/@mio"), { recursive: true })
// A separate node_modules symlink is recreated by the parent at each version boundary.
await symlink(join(source, "mio/desktop"), join(directory, "node_modules/@mio/desktop"), "junction")
const require = createRequire(join(source, "apps/desktop-host/package.json"))
const { loadProfileDirectory, loadLayeredEnv } = await import(pathToFileURL(require.resolve("@deepseek-ai/dsh-app-boot")))
const { runProfile } = await import(pathToFileURL(require.resolve("@deepseek-ai/dsh/profile-boot")))
const anchor = join(source, "apps/cli/package.json")
const running = await runProfile({ environment: loadLayeredEnv("dsh"), profile: "desktop",
  resolvedProfile: { profile: loadProfileDirectory("dsh", directory, anchor), installAnchor: anchor },
  patchFiles: [], args: ["--no-open", "--port", "0"] })
try {
  if (stage === "disabled") {
    assert.equal(running.ctx.get("schedule"), undefined)
  } else {
    assert.ok(running.ctx.get("schedule"))
    if (stage === "baseline") {
      const { SessionId } = await import(pathToFileURL(join(source, "packages/core/session/lib/index.js")))
      const record = await running.ctx.schedule.create(SessionId("upgrade-schedule-owner"), {
        prompt: "Retain this synthetic task", title: "Upgrade fixture", after_seconds: 86400,
      })
      await writeFile(join(home, "expected-schedule.json"), JSON.stringify(record))
    }
    const expected = JSON.parse(await readFile(join(home, "expected-schedule.json"), "utf8"))
    assert.deepEqual(await running.ctx.schedule.list({ sessionId: "upgrade-schedule-owner" }), [expected])
    assert.equal((await running.ctx.schedule.history({ sessionId: "upgrade-schedule-owner", id: expected.id, limit: 10 })).retention.days, 17)
    assert.ok(running.ctx.clientModules.graph().entries.some(entry => entry.id === "@deepseek-ai/dsh-client-ui-schedule"))
  }
} finally {
  await running.shutdown.shutdown(0)
}
console.log(`schedule upgrade ${stage} verified`)
