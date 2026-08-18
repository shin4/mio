/**
 * Replay tests for the MiMo adapter: a local HTTP server serves SSE bodies
 * recorded from real OpenAI-chat providers (the wire protocol MiMo speaks),
 * and the real adapter translates them into dsh StreamChunks. No mocks — the
 * adapter's fetch, SSE framing, block bookkeeping, and finish mapping all run.
 *
 * Recordings come from the archived Effect runtime's cassettes
 * (archive/packages/llm/test/fixtures/recordings/openai-chat). Phase 1 adds
 * MiMo-specific cassettes (reasoning_content, multimodal, tool-call repair).
 */
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"
import { MessageId, type GenerateOptions, type Message, type StreamChunk } from "@deepseek-ai/dsh-llm"
import { MimoAdapter } from "../src/adapter.ts"

const userMessage = (id: string, text: string): Message => ({
  id: MessageId(id),
  role: "user",
  content: [{ type: "text", text }],
  source: { kind: "user" },
})

const assistantMessage = (id: string, content: Message["content"]): Message => ({
  id: MessageId(id),
  role: "assistant",
  content,
  source: { kind: "model", provider: "mimo", model: "mimo-v2.5" },
})

const RECORDINGS = new URL("../../../archive/packages/llm/test/fixtures/recordings/openai-chat/", import.meta.url)

const servers: Server[] = []
after(() => servers.forEach((server) => server.close()))

/** Serve one recorded SSE body and capture the request the adapter sent. */
async function serve(body: string, status = 200) {
  const captured: { body?: string; headers?: Record<string, string | string[] | undefined> } = {}
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      captured.body = Buffer.concat(chunks).toString()
      captured.headers = request.headers
      response.writeHead(status, { "content-type": "text/event-stream" })
      response.end(body)
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  ok(address && typeof address === "object")
  return { baseURL: `http://127.0.0.1:${address.port}`, captured }
}

async function recordedBody(name: string): Promise<string> {
  const raw = await readFile(fileURLToPath(new URL(`${name}.json`, RECORDINGS)), "utf8")
  const recording = JSON.parse(raw) as { interactions: { response: { body: string } }[] }
  return recording.interactions[0]!.response.body
}

function adapterFor(baseURL: string) {
  return new MimoAdapter({
    connection: () => ({ baseURL, apiKeyRef: "MIO_API_KEY" }),
    resolveApiKey: async () => "sk-test-key",
  })
}

function request(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: "mimo",
    model: "mimo-v2.5",
    messages: [userMessage("m1", "What is the weather in Paris?")],
    ...overrides,
  }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

test("translates a recorded text stream into text blocks and a stop finish", async () => {
  const { baseURL, captured } = await serve(await recordedBody("streams-text"))
  const chunks = await collect(adapterFor(baseURL).stream(request({ system: "Be brief.", maxTokens: 40 })))

  const start = chunks.filter((chunk) => chunk.type === "block-start")
  deepStrictEqual(
    start.map((chunk) => chunk.blockType),
    ["text"],
  )

  const text = chunks
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => chunk.text)
    .join("")
  ok(text.length > 0, "expected text deltas")

  const end = chunks.find((chunk) => chunk.type === "block-end")
  ok(end && end.block.type === "text")
  strictEqual(end.block.text, text, "block-end must carry the assembled text")

  const finish = chunks.at(-1)
  ok(finish?.type === "finish")
  strictEqual(finish.reason.kind, "stop")

  // The request the adapter actually sent.
  const sent = JSON.parse(captured.body!) as {
    model: string
    stream: boolean
    messages: { role: string; content: string }[]
  }
  strictEqual(sent.model, "mimo-v2.5")
  strictEqual(sent.stream, true)
  deepStrictEqual(sent.messages[0], { role: "system", content: "Be brief." })
  strictEqual(captured.headers?.["api-key"], "sk-test-key", "MiMo authenticates with the api-key header")
  ok(!captured.headers?.["authorization"], "must not send Authorization: Bearer")
  ok(String(captured.headers?.["user-agent"]).startsWith("mio/"), "attribution header must identify Mio")
})

test("assembles a tool-call block from a recorded tool-call stream", async () => {
  const { baseURL } = await serve(await recordedBody("streams-tool-call"))
  const chunks = await collect(adapterFor(baseURL).stream(request()))

  const start = chunks.find((chunk) => chunk.type === "block-start")
  strictEqual(start?.blockType, "tool-call")

  const deltas = chunks.filter((chunk) => chunk.type === "tool-call-delta")
  ok(deltas.length > 0, "expected tool-call deltas")
  const args = deltas.map((chunk) => chunk.argumentsDelta).join("")

  const end = chunks.find((chunk) => chunk.type === "block-end")
  ok(end && end.block.type === "tool-call")
  strictEqual(end.block.name, "get_weather")
  strictEqual(end.block.arguments, args)
  deepStrictEqual(JSON.parse(end.block.arguments), { city: "Paris" })
  ok(end.block.id.length > 0, "the tool call must carry a correlation id")

  // This recording ends with finish_reason "stop" even though it emitted a tool
  // call — a real provider quirk. The mapping stays verbatim: the agent loop
  // dispatches from the tool-call blocks, not from the finish reason.
  const finish = chunks.at(-1)
  ok(finish?.type === "finish")
  strictEqual(finish.reason.kind, "stop")
})

test("maps an explicit tool_calls finish to tool-calls", async () => {
  const body = [
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"ls","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}',
    "data: [DONE]",
    "",
  ].join("\n\n")
  const { baseURL } = await serve(body)
  const finish = (await collect(adapterFor(baseURL).stream(request()))).at(-1)
  ok(finish?.type === "finish")
  strictEqual(finish.reason.kind, "tool-calls")
})

test("surfaces an unrecognized finish reason as an error finish", async () => {
  const body = ['data: {"choices":[{"delta":{"content":"x"},"finish_reason":"content_filter"}]}', "data: [DONE]", ""].join(
    "\n\n",
  )
  const { baseURL } = await serve(body)
  const finish = (await collect(adapterFor(baseURL).stream(request()))).at(-1)
  ok(finish?.type === "finish")
  ok(finish.reason.kind === "error")
  strictEqual(finish.reason.failure.code, "CONTENT_FILTER")
})

test("reports usage with cache reads split out of the input count", async () => {
  const body = [
    'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":80},"completion_tokens_details":{"reasoning_tokens":3}}}',
    "data: [DONE]",
    "",
  ].join("\n\n")
  const { baseURL } = await serve(body)
  const chunks = await collect(adapterFor(baseURL).stream(request()))

  const usage = chunks.find((chunk) => chunk.type === "usage")
  ok(usage?.type === "usage")
  // dsh counts are disjoint: inputTokens excludes cache reads.
  deepStrictEqual(usage.usage, { inputTokens: 20, outputTokens: 7, cacheReadTokens: 80, reasoningTokens: 3 })
})

test("emits reasoning before text and tolerates a missing finish_reason", async () => {
  const body = [
    'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}',
    'data: {"choices":[{"delta":{"content":"answer"}}]}',
    "data: [DONE]",
    "",
  ].join("\n\n")
  const { baseURL } = await serve(body)
  const chunks = await collect(adapterFor(baseURL).stream(request()))

  deepStrictEqual(
    chunks.filter((chunk) => chunk.type === "block-start").map((chunk) => chunk.blockType),
    ["reasoning", "text"],
  )
  const finish = chunks.at(-1)
  ok(finish?.type === "finish")
  // MiMo sometimes ends a stream without finish_reason; that is a clean stop.
  strictEqual(finish.reason.kind, "stop")
})

test("maps a length finish to max-tokens", async () => {
  const body = ['data: {"choices":[{"delta":{"content":"x"},"finish_reason":"length"}]}', "data: [DONE]", ""].join("\n\n")
  const { baseURL } = await serve(body)
  const chunks = await collect(adapterFor(baseURL).stream(request()))
  const finish = chunks.at(-1)
  ok(finish?.type === "finish")
  strictEqual(finish.reason.kind, "max-tokens")
})

test("drops an assistant turn that carries neither text nor tool calls", async () => {
  const { baseURL, captured } = await serve(await recordedBody("streams-text"))
  const messages = [assistantMessage("m0", []), userMessage("m1", "hello")]
  await collect(adapterFor(baseURL).stream(request({ messages })))

  const sent = JSON.parse(captured.body!) as { messages: { role: string }[] }
  // MiMo rejects empty assistant turns (ported from filterMimoOpenAIEmptyAssistantMessages).
  deepStrictEqual(
    sent.messages.map((message) => message.role),
    ["user"],
  )
})

test("surfaces an HTTP failure as a typed LlmError with provider facts", async () => {
  const { baseURL } = await serve("quota exceeded", 429)
  const error = await adapterFor(baseURL)
    .stream(request())
    [Symbol.asyncIterator]()
    .next()
    .then(() => undefined)
    .catch((cause: unknown) => cause)

  ok(error instanceof Error)
  strictEqual((error as { code?: string }).code, "RATE_LIMIT")
  strictEqual((error as { failure?: { status?: number } }).failure?.status, 429)
})
