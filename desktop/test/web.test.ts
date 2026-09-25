/** Exercise the actual Web composition and native welcome RPC boundary, without a model call. */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

for (const enabled of [false, true])
  test(`Desktop composition: UltraSpeed ${enabled ? "enabled" : "disabled"}`, { timeout: 120_000 }, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--expose-internals",
        fileURLToPath(new URL("./web-probe.mjs", import.meta.url)),
        ...(enabled ? ["--ultraspeed"] : []),
      ],
      {
        encoding: "utf8",
        timeout: 90_000,
      },
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /Mio web composition verified/)
  })
