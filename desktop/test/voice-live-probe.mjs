/** Opt-in live check of voice input and read-aloud against the real MiMo endpoint the welcome flow selects. */
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { root, upstream } from "../../script/desktop/prepare.mjs"
import { canonical, clips, recording } from "./recording.mjs"

const require = createRequire(join(upstream, "apps/desktop-host/package.json"))
const { loadProfileDirectory, loadLayeredEnv } = await import(
  pathToFileURL(require.resolve("@deepseek-ai/dsh-app-boot")).href
)
const { runProfile } = await import(pathToFileURL(require.resolve("@deepseek-ai/dsh/profile-boot")).href)
const { connectDesktopWelcome } = await import(
  pathToFileURL(join(upstream, "apps/desktop/lib/types/welcome-backend.js")).href
)
const key = process.env.MIO_API_KEY ?? process.env.MIMO_API_KEY
assert.ok(key, "Set MIO_API_KEY (or MIMO_API_KEY) for this explicitly opt-in live probe")
const region = process.env.MIO_REGION ?? "cn"
delete process.env.MIO_API_KEY
delete process.env.MIMO_API_KEY

const home = await mkdtemp(join(tmpdir(), "mio-asr-live-"))
process.env.DSH_HOME = home
const directory = join(home, "profiles/desktop")
await mkdir(join(directory, "node_modules/@mio"), { recursive: true })
await writeFile(
  join(directory, "package.json"),
  JSON.stringify({
    name: "mio-asr-live",
    private: true,
    dsh: {
      profile: {
        bundles: [
          "@deepseek-ai/dsh-base",
          "@deepseek-ai/dsh-web-app",
          "@deepseek-ai/dsh-experimental-voice-input-bundle",
          "@mio/desktop",
        ],
      },
    },
  }),
)
await writeFile(join(directory, "cordis.yml"), "[]\n")
for (const name of ["desktop", "brand"]) {
  await symlink(
    join(upstream, "mio", name),
    join(directory, "node_modules/@mio", name),
    process.platform === "win32" ? "junction" : "dir",
  )
}
const installAnchor = join(upstream, "apps/cli/package.json")
const running = await runProfile({
  environment: loadLayeredEnv("dsh"),
  profile: "desktop",
  resolvedProfile: { profile: loadProfileDirectory("dsh", directory, installAnchor), installAnchor },
  patchFiles: [],
  args: ["--no-open", "--port", "0"],
})
const report = { date: new Date().toISOString(), keyKind: key.startsWith("tp-") ? `token-plan-${region}` : "payg" }
try {
  let cookie = ""
  const send = async (input, init = {}) => {
    const response = await fetch(input, {
      ...init,
      redirect: "manual",
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    })
    const stored = response.headers.getSetCookie()
    if (stored.length) cookie = stored.map((value) => value.split(";")[0]).join("; ")
    const location = response.headers.get("location")
    if (location && response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      return send(new URL(location, input).href)
    }
    return response
  }
  const backend = await connectDesktopWelcome(
    running.ctx.connection.authenticatedUrl(`http://127.0.0.1:${running.ctx.webServer.port}`),
    send,
  )
  // The real welcome path: live key verification, then the route's baseURL and credential.
  assert.deepEqual(await backend.save(key, region), { ok: true }, "welcome rejected the key")
  const entry = running.ctx.settings.describe().find((descriptor) => descriptor.ns === "llm-pi-ai")
  report.endpoint = entry.value.providers.mimo.baseURL
  report.results = []
  for (const [clip, expected] of Object.entries(clips)) {
    const audio = await recording(clip)
    const language = clip === "zh" ? "zh" : "auto"
    const result = await running.ctx.speechController.transcribe(
      { audioBase64: audio.toString("base64"), language },
      new AbortController().signal,
    )
    report.results.push({ clip, language, expected, ...result })
    assert.ok(result.text.length > 0, `${clip}: MiMo ASR returned no transcript`)
  }
  // Read aloud through the authenticated route, then hear it back through voice input.
  const spoken = "把这个函数改成异步的，并且等待网络请求返回。"
  const origin = `http://127.0.0.1:${running.ctx.webServer.port}`
  const response = await send(`${origin}/api/mio/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `**${spoken}**\n\n\`\`\`js\nawait fetch(url)\n\`\`\`` }),
  })
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal(response.headers.get("content-type"), "audio/wav")
  const speech = Buffer.from(await response.arrayBuffer())
  await writeFile(join(root, ".desktop-build/tts-live.wav"), speech)
  const heard = await running.ctx.speechController.transcribe(
    { audioBase64: canonical(speech).toString("base64"), language: "zh" },
    new AbortController().signal,
  )
  report.tts = {
    spoken,
    bytes: speech.length,
    sampleRate: speech.readUInt32LE(24),
    heardBack: heard.text,
    seconds: heard.audioSeconds,
  }
  assert.ok(heard.text.length > 0, "MiMo ASR heard nothing in the MiMo TTS output")
  console.log(JSON.stringify(report, undefined, 2))
  await writeFile(join(root, ".desktop-build/voice-live-validation.json"), `${JSON.stringify(report, undefined, 2)}\n`)
  console.log("Mio live voice verified")
} finally {
  await running.shutdown.shutdown(0)
  await rm(home, { recursive: true, force: true })
}
