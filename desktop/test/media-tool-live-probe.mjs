// Opt-in live probe: a real headless agent turn on the Mio composition calls `mimo_media_read` on
// its own and answers from MiMo's audio and video understanding.
// MIO_API_KEY (or MIMO_API_KEY); MIO_REGION (cn/sgp/ams) for a `tp-` key.
// Run from desktop/: node test/media-tool-live-probe.mjs <samples-dir>
// The samples directory is the one test/media-live-probe.mjs uses.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { root, upstream } from "../../script/desktop/prepare.mjs"

const key = process.env.MIO_API_KEY ?? process.env.MIMO_API_KEY
assert.ok(key, "Set MIO_API_KEY for this explicitly opt-in live probe")
const samples = process.argv[2]
assert.ok(samples, "Pass the samples directory")
const region = key.startsWith("tp-") ? (process.env.MIO_REGION ?? "cn") : undefined
const baseURL = region ? `https://token-plan-${region}.xiaomimimo.com/v1` : "https://api.xiaomimimo.com/v1"
const redact = (value) => value.replaceAll(key, "[REDACTED]")

const home = await mkdtemp(join(tmpdir(), "mio-media-tool-"))
const report = { date: new Date().toISOString(), billing: region ? `token-plan-${region}` : "pay-as-you-go", turns: [] }
try {
  for (const name of ["brand", "tts", "media"]) {
    await cp(join(upstream, "mio", name), join(home, "profiles/headless/node_modules/@mio", name), { recursive: true })
  }
  const patch = join(home, "mio.live.patch.yml")
  const original = await readFile(join(root, "desktop/bundle/mio.patch.yml"), "utf8")
  await writeFile(patch, `${original.replace(/baseURL: https:\/\/\S+/, `baseURL: ${baseURL}`)}\n- id: session-title-llm\n  disabled: true\n`)
  const work = join(home, "work")
  await mkdir(work)
  for (const file of ["speech.mp3", "video.mp4"]) await cp(join(samples, file), join(work, file))

  const turn = (prompt) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        ["--expose-internals", join(upstream, "apps/cli/lib/bin.js"), "--profile", "headless", "--patch", patch, prompt],
        { cwd: work, timeout: 300_000, env: { ...process.env, DSH_HOME: home, MIO_API_KEY: key } },
      )
      let out = ""
      child.stdout.on("data", (chunk) => (out += chunk))
      child.stderr.on("data", (chunk) => (out += chunk))
      child.on("close", (code) => resolve({ code, out: redact(out) }))
    })

  let seen = 0
  for (const [id, prompt, expect] of [
    ["audio", "What is the secret code spoken in speech.mp3? Reply with the code only.", /42|forty[- ]two/i],
    ["video", "video.mp4 shows two solid colors one after another. Which colors, in order? Reply as: first, second", /red[\s\S]*green/i],
  ]) {
    const { code, out } = await turn(prompt)
    // Evidence from the durable session log, not the printed reasoning: a settled tool call by name.
    const logs = (await readdir(home, { recursive: true })).filter((file) => /\.(jsonl|log|ndjson)$/.test(file) && file.includes("session"))
    const text = (await Promise.all(logs.map((file) => readFile(join(home, file), "utf8").catch(() => "")))).join("\n")
    const calls = (text.match(/"name":"mimo_media_read"/g) ?? []).length
    const called = calls > seen
    seen = calls
    const result = { id, code, called, correct: expect.test(out), tail: out.slice(-600) }
    report.turns.push(result)
    console.log("TOOL_TURN", JSON.stringify(result))
  }
  report.passed = report.turns.every((t) => t.code === 0 && t.called && t.correct)
  assert.ok(report.passed, "A live turn failed; see TOOL_TURN lines")
} finally {
  await writeFile(join(upstream, "../media-tool-live-validation.json"), redact(JSON.stringify(report, null, 2)))
  await rm(home, { recursive: true, force: true })
}
