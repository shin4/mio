// Opt-in live probe: MiMo V2.6 image input through the official dsh attachment and pi-ai adapter path.
// MIO_API_KEY (or MIMO_API_KEY) from the environment; MIO_REGION (cn/sgp/ams) for a `tp-` key.
// Run from desktop/: node --expose-internals test/image-live-probe.mjs
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { deflateSync } from "node:zlib"
import { upstream } from "../../script/desktop/prepare.mjs"

const require = createRequire(join(upstream, "apps/desktop-host/package.json"))
const { loadProfileDirectory, loadLayeredEnv } = await import(
  pathToFileURL(require.resolve("@deepseek-ai/dsh-app-boot")).href
)
const { runProfile } = await import(pathToFileURL(require.resolve("@deepseek-ai/dsh/profile-boot")).href)
const { connectDesktopWelcome } = await import(
  pathToFileURL(join(upstream, "apps/desktop/lib/types/welcome-backend.js")).href
)
const { BlockAssembler } = await import(pathToFileURL(join(upstream, "packages/llm/llm/lib/index.js")).href)

const key = process.env.MIO_API_KEY ?? process.env.MIMO_API_KEY
assert.ok(key, "Set MIO_API_KEY for this explicitly opt-in live probe")
const region = key.startsWith("tp-") ? (process.env.MIO_REGION ?? "cn") : undefined
const MODELS = ["mimo-v2.6-flash", "mimo-v2.6-pro"]
const redact = (value) => value.replaceAll(key, "[REDACTED]")

/** A 64×64 RGB PNG: left half red, right half blue. */
function splitPng() {
  const size = 64
  const crc = (bytes) => {
    let c = ~0
    for (const byte of bytes) {
      c ^= byte
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const rows = Array.from({ length: size }, () =>
    Buffer.concat([
      Buffer.from([0]),
      ...Array.from({ length: size }, (_, x) => Buffer.from(x < size / 2 ? [230, 20, 20] : [20, 40, 230])),
    ]),
  )
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(Buffer.concat(rows))),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  )
}

const report = { date: new Date().toISOString(), billing: region ? `token-plan-${region}` : "pay-as-you-go", results: [], requests: [] }
const nativeFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (url.hostname.endsWith("xiaomimimo.com") && url.pathname.endsWith("/chat/completions")) {
    const body = JSON.parse(init.body)
    const parts = body.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    report.requests.push({
      host: url.hostname,
      model: body.model,
      partTypes: parts.map((p) => p.type),
      imageDataUrl: parts.some((p) => p.type === "image_url" && (p.image_url?.url ?? "").startsWith("data:image/png;base64,")),
    })
  }
  return nativeFetch(input, init)
}

const home = await mkdtemp(join(tmpdir(), "mio-image-probe-"))
process.env.DSH_HOME = home
delete process.env.MIO_API_KEY
delete process.env.MIMO_API_KEY
const directory = join(home, "profiles/desktop")
await mkdir(join(directory, "node_modules/@mio"), { recursive: true })
await writeFile(
  join(directory, "package.json"),
  JSON.stringify({
    name: "mio-image-probe",
    private: true,
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@mio/desktop"] } },
  }),
)
await writeFile(join(directory, "cordis.yml"), "[]\n")
await symlink(
  join(upstream, "mio/desktop"),
  join(directory, "node_modules/@mio/desktop"),
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
  // The session controller refuses an image prompt unless the model declares `image`.
  for (const model of MODELS) {
    const info = await running.ctx.llm.resolveModelInfo("mimo", model)
    report[`${model}.inputModalities`] = info.inputModalities
    assert.ok(info.inputModalities?.includes("image"), `${model} must declare image input`)
  }

  let cookie = ""
  const send = async (input, init = {}) => {
    const response = await fetch(input, { ...init, redirect: "manual", headers: { ...init.headers, ...(cookie ? { cookie } : {}) } })
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
  const saved = await backend.save(key, region)
  report.welcomeSave = saved.ok
  assert.equal(saved.ok, true, "Native welcome save failed")

  const [image] = await running.ctx.attachments.saveImages([{ data: splitPng(), mediaType: "image/png", name: "split.png" }])
  const question =
    "The attached image has two halves. Name the color of the left half and the right half. " +
    "Answer exactly in the form: left=<color>, right=<color>"

  for (const model of MODELS) {
    const assembler = new BlockAssembler()
    const start = Date.now()
    for await (const chunk of running.ctx.llm.stream({
      provider: "mimo",
      model,
      reasoningEffort: "off",
      messages: [{ role: "user", content: [{ type: "image", attachment: image }, { type: "text", text: question }] }],
      maxTokens: 512,
      signal: AbortSignal.timeout(90000),
    }))
      assembler.push(chunk)
    const message = assembler.message({ provider: "mimo", model })
    const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("")
    const result = {
      model,
      finish: assembler.finish.kind,
      error: assembler.finish.failure ? redact(`${assembler.finish.failure.code}: ${assembler.finish.failure.message}`) : undefined,
      milliseconds: Date.now() - start,
      text,
      correct: /left\s*=\s*red/i.test(text) && /right\s*=\s*blue/i.test(text),
      usage: assembler.usage,
    }
    report.results.push(result)
    console.log("IMAGE_RESULT", redact(JSON.stringify(result)))
  }

  assert.equal(report.requests.length, MODELS.length)
  assert.ok(report.requests.every((r) => r.imageDataUrl), "Every request must carry an inline PNG image_url part")
  report.passed = report.results.every((r) => r.finish === "stop" && r.correct)
  assert.ok(report.passed, "At least one model failed the image round-trip; see IMAGE_RESULT lines")
} finally {
  await writeFile(join(upstream, "../image-live-validation.json"), redact(JSON.stringify(report, null, 2)))
  await running.shutdown.shutdown(0)
  await rm(home, { recursive: true, force: true })
}
