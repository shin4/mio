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
/**
 * Answer MiMo completions with one fixed body, pointing the MiMo route at it through the same two
 * writes the native welcome performs for a Token Plan key.
 */
async function connectReplay(ctx, answer) {
  const requests = []
  const server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => (body += chunk))
    request.on("end", () => {
      requests.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(body) })
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(answer))
    })
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  await ctx.settings.mutate("llm-pi-ai", [
    { op: "set", path: ["providers", "mimo", "baseURL"], value: `http://127.0.0.1:${server.address().port}/v1/` },
  ])
  await ctx.credentials.set("MIO_API_KEY", "tp-replay")
  return { server, requests }
}

/** Read aloud goes through the authenticated Host route to MiMo TTS and plays back its WAV bytes. */
async function verifyTts(ctx, send, origin) {
  assert.ok(
    ctx.clientModules.graph().entries.some((entry) => entry.id === "@mio/tts"),
    "The product bundle must mount the read-aloud browser action",
  )
  const wave = await recording("en")
  const { server, requests } = await connectReplay(ctx, {
    object: "chat.completion",
    model: "mimo-v2.5-tts",
    choices: [{ index: 0, message: { role: "assistant", content: "", audio: { data: wave.toString("base64") } } }],
  })
  const speak = (text) =>
    send(`${origin}/api/mio/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    })
  try {
    const reply = "## Done\n\nI made **fetchUser** async:\n\n```ts\nawait fetch(url)\n```\n\nSee [the docs](https://x.invalid)."
    const response = await speak(reply)
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal(response.headers.get("content-type"), "audio/wav")
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), wave)
    assert.equal(requests.length, 1)
    const [sent] = requests
    assert.equal(sent.url, "/v1/chat/completions")
    assert.equal(sent.authorization, "Bearer tp-replay")
    assert.deepEqual(sent.body, {
      model: "mimo-v2.5-tts",
      messages: [{ role: "assistant", content: "Done\nI made fetchUser async:\nSee the docs." }],
      audio: { format: "wav", voice: "mimo_default" },
      stream: false,
    })
    // A long answer is read from its start in parts: a short first one so playback starts
    // quickly, then whole sentences up to the overall limit, fetched one part at a time.
    const long = Array.from({ length: 200 }, (_, index) => `Sentence number ${index} of a long answer.`).join(" ")
    const part = (index) =>
      send(`${origin}/api/mio/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: long, part: index }),
      })
    const first = await part(0)
    assert.equal(first.status, 200)
    const count = Number(first.headers.get("x-mio-tts-parts"))
    assert.ok(count > 2, `expected several parts, got ${count}`)
    assert.ok(requests.at(-1).body.messages[0].content.length <= 120, "The first part must be short")
    const read = [requests.at(-1).body.messages[0].content]
    for (const index of Array.from({ length: count - 1 }, (_, offset) => offset + 1)) {
      assert.equal((await part(index)).status, 200)
      read.push(requests.at(-1).body.messages[0].content)
    }
    const joined = read.join(" ")
    assert.ok(long.startsWith(joined) && joined.endsWith("."), "Parts must be whole sentences in reading order")
    assert.ok(joined.length > 3500 && joined.length <= 4000, `read ${joined.length} characters`)
    assert.equal((await part(count)).status, 400)
    const spoken = requests.length
    assert.equal((await speak("```\nonly code\n```")).status, 422)
    assert.equal(requests.length, spoken, "A reply with nothing speakable must not reach MiMo")
    // The General settings row: read the choices, reject an unknown voice, save one that sticks.
    const voiceRoute = `${origin}/api/mio/tts/voice`
    const put = (voice) =>
      send(voiceRoute, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice }) })
    const initial = await (await send(voiceRoute)).json()
    assert.equal(initial.voice, "mimo_default")
    assert.equal(initial.voices.length, 9)
    assert.equal((await put("not-a-voice")).status, 400)
    assert.deepEqual((await (await put("冰糖")).json()).voice, "冰糖")
    assert.equal((await (await send(voiceRoute)).json()).voice, "冰糖")
    assert.equal((await speak("Saved voice.")).status, 200)
    assert.equal(requests.at(-1).body.audio.voice, "冰糖", "Replies must be read in the saved voice")
    const preview = await send(`${origin}/api/mio/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Preview.", voice: "Mia" }),
    })
    assert.equal(preview.status, 200)
    assert.equal(requests.at(-1).body.audio.voice, "Mia", "A preview names its own voice")
    assert.equal((await (await send(voiceRoute)).json()).voice, "冰糖", "A preview must not change the saved voice")
    const anonymous = await fetch(`${origin}/api/mio/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    })
    assert.equal(anonymous.status, 401, "The route must sit behind browser authentication")
  } finally {
    server.close()
  }
}

/** `mimo_media_read` reads media through the fs backend and asks MiMo on the route's endpoint and key. */
async function verifyMedia(ctx, home) {
  const { server, requests } = await connectReplay(ctx, {
    object: "chat.completion",
    model: "mimo-v2.6-flash",
    choices: [{ index: 0, message: { role: "assistant", content: "  The speaker says hello.  " } }],
  })
  const read = (args) =>
    ctx.tools.execute({ callId: `media-${requests.length}-${Math.random()}`, name: "mimo_media_read", arguments: args, signal: AbortSignal.timeout(30000) })
  try {
    const wav = join(home, "clip.WAV")
    await writeFile(wav, await recording("en"))
    const heard = await read({ file_path: wav, question: "Transcribe it." })
    assert.equal(heard.isError, false, JSON.stringify(heard.error))
    assert.deepEqual(heard.value, { path: wav, kind: "audio", model: "mimo-v2.6-flash", answer: "The speaker says hello." })
    assert.match(heard.content[0].text, /<type>audio<\/type>[\s\S]*The speaker says hello\./)
    const audio = requests.at(-1)
    assert.equal(audio.url, "/v1/chat/completions")
    assert.equal(audio.authorization, "Bearer tp-replay")
    assert.deepEqual(audio.body.thinking, { type: "disabled" })
    const [part, question] = audio.body.messages[0].content
    assert.equal(part.type, "input_audio")
    assert.ok(part.input_audio.data.startsWith("data:audio/wav;base64,UklGR"), "WAV bytes travel as a data URL")
    assert.deepEqual(question, { type: "text", text: "Transcribe it." })

    const mp4 = join(home, "clip.mp4")
    await writeFile(mp4, Buffer.from("not really a video"))
    const seen = await read({ file_path: mp4, question: "Describe it.", fps: 0.5, media_resolution: "max" })
    assert.equal(seen.isError, false, JSON.stringify(seen.error))
    assert.equal(seen.value.kind, "video")
    const video = requests.at(-1).body.messages[0].content[0]
    assert.deepEqual(
      { ...video, video_url: { url: video.video_url.url.slice(0, 22) } },
      { type: "video_url", video_url: { url: "data:video/mp4;base64," }, fps: 0.5, media_resolution: "max" },
    )

    const before = requests.length
    const pdf = join(home, "doc.pdf")
    await writeFile(pdf, "%PDF-1.4")
    for (const [args, message] of [
      [{ file_path: pdf, question: "Read it." }, /MP3\/WAV\/FLAC\/M4A\/OGG\/MP4\/MOV\/AVI\/WMV files only/],
      [{ file_path: wav, question: "Read it.", fps: 2 }, /video only/],
      [{ file_path: mp4, question: "Read it.", fps: 30 }, /between 0\.1 and 10/],
      [{ file_path: join(home, "missing.mp3"), question: "Read it." }, /not found/],
      [{ file_path: wav, question: "  " }, /non-empty/],
    ]) {
      const refused = await read(args)
      assert.equal(refused.isError, true, `${JSON.stringify(args)} must be refused`)
      assert.match(refused.error.message, message)
    }
    assert.equal(requests.length, before, "A refused call must not reach MiMo")
  } finally {
    server.close()
  }
}

/** Voice input resolves to MiMo ASR on the endpoint and key welcome stores for the MiMo route. */
async function verifyAsr(ctx, send, origin) {
  assert.ok(
    ctx.clientModules.graph().entries.some((entry) => entry.id === "@mio/asr"),
    "Voice input must mount its Settings → General rows",
  )
  const snapshot = ctx.speechToText.snapshot()
  assert.deepEqual(
    snapshot.providers.map((provider) => [provider.id, provider.name, provider.location, provider.languages]),
    [["mio-asr", "MiMo ASR", "cloud", ["auto", "zh"]]],
  )
  assert.equal(snapshot.selection.providerId, "mio-asr")
  assert.equal(ctx.speechController.catalog().maxDurationSeconds, 60)
  const transcript = clips.zh
  const { server, requests } = await connectReplay(ctx, {
    object: "chat.completion",
    model: "mimo-v2.5-asr",
    choices: [{ index: 0, message: { role: "assistant", content: ` ${transcript} ` }, finish_reason: "stop" }],
  })
  try {
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
  // The General settings row: MiMo ASR's languages, validated, persisted by the official speech service.
  const route = `${origin}/api/mio/asr`
  const put = (language) =>
    send(route, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ language }) })
  assert.deepEqual(await (await send(route)).json(), { active: true, language: "auto", languages: ["auto", "zh"] })
  assert.equal((await put("en")).status, 400)
  assert.equal((await (await put("zh")).json()).language, "zh")
  assert.equal(ctx.speechToText.snapshot().selection.language, "zh", "The speech service owns the saved language")
  assert.equal((await (await send(route)).json()).language, "zh")
  assert.equal((await fetch(route)).status, 401, "The route must sit behind browser authentication")
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
for (const name of ["brand", "tts", "media"]) {
  await symlink(
    join(upstream, "mio", name),
    join(directory, "node_modules/@mio", name),
    process.platform === "win32" ? "junction" : "dir",
  )
}
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
  // The session controller admits an image prompt only for a model declaring `image`.
  for (const id of ["mimo-v2.6-flash", "mimo-v2.6-pro"]) {
    const info = await running.ctx.llm.resolveModelInfo("mimo", id)
    assert.deepEqual([...info.inputModalities].sort((a, b) => a.localeCompare(b)), ["image", "text"], `${id} input modalities`)
  }
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
  await verifyAsr(running.ctx, send, `http://127.0.0.1:${running.ctx.webServer.port}`)
  await verifyTts(running.ctx, send, `http://127.0.0.1:${running.ctx.webServer.port}`)
  await verifyMedia(running.ctx, home)
  console.log("Mio web composition verified")
} finally {
  await running.shutdown.shutdown(0)
  await rm(home, { recursive: true, force: true })
}
