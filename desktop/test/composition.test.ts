/** Real rc.2 composition replaying historical V2.5 API cassettes.
 * Verifies our V2.6 request configuration and parser compatibility, not live V2.6 availability.
 */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RUNTIME = path.resolve(HERE, "..")
const PATCH = path.join(RUNTIME, "bundle", "mio.patch.yml")
const FIXTURES = path.resolve(RUNTIME, "../packages/runtime/test/fixtures")
const DSH_BIN = path.resolve(RUNTIME, "../.desktop-build/upstream/apps/cli/lib/bin.js")

interface Cassette {
  interactions: { response: { status: number; headers: Record<string, string>; body: string } }[]
}

/**
 * Replay the supplied responses in order, retaining requests to check the
 * actual tool-result continuation. Extra requests repeat the last response.
 */
async function replayServer(cassette: string | string[]) {
  const recordings = await Promise.all(
    (Array.isArray(cassette) ? cassette : [cassette]).map(async (name) => {
      const raw: Cassette = JSON.parse(await readFile(path.join(FIXTURES, `${name}.json`), "utf8"))
      const recorded = raw.interactions[0]?.response
      assert.ok(recorded, `${name}: cassette has no recorded response`)
      return recorded
    }),
  )
  const requests: {
    model?: string
    thinking?: { type: string }
    reasoning_effort?: string
    messages?: { role: string; content?: string; reasoning_content?: string; tool_call_id?: string }[]
  }[] = []
  const server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString()
    })
    request.on("end", () => {
      requests.push(JSON.parse(body))
      const recorded = recordings[Math.min(requests.length - 1, recordings.length - 1)]
      response.writeHead(recorded.status, recorded.headers)
      response.end(recorded.body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address === "object", "server did not bind a port")
  return { server, baseURL: `http://127.0.0.1:${address.port}/v1`, calls: () => requests.length, requests }
}

/** The real patch layer with only its endpoint redirected at the replay server. */
async function patchPointedAt(baseURL: string, dir: string, thinking: "high" | "off"): Promise<string> {
  const original = await readFile(PATCH, "utf8")
  const redirected = original
    .replace("reasoningEffort: high", `reasoningEffort: ${thinking}`)
    .replace(/baseURL: https:\/\/\S+/, `baseURL: ${baseURL}`)
  assert.notEqual(redirected, original, "patch layer no longer carries a baseURL to redirect")
  const file = path.join(dir, "mio.test.patch.yml")
  // Title generation is a separate model call, outside these turn cassettes.
  await writeFile(file, `${redirected}\n- id: session-title-llm\n  disabled: true\n`)
  return file
}

/** Boot the headless profile on the composition and return what it printed. */
function runHeadless(patch: string, home: string, prompt: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    // `--expose-internals`: dsh reaches Node's internal ESM loader through it,
    // the same flag the desktop shell passes (packages/shell/README.md).
    const child = spawn(
      process.execPath,
      ["--expose-internals", DSH_BIN, "--profile", "headless", "--patch", patch, prompt],
      {
        cwd: home,
        timeout: 120_000,
        env: { ...process.env, DSH_HOME: home, MIO_API_KEY: "replay-server-ignores-this" },
      },
    )
    let out = ""
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (out += chunk.toString()))
    child.on("close", (code) => resolve({ code, out }))
  })
}

const homes: string[] = []
after(async () => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

/** Headless replay mounts the real brand host face; the Web suite verifies bundle discovery. */
async function installPlugins(home: string, profile: string) {
  const target = path.join(home, "profiles", profile, "node_modules", "@mio", "brand")
  await mkdir(target, { recursive: true })
  await cp(path.join(RUNTIME, "brand"), target, { recursive: true })
}

async function boot(cassette: string | string[], prompt: string, thinking: "high" | "off" = "high") {
  const home = await mkdtemp(path.join(tmpdir(), "mio-composition-"))
  homes.push(home)
  await installPlugins(home, "headless")
  const { server, baseURL, calls, requests } = await replayServer(cassette)
  const patch = await patchPointedAt(baseURL, home, thinking)
  if (Array.isArray(cassette)) {
    const plugin = path.join(home, "profiles", "headless", "node_modules", "mio-replay-weather")
    await mkdir(plugin, { recursive: true })
    await writeFile(
      path.join(plugin, "package.json"),
      JSON.stringify({ name: "mio-replay-weather", type: "module", main: "index.js" }),
    )
    await cp(path.join(FIXTURES, "weather-plugin.js"), path.join(plugin, "index.js"))
    await writeFile(
      patch,
      `${await readFile(patch, "utf8")}\n- insert:\n    - id: replay-weather\n      name: mio-replay-weather\n`,
    )
  }
  const result = await runHeadless(patch, home, prompt)
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return { ...result, calls: calls(), requests }
}

test("the composition answers from a recorded MiMo stream", { timeout: 180_000 }, async () => {
  const { code, out, calls, requests } = await boot("reasoning-and-text", "What is a prefix cache?")

  assert.equal(code, 0, `headless exited ${code}:\n${out}`)
  assert.ok(calls > 0, "the composition never called the model endpoint")
  assert.equal(requests[0]?.model, "mimo-v2.6-flash")
  assert.deepEqual(requests[0]?.thinking, { type: "enabled" })
  assert.equal(requests[0]?.reasoning_effort, undefined)
  // The answer text, reassembled by dsh's own adapter from MiMo's wire format.
  assert.match(out, /prefix cache is a KV cache optimization/)
  // The reasoning stream is separate from the answer and must not leak into it.
  assert.doesNotMatch(out, /reasoning_content/)
})

test("a recorded MiMo error surfaces as a failure, not as an answer", { timeout: 180_000 }, async () => {
  const { code, out } = await boot("auth-error", "hello")

  assert.notEqual(code, 0, `an auth failure must not exit 0:\n${out}`)
})

void test("MiMo tool fragments execute and the result reaches the continuation", { timeout: 180_000 }, async () => {
  const result = await boot(["tool-call", "tool-result-continuation"], "What is the weather in Paris? Use get_weather.")
  assert.equal(result.code, 0, result.out)
  assert.match(result.out, /22°C/)
  const tool = result.requests.flatMap((request) => request.messages ?? []).find((message) => message.role === "tool")
  assert.equal(
    tool?.tool_call_id,
    "call_614ea9cedb504d5aa2155799",
    "the live cassette's first-fragment ID must survive",
  )
  assert.ok(tool)
  assert.match(tool.content ?? "", /22/)
  assert.match(tool.content ?? "", /sunny/)
})

void test("a length-truncated MiMo stream terminates without executing a tool", { timeout: 180_000 }, async () => {
  const result = await boot("max-tokens-truncation", "Explain transformers in detail.")
  assert.equal(result.calls, 1, result.out)
  assert.ok(result.requests.every((request) => (request.messages ?? []).every((message) => message.role !== "tool")))
  assert.doesNotMatch(result.out, /TypeError|SyntaxError/)
})

void test("MiMo off explicitly disables thinking without an effort tier", { timeout: 180_000 }, async () => {
  const result = await boot("reasoning-and-text", "What is a prefix cache?", "off")
  assert.equal(result.code, 0, result.out)
  assert.deepEqual(result.requests[0]?.thinking, { type: "disabled" })
  assert.equal(result.requests[0]?.reasoning_effort, undefined)
})
