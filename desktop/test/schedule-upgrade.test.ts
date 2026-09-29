import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

void test("old Schedule tasks survive removal and return after enabling the official bundle", {
  timeout: 120_000,
  skip: !process.env.MIO_BASELINE_ROOT && "Set MIO_BASELINE_ROOT to the reviewed 0.4.5 build",
}, async () => {
  const home = await mkdtemp(join(tmpdir(), "mio-schedule-upgrade-"))
  const source = fileURLToPath(new URL("../../.desktop-build/upstream", import.meta.url))
  const run = async (stage: string) => {
    await rm(join(home, "profiles/desktop/node_modules"), { recursive: true, force: true })
    const result = spawnSync(process.execPath, ["--expose-internals",
      fileURLToPath(new URL("./schedule-upgrade-probe.mjs", import.meta.url)),
      stage === "baseline" ? process.env.MIO_BASELINE_ROOT! : source, home, stage,
    ], { encoding: "utf8", timeout: 35_000 })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, new RegExp(`schedule upgrade ${stage} verified`))
  }
  try {
    await run("baseline")
    const tasks = await readFile(join(home, "storages/schedule.json"))
    await run("disabled")
    assert.deepEqual(await readFile(join(home, "storages/schedule.json")), tasks)
    await run("enabled")
    assert.deepEqual(await readFile(join(home, "storages/schedule.json")), tasks)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
