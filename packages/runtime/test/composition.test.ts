/**
 * Replay a recorded MiMo response through the *real* Mio composition.
 *
 * This is deliberately an integration test rather than a unit test of a Mio
 * adapter, because Mio no longer has one: `mio.patch.yml` configures dsh's own
 * `llm-pi-ai` to speak to MiMo. What can still break is the composition —
 * a dsh upgrade changing pi-ai's config schema, a route or model id drifting,
 * or pi-ai's OpenAI-completions path mishandling something MiMo actually sends.
 * Only booting the tree and reading the answer catches those, so that is what
 * this does: a local server replays a cassette captured from the live API, the
 * headless profile is booted against it, and the assertion is on what a user
 * would see.
 *
 * The cassettes came from `archive/packages/llm-mimo/test/fixtures/recordings`,
 * captured against the live API with the key never recorded.
 */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer, type Server } from "node:http"
import { createRequire } from "node:module"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RUNTIME = path.resolve(HERE, "..")
const PATCH = path.join(RUNTIME, "mio.patch.yml")
const DSH_BIN = createRequire(import.meta.url).resolve("@deepseek-ai/dsh/lib/bin.js")

interface Cassette {
  interactions: { response: { status: number; headers: Record<string, string>; body: string } }[]
}

/**
 * Serve one cassette's recorded response to every chat-completions request.
 *
 * Every request, not just the first: a turn is not always one model call — dsh
 * may also title the session — and a server that answered once would hang the
 * second call rather than fail it.
 */
async function replayServer(cassette: string): Promise<{ server: Server; baseURL: string; calls: () => number }> {
  const raw = JSON.parse(await readFile(path.join(HERE, "fixtures", `${cassette}.json`), "utf8")) as Cassette
  const recorded = raw.interactions[0]?.response
  assert.ok(recorded, `${cassette}: cassette has no recorded response`)

  let calls = 0
  const server = createServer((request, response) => {
    calls += 1
    request.resume()
    request.on("end", () => {
      response.writeHead(recorded.status, recorded.headers)
      response.end(recorded.body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address === "object", "server did not bind a port")
  return { server, baseURL: `http://127.0.0.1:${address.port}/v1`, calls: () => calls }
}

/** The real patch layer with only its endpoint redirected at the replay server. */
async function patchPointedAt(baseURL: string, dir: string): Promise<string> {
  const original = await readFile(PATCH, "utf8")
  const redirected = original.replace(/baseURL: https:\/\/\S+/, `baseURL: ${baseURL}`)
  assert.notEqual(redirected, original, "patch layer no longer carries a baseURL to redirect")
  const file = path.join(dir, "mio.test.patch.yml")
  await writeFile(file, redirected)
  return file
}

/** Boot the headless profile on the composition and return what it printed. */
function runHeadless(patch: string, home: string, prompt: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    // `--expose-internals`: dsh reaches Node's internal ESM loader through it,
    // the same flag the desktop shell passes (packages/shell/README.md).
    const child = spawn(process.execPath, ["--expose-internals", DSH_BIN, "--profile", "headless", "--patch", patch, prompt], {
      cwd: home,
      env: { ...process.env, DSH_HOME: home, MIO_API_KEY: "replay-server-ignores-this" },
    })
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

async function boot(cassette: string, prompt: string) {
  const home = await mkdtemp(path.join(tmpdir(), "mio-composition-"))
  homes.push(home)
  const { server, baseURL, calls } = await replayServer(cassette)
  const result = await runHeadless(await patchPointedAt(baseURL, home), home, prompt)
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return { ...result, calls: calls() }
}

test("the composition answers from a recorded MiMo stream", { timeout: 180_000 }, async () => {
  const { code, out, calls } = await boot("reasoning-and-text", "What is a prefix cache?")

  assert.equal(code, 0, `headless exited ${code}:\n${out}`)
  assert.ok(calls > 0, "the composition never called the model endpoint")
  // The answer text, reassembled by dsh's own adapter from MiMo's wire format.
  assert.match(out, /prefix cache is a KV cache optimization/)
  // The reasoning stream is separate from the answer and must not leak into it.
  assert.doesNotMatch(out, /reasoning_content/)
})

test("a recorded MiMo error surfaces as a failure, not as an answer", { timeout: 180_000 }, async () => {
  const { code, out } = await boot("auth-error", "hello")

  assert.notEqual(code, 0, `an auth failure must not exit 0:\n${out}`)
})
