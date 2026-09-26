/** Exercise the actual Web composition and native welcome RPC boundary, without a model call. */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const variants = [
  { name: "UltraSpeed disabled", flags: [] },
  { name: "UltraSpeed enabled", flags: ["--ultraspeed"] },
  { name: "model list saved before image input", flags: ["--saved-before-image"] },
]
for (const { name, flags } of variants)
  test(`Desktop composition: ${name}`, { timeout: 120_000 }, () => {
    const result = spawnSync(
      process.execPath,
      ["--expose-internals", fileURLToPath(new URL("./web-probe.mjs", import.meta.url)), ...flags],
      {
        encoding: "utf8",
        timeout: 90_000,
      },
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /Mio web composition verified/)
  })
