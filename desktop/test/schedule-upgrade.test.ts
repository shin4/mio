import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

for (const mode of ["enabled", "disabled"]) void test(`Schedule ${mode} configuration survives upgrade and restart without fixture rewrites`, {
  timeout: 120_000,
  skip: !process.env.MIO_BASELINE_ROOT && "Set MIO_BASELINE_ROOT to the reviewed previous Desktop build",
}, async () => {
  const home = await mkdtemp(join(tmpdir(), "mio-schedule-upgrade-"))
  const source = fileURLToPath(new URL("../../.desktop-build/upstream", import.meta.url))
  const run = async (stage: string) => {
    await rm(join(home, "profiles/desktop/node_modules"), { recursive: true, force: true })
    const result = spawnSync(process.execPath, ["--expose-internals",
      fileURLToPath(new URL("./schedule-upgrade-probe.mjs", import.meta.url)),
      stage === "baseline" ? process.env.MIO_BASELINE_ROOT! : source, home, stage, mode,
    ], { encoding: "utf8", timeout: 35_000 })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, new RegExp(`schedule upgrade ${stage} verified`))
  }
  try {
    await run("baseline")
    const directory = join(home, "profiles/desktop")
    const config = await readFile(join(directory, "cordis.yml"))
    const patch = await readFile(join(directory, "cordis.patch.yml"))
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"))
    assert.ok(manifest.dsh.profile.bundles.includes("@deepseek-ai/dsh-experimental-schedule-bundle"))
    const expectedManifest = {
      ...manifest,
      dsh: { ...manifest.dsh, profile: { ...manifest.dsh.profile,
        bundles: manifest.dsh.profile.bundles.filter((name: string) => name !== "@deepseek-ai/dsh-experimental-schedule-bundle"),
      } },
    }
    const tasks = mode === "enabled" ? await readFile(join(home, "storages/schedule.json")) : undefined
    for (const stage of ["upgraded", "reopened"]) {
      await run(stage)
      // Read after shutdown as well: in-memory state alone cannot prove restart persistence.
      assert.deepEqual(await readFile(join(directory, "cordis.yml")), config, `${stage}: base config changed`)
      assert.deepEqual(await readFile(join(directory, "cordis.patch.yml")), patch, `${stage}: user overrides changed`)
      assert.deepEqual(JSON.parse(await readFile(join(directory, "package.json"), "utf8")), expectedManifest,
        `${stage}: only the retired bundle selection may change`)
      if (tasks) assert.deepEqual(await readFile(join(home, "storages/schedule.json")), tasks)
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
