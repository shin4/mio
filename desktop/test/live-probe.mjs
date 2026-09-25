import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile, symlink } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { upstream } from "../../script/desktop/prepare.mjs"

const require = createRequire(join(upstream, "apps/desktop-host/package.json"))
const { loadProfileDirectory, loadLayeredEnv } = await import(
  pathToFileURL(require.resolve("@deepseek-ai/dsh-app-boot")).href
)
const { runProfile } = await import(pathToFileURL(require.resolve("@deepseek-ai/dsh/profile-boot")).href)
const { connectDesktopWelcome } = await import(
  pathToFileURL(join(upstream, "apps/desktop/lib/types/welcome-backend.js")).href
)
const { readFile } = await import("node:fs/promises")
const key = process.env.MIO_API_KEY
assert.ok(key, "Set MIO_API_KEY for this explicitly opt-in live probe")
assert.ok(key.startsWith("tp-"), "This probe targets CN Token Plan")
const report = { date: new Date().toISOString(), endpoint: "https://token-plan-cn.xiaomimimo.com/v1", results: [] }
const { BlockAssembler, createToolResultMessage } = await import(
  pathToFileURL(join(upstream, "packages/llm/llm/lib/index.js")).href
)
const nativeFetch = globalThis.fetch
report.requests = []
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (url.hostname === "token-plan-cn.xiaomimimo.com" && url.pathname.endsWith("/chat/completions")) {
    const body = JSON.parse(init.body)
    report.requests.push({
      model: body.model,
      thinking: body.thinking,
      hasReasoningEffort: "reasoning_effort" in body,
      toolContinuation: body.messages.some((m) => m.role === "tool"),
      assistantReasoningPreserved: body.messages.some(
        (m) => m.role === "assistant" && typeof m.reasoning_content === "string" && m.reasoning_content.length > 0,
      ),
    })
  }
  return nativeFetch(input, init)
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
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@mio/desktop"] } },
  }),
)
await writeFile(join(directory, "cordis.yml"), "[]\n")
// Install the product bundle beside the test profile; keep the actual CLI as the runtime anchor.
await mkdir(join(directory, "node_modules/@mio"), { recursive: true })
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
  const brand = running.ctx.clientModules.graph().entries.find((entry) => entry.id === "@mio/brand")
  assert.ok(brand, "The product bundle must actually mount its browser brand plugin")
  assert.equal(running.ctx.agentDefaultModel.currentSelection().model, "mimo-v2.6-flash")
  const model = await running.ctx.llm.resolveModelInfo("mimo", "mimo-v2.6-flash")
  assert.deepEqual(
    model.reasoning.efforts.map((effort) => effort.id),
    ["off", "high"],
  )
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
  const saved = await backend.save(key, "cn")
  report.welcomeSave = saved.ok
  assert.equal(saved.ok, true, "Native welcome save failed")
  assert.equal((await backend.read()).hasApiKey, true)
  const stored = await readFile(join(home, ".credentials.yaml"), "utf8")
  report.credentialPersisted = stored.includes(key)
  assert.equal(report.credentialPersisted, true)
  const ask = (text) => [{ role: "user", content: [{ type: "text", text }] }]
  async function call(model, effort, messages, tools) {
    const assembler = new BlockAssembler()
    const start = Date.now()
    for await (const chunk of running.ctx.llm.stream({
      provider: "mimo",
      model,
      reasoningEffort: effort,
      messages,
      tools,
      maxTokens: 2048,
      signal: AbortSignal.timeout(90000),
    }))
      assembler.push(chunk)
    const message = assembler.message({
      provider: "mimo",
      model,
      ...(assembler.replayState === undefined ? {} : { replayState: assembler.replayState }),
    })
    const result = {
      model,
      effort,
      finish: assembler.finish,
      milliseconds: Date.now() - start,
      text: message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join(""),
      reasoning: message.content.some((b) => b.type === "reasoning" && b.text.length),
      toolCalls: message.content
        .filter((b) => b.type === "tool-call")
        .map((b) => ({ name: b.name, arguments: b.arguments })),
      usage: assembler.usage,
    }
    report.results.push(result)
    console.log("LIVE_RESULT", JSON.stringify(result).replaceAll(key, "[REDACTED]"))
    return { message, result }
  }
  for (const model of ["mimo-v2.6-flash", "mimo-v2.6-pro"]) {
    await call(model, "off", ask("Reply with exactly: MIO_OK"))
  }
  await call("mimo-v2.6-flash", "high", ask("Which is larger, 9.11 or 9.8? Answer with just the number."))
  await call("mimo-v2.6-pro", "high", ask("Which is larger, 9.11 or 9.8? Answer with just the number."))
  const messages = ask(
    "Use get_weather for Paris, then report its temperature and conditions. This is a synthetic test.",
  )
  const tools = [
    {
      name: "get_weather",
      description: "Get synthetic weather for a city.",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    },
  ]
  const first = await call("mimo-v2.6-flash", "high", messages, tools)
  const tool = first.message.content.find((b) => b.type === "tool-call")
  assert.equal(tool?.name, "get_weather")
  assert.match(JSON.parse(tool.arguments).city, /paris/i)
  await call(
    "mimo-v2.6-flash",
    "high",
    [
      ...messages,
      first.message,
      createToolResultMessage({ callId: tool.id, content: [{ type: "text", text: "Sunny, 22°C" }], isError: false }),
    ],
    tools,
  )
  assert.ok(report.results.every((r) => ["stop", "tool-calls"].includes(r.finish.kind)))
  assert.ok(report.results.filter((r) => r.effort === "off").every((r) => !r.reasoning && r.text.includes("MIO_OK")))
  assert.ok(report.results.slice(2, 4).every((r) => r.reasoning && r.text.includes("9.8")))
  assert.match(report.results.at(-1).text, /22/)
  assert.equal(report.requests.length, 6)
  assert.ok(report.requests.every((r) => !r.hasReasoningEffort))
  assert.ok(report.requests.slice(0, 2).every((r) => r.thinking.type === "disabled"))
  assert.ok(report.requests.slice(2).every((r) => r.thinking.type === "enabled"))
  assert.equal(report.requests.at(-1).assistantReasoningPreserved, true)
  assert.equal(report.requests.at(-1).toolContinuation, true)
  report.passed = true
} finally {
  await writeFile(
    join(upstream, "../live-validation.json"),
    JSON.stringify(report, null, 2).replaceAll(key, "[REDACTED]"),
  )
  await running.shutdown.shutdown(0)
  await rm(home, { recursive: true, force: true })
}
