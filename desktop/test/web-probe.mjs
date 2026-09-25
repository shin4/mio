import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile, symlink, readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { composeModels } from "../../script/desktop/models.mjs"
import { root, upstream } from "../../script/desktop/prepare.mjs"
import { clips, recording } from "./recording.mjs"

const require = createRequire(join(upstream, "apps/desktop-host/package.json"))
const { loadProfileDirectory, loadLayeredEnv } = await import(
  pathToFileURL(require.resolve("@deepseek-ai/dsh-app-boot")).href
)
const { runProfile } = await import(pathToFileURL(require.resolve("@deepseek-ai/dsh/profile-boot")).href)
const { connectDesktopWelcome } = await import(
  pathToFileURL(join(upstream, "apps/desktop/lib/types/welcome-backend.js")).href
)
/** Voice input resolves to MiMo ASR on the endpoint and key welcome stores for the MiMo route. */
async function verifyAsr(ctx) {
  const snapshot = ctx.speechToText.snapshot()
  assert.deepEqual(
    snapshot.providers.map((provider) => [provider.id, provider.name, provider.location, provider.languages]),
    [["mio-asr", "MiMo ASR", "cloud", ["auto", "zh", "en"]]],
  )
  assert.equal(snapshot.selection.providerId, "mio-asr")
  assert.equal(ctx.speechController.catalog().maxDurationSeconds, 60)
  const transcript = clips.zh
  const requests = []
  const server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => (body += chunk))
    request.on("end", () => {
      requests.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(body) })
      response.writeHead(200, { "content-type": "application/json" })
      response.end(
        JSON.stringify({
          object: "chat.completion",
          model: "mimo-v2.5-asr",
          choices: [{ index: 0, message: { role: "assistant", content: ` ${transcript} ` }, finish_reason: "stop" }],
        }),
      )
    })
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    // The same two writes the native welcome performs for a Token Plan key.
    await ctx.settings.mutate("llm-pi-ai", [
      { op: "set", path: ["providers", "mimo", "baseURL"], value: `http://127.0.0.1:${server.address().port}/v1/` },
    ])
    await ctx.credentials.set("MIO_API_KEY", "tp-replay")
    const audio = await recording("zh")
    const result = await ctx.speechController.transcribe(
      { audioBase64: audio.toString("base64"), language: "zh" },
      new AbortController().signal,
    )
    assert.equal(result.text, transcript)
    assert.equal(result.audioSeconds, (audio.length - 44) / 32000)
    assert.equal(requests.length, 1)
    const [sent] = requests
    assert.equal(sent.url, "/v1/chat/completions")
    assert.equal(sent.authorization, "Bearer tp-replay")
    assert.deepEqual(sent.body, {
      model: "mimo-v2.5-asr",
      messages: [
        {
          role: "user",
          content: [{ type: "input_audio", input_audio: { data: `data:audio/wav;base64,${audio.toString("base64")}` } }],
        },
      ],
      asr_options: { language: "zh" },
      stream: false,
    })
  } finally {
    server.close()
  }
}

const home = await mkdtemp(join(tmpdir(), "mio-desktop-web-"))
process.env.DSH_HOME = home
delete process.env.MIO_API_KEY
const directory = join(home, "profiles/desktop")
await mkdir(directory, { recursive: true })
await writeFile(
  join(directory, "package.json"),
  JSON.stringify({
    name: "mio-web-test",
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
// Isolate both product variants without mutating the prepared checkout.
const enableUltraSpeed = process.argv.includes("--ultraspeed")
const bundle = join(directory, "node_modules/@mio/desktop")
await mkdir(bundle, { recursive: true })
await writeFile(join(bundle, "package.json"), await readFile(join(root, "desktop/bundle/package.json")))
await writeFile(
  join(bundle, "mio.patch.yml"),
  composeModels(await readFile(join(root, "desktop/bundle/mio.patch.yml"), "utf8"), { enableUltraSpeed }),
)
await symlink(
  join(upstream, "mio/brand"),
  join(directory, "node_modules/@mio/brand"),
  process.platform === "win32" ? "junction" : "dir",
)
const installAnchor = join(upstream, "apps/cli/package.json")
const profile = loadProfileDirectory("dsh", directory, installAnchor)
assert.deepEqual(profile.skippedBundles, [])
const running = await runProfile({
  environment: loadLayeredEnv("dsh"),
  profile: "desktop",
  resolvedProfile: { profile, installAnchor },
  patchFiles: [],
  args: ["--no-open", "--port", "0"],
})
try {
  const brand = running.ctx.clientModules.graph().entries.find((entry) => entry.id === "@mio/brand")
  assert.ok(brand, "The product bundle must actually mount its browser brand plugin")
  assert.equal(running.ctx.agentDefaultModel.currentSelection().model, "mimo-v2.6-flash")
  const model = await running.ctx.llm.resolveModelInfo("mimo", "mimo-v2.6-flash")
  assert.deepEqual(
    model.reasoning.efforts.map((effort) => effort.id),
    ["off", "high"],
  )
  const models = await running.ctx.llm.listModels("mimo")
  assert.equal(
    models.some((model) => model.id === "mimo-v2.6-pro-ultraspeed"),
    enableUltraSpeed,
  )
  if (enableUltraSpeed) {
    const optional = await running.ctx.llm.resolveModelInfo("mimo", "mimo-v2.6-pro-ultraspeed")
    assert.deepEqual(
      optional.reasoning.efforts.map((effort) => effort.id),
      ["off", "high"],
    )
  }
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
  const state = await backend.read()
  assert.equal(state.writable, true)
  assert.equal(state.hasApiKey, false)
  assert.deepEqual(await backend.save("not-a-key", "invalid-region"), { ok: false })
  assert.deepEqual(await backend.save("contains whitespace"), { ok: false })
  await verifyAsr(running.ctx)
  console.log("Mio web composition verified")
} finally {
  await running.shutdown.shutdown(0)
  await rm(home, { recursive: true, force: true })
}
