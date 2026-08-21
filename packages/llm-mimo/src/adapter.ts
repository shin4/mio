/**
 * Direct-fetch MiMo adapter speaking the OpenAI-chat wire protocol over SSE.
 *
 * The serialization + chunk translation started as a port of the MiMo-tuned
 * pieces of the archived Effect runtime (archive/packages/llm/src/protocols/
 * openai-chat.ts and archive/packages/agent/src/provider/transform.ts) and is
 * now verified against cassettes captured from the live API (`script/record.ts`,
 * replayed by `test/adapter.test.ts`).
 *
 * MiMo wire facts this relies on, all present in those cassettes: absent delta
 * fields arrive as explicit `null` (including `prompt_tokens_details`), only the
 * first tool-call fragment carries `id` and `name`, and `prompt_tokens` includes
 * cache hits that dsh wants counted separately.
 */
import {
  attributionHeaders,
  CallId,
  LlmAdapter,
  LlmError,
  ProviderRequestId,
  type ContentBlock,
  type FinishReason,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type Message,
  type StreamChunk,
  type TokenUsage,
  type ToolResultBlock,
} from "@deepseek-ai/dsh-llm"
import { isReasoningEffort, listModels, providerInfo, resolveModel, DEFAULT_MAX_TOKENS, REASONING_EFFORTS } from "./catalog.ts"

const PKG = "@mio/llm-mimo"

// Public product identity for provider-request attribution (User-Agent).
// TODO(phase-1): source the version from package metadata at build time.
const MIO_IDENTITY = { product: "mio", version: "0.0.1", url: "https://github.com/shin4/mio" }

/** One resolution's complete connection facts, re-read per request. */
export interface MimoConnection {
  readonly baseURL: string
  /** Credential reference (environment-variable name) resolved per request. */
  readonly apiKeyRef: string
}

export interface MimoAdapterOptions {
  /** Current connection facts; re-read per request so settings edits land immediately. */
  readonly connection: () => MimoConnection
  /** Resolve the credential named by {@link MimoConnection.apiKeyRef}. */
  readonly resolveApiKey: (ref: string) => Promise<string>
}

// MiMo sends explicit `null` for every absent field rather than omitting it —
// including the usage detail objects. These types say so (verified by the
// cassettes) so nothing downstream assumes a missing key means undefined.
type WireToolCall = {
  index?: number
  id?: string | null
  function?: { name?: string | null; arguments?: string | null } | null
}
type WireDelta = {
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: WireToolCall[] | null
}
type WireEvent = {
  choices?: { delta?: WireDelta | null; finish_reason?: string | null }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number } | null
    completion_tokens_details?: { reasoning_tokens?: number } | null
  } | null
}

type OpenAIMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant"
      content: string | null
      reasoning_content?: string
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[]
    }
  | { role: "tool"; tool_call_id: string; content: string }

const HTTP_ERROR_CODES: Record<number, string> = {
  400: "INVALID_REQUEST",
  401: "AUTH",
  403: "AUTH",
  404: "NOT_FOUND",
  429: "RATE_LIMIT",
}

export class MimoAdapter extends LlmAdapter {
  // Erasable syntax only (Node type-stripping): no parameter properties.
  readonly options: MimoAdapterOptions

  constructor(options: MimoAdapterOptions) {
    super()
    this.options = options
  }

  override providerInfo(): LlmProviderInfo {
    return providerInfo
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(listModels(provider))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve(resolveModel(provider, model))
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // Connection and credential resolve together: a rejected snapshot keeps the
    // whole previous generation, so a request can never pair a stale endpoint
    // with a newer key.
    const connection = this.options.connection()
    const apiKey = await this.options.resolveApiKey(connection.apiKeyRef)

    const response = await fetch(`${connection.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // MiMo auth: lowercase `api-key` header, not Authorization: Bearer.
        "api-key": apiKey,
        ...attributionHeaders(MIO_IDENTITY),
      },
      body: JSON.stringify(serializeRequest(options)),
      signal: options.signal,
    })
    if (!response.ok) throw await httpError(response)
    if (!response.body) throw new LlmError(`${PKG}: response has no body`, "PROTOCOL")

    yield* translateSse(response.body)
  }
}

function serializeRequest(options: GenerateOptions): Record<string, unknown> {
  return {
    model: options.model,
    messages: serializeMessages(options),
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(options.reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort(options.reasoningEffort) }),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.stop?.length ? { stop: options.stop } : {}),
    ...(options.tools?.length
      ? {
          tools: options.tools.map((tool) => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.parameters },
          })),
        }
      : {}),
  }
}

/**
 * Validate the caller's effort against the tiers MiMo accepts. Refusing here
 * names the offending value and the allowed set; MiMo's own rejection is an
 * opaque 400 "Invalid request parameters" with an empty `param`.
 */
function reasoningEffort(effort: string): string {
  if (isReasoningEffort(effort)) return effort
  throw new LlmError(
    `${PKG}: unsupported reasoning effort "${effort}" (MiMo accepts ${REASONING_EFFORTS.join(", ")})`,
    "INVALID_REQUEST",
  )
}

function serializeMessages(options: GenerateOptions): OpenAIMessage[] {
  const system: OpenAIMessage[] = options.system ? [{ role: "system", content: options.system }] : []
  return [...system, ...options.messages.flatMap(serializeMessage)]
}

function serializeMessage(message: Message): OpenAIMessage[] {
  const toolResults = message.content
    .filter((block): block is ToolResultBlock => block.type === "tool-result")
    .map((block): OpenAIMessage => ({ role: "tool", tool_call_id: block.toolCallId, content: textOf(block.content) }))

  if (message.role === "assistant") {
    const toolCalls = message.content
      .filter((block) => block.type === "tool-call")
      .map((block) => ({
        id: block.id as string,
        type: "function" as const,
        function: { name: block.name, arguments: block.arguments },
      }))
    const text = textOf(message.content)
    // Replayed so the model sees the reasoning state its previous turn produced,
    // as dsh's own DeepSeek adapter does. MiMo accepts the field in history —
    // verified against the live API, including a turn that carries reasoning and
    // no content.
    const reasoning = message.content
      .filter((block) => block.type === "reasoning")
      .map((block) => block.text)
      .join("")
    // Port of filterMimoOpenAIEmptyAssistantMessages: MiMo rejects assistant
    // turns that carry neither text nor tool calls. A reasoning-only turn is
    // still worth sending, so it counts as content here.
    if (!text && !reasoning && toolCalls.length === 0) return toolResults
    return [
      ...toolResults,
      {
        role: "assistant",
        content: text || null,
        ...(reasoning ? { reasoning_content: reasoning } : {}),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
    ]
  }

  if (message.content.some((block) => block.type === "image"))
    throw new LlmError(`${PKG}: image input is not wired yet (MIGRATION.md, Phase 1 multimodal parts)`, "UNSUPPORTED_CONTENT")

  const text = textOf(message.content)
  if (!text) return toolResults
  return [...toolResults, { role: message.role === "system" ? "system" : "user", content: text }]
}

function textOf(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
}

async function httpError(response: Response): Promise<LlmError> {
  const body = await response.text()
  const code = HTTP_ERROR_CODES[response.status] ?? (response.status >= 500 ? "SERVER" : "HTTP")
  const retryAfterSeconds = Number(response.headers.get("retry-after"))
  const requestId = response.headers.get("x-request-id")
  return new LlmError(`${PKG}: HTTP ${response.status} from MiMo: ${body.slice(0, 300)}`, code, {
    status: response.status,
    ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? { providerRetryAfterMs: retryAfterSeconds * 1000 }
      : {}),
    ...(requestId ? { requestId: ProviderRequestId(requestId) } : {}),
  })
}

async function* translateSse(body: ReadableStream<Uint8Array>): AsyncIterable<StreamChunk> {
  const decoder = new TextDecoder()
  let buffer = ""

  // Open-block state: indexes are assigned in arrival order and closed in the
  // same order before the terminal chunks.
  let nextIndex = 0
  let text: { index: number; accum: string } | undefined
  let reasoning: { index: number; accum: string } | undefined
  const toolCalls = new Map<number, { index: number; id: string; name: string; accum: string }>()
  let finishReason: string | undefined
  let usage: TokenUsage | undefined

  function* handle(event: WireEvent): Generator<StreamChunk> {
    const choice = event.choices?.[0]
    const delta = choice?.delta

    if (delta?.reasoning_content) {
      if (!reasoning) {
        reasoning = { index: nextIndex++, accum: "" }
        yield { type: "block-start", index: reasoning.index, blockType: "reasoning" }
      }
      reasoning.accum += delta.reasoning_content
      yield { type: "reasoning-delta", index: reasoning.index, text: delta.reasoning_content }
    }

    if (delta?.content) {
      if (!text) {
        text = { index: nextIndex++, accum: "" }
        yield { type: "block-start", index: text.index, blockType: "text" }
      }
      text.accum += delta.content
      yield { type: "text-delta", index: text.index, text: delta.content }
    }

    for (const wireCall of delta?.tool_calls ?? []) {
      const key = wireCall.index ?? 0
      const existing = toolCalls.get(key)
      const call = existing ?? {
        index: nextIndex++,
        // MiMo occasionally omits the call id on the first fragment; synthesize
        // a stable one so correlation survives (mirrors the archived assembler).
        id: wireCall.id ?? `mimo-call-${key}-${nextIndex}`,
        name: "",
        accum: "",
      }
      if (!existing) {
        toolCalls.set(key, call)
        yield { type: "block-start", index: call.index, blockType: "tool-call" }
      }
      call.name = call.name || (wireCall.function?.name ?? "")
      const argumentsDelta = wireCall.function?.arguments ?? ""
      call.accum += argumentsDelta
      yield {
        type: "tool-call-delta",
        index: call.index,
        id: CallId(call.id),
        ...(wireCall.function?.name ? { name: wireCall.function.name } : {}),
        argumentsDelta,
      }
    }

    if (choice?.finish_reason) finishReason = choice.finish_reason
    if (event.usage) {
      const cached = event.usage.prompt_tokens_details?.cached_tokens ?? 0
      usage = {
        // dsh counts are disjoint: uncached input only; cache reads separate.
        inputTokens: Math.max(0, (event.usage.prompt_tokens ?? 0) - cached),
        outputTokens: event.usage.completion_tokens ?? 0,
        ...(cached ? { cacheReadTokens: cached } : {}),
        ...(event.usage.completion_tokens_details?.reasoning_tokens
          ? { reasoningTokens: event.usage.completion_tokens_details.reasoning_tokens }
          : {}),
      }
    }
  }

  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const payload = line.replace(/\r$/, "")
      if (!payload.startsWith("data:")) continue
      const data = payload.slice(5).trim()
      if (!data || data === "[DONE]") continue
      yield* handle(JSON.parse(data) as WireEvent)
    }
  }

  // Close open blocks in the order they were opened.
  const closures: StreamChunk[] = [
    ...(reasoning ? [{ type: "block-end", index: reasoning.index, block: { type: "reasoning", text: reasoning.accum } } as const] : []),
    ...(text ? [{ type: "block-end", index: text.index, block: { type: "text", text: text.accum } } as const] : []),
    ...[...toolCalls.values()].map(
      (call) =>
        ({
          type: "block-end",
          index: call.index,
          block: { type: "tool-call", id: CallId(call.id), name: call.name, arguments: call.accum },
        }) as const,
    ),
  ].sort((left, right) => left.index - right.index)
  yield* closures

  if (usage) yield { type: "usage", usage }
  // MiMo tolerance (ported): a stream that ends without any finish_reason counts
  // as a clean stop rather than a protocol failure. An unrecognized reason is
  // NOT swallowed — it surfaces as an error finish, as dsh's own adapters do.
  yield { type: "finish", reason: finishReason === undefined ? { kind: "stop" } : mapFinishReason(finishReason) }
}

/**
 * Map the wire finish_reason vocabulary to the harness FinishReason. The
 * mapping is verbatim: the agent loop dispatches tools from the assembled
 * tool-call blocks, not from this reason, so a provider that labels a
 * tool-call turn `stop` still drives the loop correctly.
 */
function mapFinishReason(reason: string): FinishReason {
  if (reason === "stop") return { kind: "stop" }
  if (reason === "tool_calls") return { kind: "tool-calls" }
  if (reason === "length") return { kind: "max-tokens" }
  return { kind: "error", failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() } }
}
