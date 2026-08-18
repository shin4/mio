/**
 * Replay tests for the MiMo adapter: a local HTTP server serves cassettes
 * captured from the live MiMo API (`script/record.ts`), and the real adapter
 * translates them into dsh StreamChunks. No mocks — the adapter's fetch, SSE
 * framing, block bookkeeping, usage arithmetic, and error mapping all run.
 *
 * The cassettes carry MiMo's real quirks, which is the point of recording them:
 * absent fields arrive as explicit `null` (`content`, `tool_calls`,
 * `reasoning_content`, and even `prompt_tokens_details`), and only the first
 * tool-call fragment carries `id` and `name`.
 */
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"
import { MessageId, type GenerateOptions, type Message, type StreamChunk } from "@deepseek-ai/dsh-llm"
import { MimoAdapter } from "../src/adapter.ts"

const RECORDINGS = new URL("./fixtures/recordings/", import.meta.url)

const servers: Server[] = []
after(() => servers.forEach((server) => server.close()))

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

/** Serve one recorded response and capture the request the adapter sent. */
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

/** Replay one recorded cassette, preserving its captured status. */
async function replay(name: string) {
  const raw = await readFile(fileURLToPath(new URL(`${name}.json`, RECORDINGS)), "utf8")
  const recording = JSON.parse(raw) as { interactions: { response: { status: number; body: string } }[] }
  const { status, body } = recording.interactions[0]!.response
  return serve(body, status)
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

const blockTypes = (chunks: StreamChunk[]) =>
  chunks.filter((chunk) => chunk.type === "block-start").map((chunk) => chunk.blockType)

test("reasoning-and-text: emits reasoning before text and assembles both blocks", async () => {
  const { baseURL, captured } = await replay("reasoning-and-text")
  const chunks = await collect(adapterFor(baseURL).stream(request({ system: "Be brief.", maxTokens: 200 })))

  deepStrictEqual(blockTypes(chunks), ["reasoning", "text"])

  const ends = chunks.filter((chunk) => chunk.type === "block-end")
  const reasoning = ends.find((chunk) => chunk.block.type === "reasoning")
  const text = ends.find((chunk) => chunk.block.type === "text")
  ok(reasoning?.block.type === "reasoning" && reasoning.block.text.length > 0)
  ok(text?.block.type === "text" && text.block.text.length > 0)

  // Each block-end must carry exactly the deltas that preceded it.
  const textDeltas = chunks
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => chunk.text)
    .join("")
  strictEqual(text.block.text, textDeltas)

  const finish = chunks.at(-1)
  ok(finish?.type === "finish")
  strictEqual(finish.reason.kind, "stop")

  const sent = JSON.parse(captured.body!) as { model: string; stream: boolean; messages: { role: string }[] }
  strictEqual(sent.model, "mimo-v2.5")
  strictEqual(sent.stream, true)
  strictEqual(sent.messages[0]!.role, "system")
  strictEqual(captured.headers?.["api-key"], "sk-test-key", "MiMo authenticates with the api-key header")
  ok(!captured.headers?.["authorization"], "must not send Authorization: Bearer")
  ok(String(captured.headers?.["user-agent"]).startsWith("mio/"), "attribution header must identify Mio")
})

test("reasoning-and-text: reports usage when MiMo sends prompt_tokens_details as null", async () => {
  const { baseURL } = await replay("reasoning-and-text")
  const usage = (await collect(adapterFor(baseURL).stream(request()))).find((chunk) => chunk.type === "usage")
  ok(usage?.type === "usage")
  // No cache section in this turn: `prompt_tokens_details` is literally null.
  deepStrictEqual(usage.usage, { inputTokens: 27, outputTokens: 48, reasoningTokens: 15 })
})

test("tool-call: assembles the call from fragments that only name it once", async () => {
  const { baseURL } = await replay("tool-call")
  const chunks = await collect(adapterFor(baseURL).stream(request()))

  deepStrictEqual(blockTypes(chunks), ["reasoning", "tool-call"])

  const end = chunks.find((chunk) => chunk.type === "block-end" && chunk.block.type === "tool-call")
  ok(end?.type === "block-end" && end.block.type === "tool-call")
  strictEqual(end.block.name, "get_weather")
  deepStrictEqual(JSON.parse(end.block.arguments), { city: "Paris" })
  ok(end.block.id.startsWith("call_"), "the provider-issued call id must survive the null fragments")

  // Only the first fragment carries a name; later deltas must not re-announce it.
  const named = chunks.filter((chunk) => chunk.type === "tool-call-delta" && chunk.name !== undefined)
  strictEqual(named.length, 1)

  const finish = chunks.at(-1)
  ok(finish?.type === "finish")
  strictEqual(finish.reason.kind, "tool-calls")
})

test("tool-call: splits cache reads out of the input count", async () => {
  const { baseURL } = await replay("tool-call")
  const usage = (await collect(adapterFor(baseURL).stream(request()))).find((chunk) => chunk.type === "usage")
  ok(usage?.type === "usage")
  // Wire: prompt_tokens 270 including 256 cached. dsh counts are disjoint.
  deepStrictEqual(usage.usage, { inputTokens: 14, outputTokens: 49, cacheReadTokens: 256, reasoningTokens: 27 })
})

test("tool-result-continuation: answers after a tool result and still reports cache reads", async () => {
  const { baseURL, captured } = await replay("tool-result-continuation")
  const call = { type: "tool-call", id: "call_recorded", name: "get_weather", arguments: '{"city": "Paris"}' } as const
  const chunks = await collect(
    adapterFor(baseURL).stream(
      request({
        messages: [
          userMessage("m1", "What is the weather in Paris? Use the tool."),
          assistantMessage("m2", [{ ...call, id: call.id as never }]),
          {
            id: MessageId("m3"),
            role: "user",
            content: [
              {
                type: "tool-result",
                toolCallId: call.id as never,
                content: [{ type: "text", text: '{"forecast":"sunny"}' }],
              },
            ],
            source: { kind: "tool", callId: call.id as never },
          },
        ],
      }),
    ),
  )

  ok(blockTypes(chunks).includes("text"))
  const finish = chunks.at(-1)
  ok(finish?.type === "finish")
  strictEqual(finish.reason.kind, "stop")

  const usage = chunks.find((chunk) => chunk.type === "usage")
  ok(usage?.type === "usage")
  deepStrictEqual(usage.usage, { inputTokens: 60, outputTokens: 57, cacheReadTokens: 256, reasoningTokens: 35 })

  // The assistant tool call and its result must serialize to MiMo's wire shapes.
  const sent = JSON.parse(captured.body!) as {
    messages: { role: string; tool_calls?: { id: string }[]; tool_call_id?: string }[]
  }
  const assistant = sent.messages.find((message) => message.role === "assistant")
  strictEqual(assistant?.tool_calls?.[0]?.id, "call_recorded")
  strictEqual(sent.messages.find((message) => message.role === "tool")?.tool_call_id, "call_recorded")
})

test("max-tokens-truncation: maps a length finish to max-tokens", async () => {
  const { baseURL } = await replay("max-tokens-truncation")
  const finish = (await collect(adapterFor(baseURL).stream(request({ maxTokens: 16 })))).at(-1)
  ok(finish?.type === "finish")
  // dsh's assembler drops tool calls on this finish; the adapter only reports it.
  strictEqual(finish.reason.kind, "max-tokens")
})

test("auth-error: surfaces MiMo's 401 as a typed AUTH failure", async () => {
  const { baseURL } = await replay("auth-error")
  const error = await adapterFor(baseURL)
    .stream(request())
    [Symbol.asyncIterator]()
    .next()
    .then(() => undefined)
    .catch((cause: unknown) => cause)

  ok(error instanceof Error)
  strictEqual((error as { code?: string }).code, "AUTH")
  strictEqual((error as { failure?: { status?: number } }).failure?.status, 401)
  ok(error.message.includes("Invalid API Key"), "the provider's own diagnosis must reach the message")
})

test("surfaces a rate limit with the provider's retry-after", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(429, { "content-type": "application/json", "retry-after": "30", "x-request-id": "req-42" })
    response.end('{"error":{"message":"quota exceeded"}}')
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  ok(address && typeof address === "object")

  const error = await adapterFor(`http://127.0.0.1:${address.port}`)
    .stream(request())
    [Symbol.asyncIterator]()
    .next()
    .then(() => undefined)
    .catch((cause: unknown) => cause)

  ok(error instanceof Error)
  const failure = (error as { failure?: { status?: number; providerRetryAfterMs?: number; requestId?: string } }).failure
  strictEqual((error as { code?: string }).code, "RATE_LIMIT")
  strictEqual(failure?.providerRetryAfterMs, 30_000)
  strictEqual(failure?.requestId, "req-42")
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

test("tolerates a stream that ends without any finish_reason", async () => {
  const body = ['data: {"choices":[{"delta":{"content":"answer"}}]}', "data: [DONE]", ""].join("\n\n")
  const { baseURL } = await serve(body)
  const finish = (await collect(adapterFor(baseURL).stream(request()))).at(-1)
  ok(finish?.type === "finish")
  strictEqual(finish.reason.kind, "stop")
})

test("drops an assistant turn that carries neither text nor tool calls", async () => {
  const { baseURL, captured } = await replay("reasoning-and-text")
  const messages = [assistantMessage("m0", []), userMessage("m1", "hello")]
  await collect(adapterFor(baseURL).stream(request({ messages })))

  const sent = JSON.parse(captured.body!) as { messages: { role: string }[] }
  // MiMo rejects empty assistant turns (ported from filterMimoOpenAIEmptyAssistantMessages).
  deepStrictEqual(
    sent.messages.map((message) => message.role),
    ["user"],
  )
})
