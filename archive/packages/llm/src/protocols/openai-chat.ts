import { Array as Arr, Effect, Schema } from "effect"
import { Route } from "../route/client"
import { Auth } from "../route/auth"
import { Endpoint } from "../route/endpoint"
import { HttpTransport } from "../route/transport"
import { Protocol } from "../route/protocol"
import {
  LLMEvent,
  Usage,
  type FinishReason,
  type LLMRequest,
  type TextPart,
  type MediaPart,
  type ToolCallPart,
  type ToolDefinition,
} from "../schema"
import { isRecord, JsonObject, optionalArray, optionalNull, ProviderShared, mediaDataUrl } from "./shared"
import { OpenAIOptions } from "./utils/openai-options"
import { Lifecycle } from "./utils/lifecycle"
import { ToolStream } from "./utils/tool-stream"

const ADAPTER = "openai-chat"
export const DEFAULT_BASE_URL = "https://api.openai.com/v1"
export const PATH = "/chat/completions"

// =============================================================================
// Request Body Schema
// =============================================================================
// The body schema is the provider-native JSON body. `fromRequest` below builds
// this shape from the common `LLMRequest`, then `Route.make` validates and
// JSON-encodes it before transport.
const OpenAIChatFunction = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  parameters: JsonObject,
})

const OpenAIChatTool = Schema.Struct({
  type: Schema.tag("function"),
  function: OpenAIChatFunction,
})
type OpenAIChatTool = Schema.Schema.Type<typeof OpenAIChatTool>

const OpenAIChatAssistantToolCall = Schema.Struct({
  id: Schema.String,
  type: Schema.tag("function"),
  function: Schema.Struct({
    name: Schema.String,
    arguments: Schema.String,
  }),
})
type OpenAIChatAssistantToolCall = Schema.Schema.Type<typeof OpenAIChatAssistantToolCall>

// MiMo multimodal user content parts (OpenAI vision / audio spec)
const OpenAIChatImageUrlPart = Schema.Struct({
  type: Schema.tag("image_url"),
  image_url: Schema.Struct({ url: Schema.String }),
})
const OpenAIChatInputAudioPart = Schema.Struct({
  type: Schema.tag("input_audio"),
  // MiMo carries a data: URL (or http URL) in input_audio.data and has no
  // separate `format` field, unlike OpenAI's { data: <raw base64>, format }.
  input_audio: Schema.Struct({ data: Schema.String }),
})
const OpenAIChatVideoUrlPart = Schema.Struct({
  type: Schema.tag("video_url"),
  video_url: Schema.Struct({ url: Schema.String }),
  // fps + media_resolution are MiMo-specific siblings of `type` at the
  // content-part level (not nested inside video_url).
  fps: Schema.optional(Schema.Number),
  media_resolution: Schema.optional(Schema.Literals(["default", "max"])),
})
const OpenAIChatFilePart = Schema.Struct({
  type: Schema.tag("file"),
  file: Schema.Struct({ file_data: Schema.String }),
})
const OpenAIChatTextContentPart = Schema.Struct({ type: Schema.tag("text"), text: Schema.String })

const OpenAIChatUserContentPart = Schema.Union([
  OpenAIChatTextContentPart,
  OpenAIChatImageUrlPart,
  OpenAIChatInputAudioPart,
  OpenAIChatVideoUrlPart,
  OpenAIChatFilePart,
]).pipe(Schema.toTaggedUnion("type"))
type OpenAIChatUserContentPart = Schema.Schema.Type<typeof OpenAIChatUserContentPart>

const OpenAIChatUserContent = Schema.Union([Schema.String, Schema.Array(OpenAIChatUserContentPart)])

const OpenAIChatMessage = Schema.Union([
  Schema.Struct({ role: Schema.Literal("system"), content: Schema.String }),
  Schema.Struct({ role: Schema.Literal("user"), content: OpenAIChatUserContent }),
  Schema.Struct({
    role: Schema.Literal("assistant"),
    content: Schema.NullOr(Schema.String),
    tool_calls: optionalArray(OpenAIChatAssistantToolCall),
    reasoning_content: Schema.optional(Schema.String),
  }),
  Schema.Struct({ role: Schema.Literal("tool"), tool_call_id: Schema.String, content: Schema.String }),
]).pipe(Schema.toTaggedUnion("role"))
type OpenAIChatMessage = Schema.Schema.Type<typeof OpenAIChatMessage>

const OpenAIChatToolChoice = Schema.Union([
  Schema.Literals(["auto", "none", "required"]),
  Schema.Struct({
    type: Schema.tag("function"),
    function: Schema.Struct({ name: Schema.String }),
  }),
])

export const bodyFields = {
  model: Schema.String,
  messages: Schema.Array(OpenAIChatMessage),
  tools: optionalArray(OpenAIChatTool),
  tool_choice: Schema.optional(OpenAIChatToolChoice),
  stream: Schema.Literal(true),
  stream_options: Schema.optional(Schema.Struct({ include_usage: Schema.Boolean })),
  store: Schema.optional(Schema.Boolean),
  reasoning_effort: Schema.optional(OpenAIOptions.OpenAIReasoningEffort),
  max_tokens: Schema.optional(Schema.Number),
  temperature: Schema.optional(Schema.Number),
  top_p: Schema.optional(Schema.Number),
  frequency_penalty: Schema.optional(Schema.Number),
  presence_penalty: Schema.optional(Schema.Number),
  seed: Schema.optional(Schema.Number),
  stop: optionalArray(Schema.String),
}
const OpenAIChatBody = Schema.Struct(bodyFields)
export type OpenAIChatBody = Schema.Schema.Type<typeof OpenAIChatBody>

// =============================================================================
// Streaming Event Schema
// =============================================================================
// The event schema is one decoded SSE `data:` payload. `Framing.sse` splits the
// byte stream into strings, then `Protocol.jsonEvent` decodes each string into
// this provider-native event shape.
const OpenAIChatUsage = Schema.Struct({
  prompt_tokens: Schema.optional(Schema.Number),
  completion_tokens: Schema.optional(Schema.Number),
  total_tokens: Schema.optional(Schema.Number),
  prompt_tokens_details: optionalNull(
    Schema.Struct({
      cached_tokens: Schema.optional(Schema.Number),
      // MiMo multimodal usage breakdown (audio/video understanding inputs).
      audio_tokens: Schema.optional(Schema.Number),
      video_tokens: Schema.optional(Schema.Number),
    }),
  ),
  completion_tokens_details: optionalNull(
    Schema.Struct({
      reasoning_tokens: Schema.optional(Schema.Number),
    }),
  ),
})

const OpenAIChatToolCallDeltaFunction = Schema.Struct({
  name: optionalNull(Schema.String),
  arguments: optionalNull(Schema.String),
})

const OpenAIChatToolCallDelta = Schema.Struct({
  index: Schema.Number,
  id: optionalNull(Schema.String),
  function: optionalNull(OpenAIChatToolCallDeltaFunction),
})
type OpenAIChatToolCallDelta = Schema.Schema.Type<typeof OpenAIChatToolCallDelta>

const OpenAIChatDelta = Schema.Struct({
  content: optionalNull(Schema.String),
  reasoning_content: optionalNull(Schema.String),
  tool_calls: optionalNull(Schema.Array(OpenAIChatToolCallDelta)),
})

const OpenAIChatChoice = Schema.Struct({
  delta: optionalNull(OpenAIChatDelta),
  finish_reason: optionalNull(Schema.String),
})

const OpenAIChatEvent = Schema.Struct({
  choices: Schema.Array(OpenAIChatChoice),
  usage: optionalNull(OpenAIChatUsage),
})
type OpenAIChatEvent = Schema.Schema.Type<typeof OpenAIChatEvent>
type OpenAIChatRequestMessage = LLMRequest["messages"][number]

interface ParserState {
  readonly tools: ToolStream.State<number>
  readonly toolCallEvents: ReadonlyArray<LLMEvent>
  readonly usage?: Usage
  readonly finishReason?: FinishReason
  readonly lifecycle: Lifecycle.State
  // Accumulated reasoning_content across the stream — used by the
  // mimo-desktop tool-repair "reasoning scavenger" stage to recover tool calls
  // that the model emitted only in its thinking trace.
  readonly reasoningText: string
}

const invalid = ProviderShared.invalidRequest

// =============================================================================
// Request Lowering
// =============================================================================
// Lowering is the only place that knows how common LLM messages map onto the
// OpenAI Chat wire format. Keep provider quirks here instead of leaking native
// fields into `LLMRequest`.
const lowerTool = (tool: ToolDefinition): OpenAIChatTool => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  },
})

const lowerToolChoice = (toolChoice: NonNullable<LLMRequest["toolChoice"]>) =>
  ProviderShared.matchToolChoice("OpenAI Chat", toolChoice, {
    auto: () => "auto" as const,
    none: () => "none" as const,
    required: () => "required" as const,
    tool: (name) => ({ type: "function" as const, function: { name } }),
  })

const lowerToolCall = (part: ToolCallPart): OpenAIChatAssistantToolCall => ({
  id: part.id,
  type: "function",
  function: {
    name: part.name,
    arguments: ProviderShared.encodeJson(part.input),
  },
})

const openAICompatibleReasoningContent = (native: unknown) =>
  isRecord(native) && typeof native.reasoning_content === "string" ? native.reasoning_content : undefined

function lowerMediaPart(part: MediaPart): OpenAIChatUserContentPart {
  const mt = part.mediaType
  // OpenAI-compatible image_url / file_data require a full data URL
  // ("data:<mime>;base64,<b64>"), not a bare base64 string.
  if (mt.startsWith("image/")) {
    return { type: "image_url", image_url: { url: mediaDataUrl(part) } }
  }
  if (mt.startsWith("audio/")) {
    // MiMo expects a data: URL (or http URL) in input_audio.data and no
    // separate `format` field — see OpenAIChatInputAudioPart.
    return { type: "input_audio", input_audio: { data: mediaDataUrl(part) } }
  }
  if (mt.startsWith("video/")) {
    // MiMo video_url with sibling fps + media_resolution defaults.
    return { type: "video_url", video_url: { url: mediaDataUrl(part) }, fps: 2, media_resolution: "default" }
  }
  if (mt === "application/pdf") {
    return { type: "file", file: { file_data: mediaDataUrl(part) } }
  }
  // Fallback: treat as image_url for any other binary type
  return { type: "image_url", image_url: { url: mediaDataUrl(part) } }
}

const lowerUserMessage = Effect.fn("OpenAIChat.lowerUserMessage")(function* (message: OpenAIChatRequestMessage) {
  const hasMedia = message.content.some((p) => p.type === "media")
  if (!hasMedia) {
    const content: TextPart[] = []
    for (const part of message.content) {
      if (!ProviderShared.supportsContent(part, ["text"]))
        return yield* ProviderShared.unsupportedContent("OpenAI Chat", "user", ["text"])
      content.push(part)
    }
    return { role: "user" as const, content: ProviderShared.joinText(content) }
  }

  // Multimodal: build array content
  const parts: OpenAIChatUserContentPart[] = []
  for (const part of message.content) {
    if (part.type === "text") {
      parts.push({ type: "text", text: part.text })
    } else if (part.type === "media") {
      parts.push(lowerMediaPart(part as MediaPart))
    }
  }
  return { role: "user" as const, content: parts }
})

const lowerAssistantMessage = Effect.fn("OpenAIChat.lowerAssistantMessage")(function* (
  message: OpenAIChatRequestMessage,
) {
  const content: TextPart[] = []
  const toolCalls: OpenAIChatAssistantToolCall[] = []
  const reasoningContent = openAICompatibleReasoningContent(message.native?.openaiCompatible)
  for (const part of message.content) {
    if (part.type === "text") {
      content.push(part)
      continue
    }
    if (part.type === "tool-call") {
      toolCalls.push(lowerToolCall(part))
      continue
    }
    // Reasoning is output-only for OpenAI-compatible chat APIs: it is replayed
    // via the dedicated `reasoning_content` field below, never as assistant
    // content. Skip it (and any other non-text/non-tool-call part) instead of
    // failing the request — otherwise every multi-turn chat breaks as soon as a
    // prior assistant turn produced reasoning (which MiMo does by default).
    if (part.type === "reasoning") continue
    return yield* ProviderShared.unsupportedContent("OpenAI Chat", "assistant", ["text", "tool-call", "reasoning"])
  }
  const text = ProviderShared.joinText(content)
  const hasText = text.trim().length > 0
  const hasReasoningContent = reasoningContent !== undefined && reasoningContent.trim().length > 0
  if (!hasText && toolCalls.length === 0 && !hasReasoningContent) return undefined
  return {
    role: "assistant" as const,
    content: hasText ? text : null,
    ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
    ...(hasReasoningContent ? { reasoning_content: reasoningContent } : {}),
  }
})

const lowerToolMessages = Effect.fn("OpenAIChat.lowerToolMessages")(function* (message: OpenAIChatRequestMessage) {
  const messages: OpenAIChatMessage[] = []
  for (const part of message.content) {
    if (!ProviderShared.supportsContent(part, ["tool-result"]))
      return yield* ProviderShared.unsupportedContent("OpenAI Chat", "tool", ["tool-result"])
    messages.push({ role: "tool", tool_call_id: part.id, content: ProviderShared.toolResultText(part) })
  }
  return messages
})

const lowerMessage = Effect.fn("OpenAIChat.lowerMessage")(function* (message: OpenAIChatRequestMessage) {
  if (message.role === "user") return [yield* lowerUserMessage(message)]
  if (message.role === "assistant") {
    const assistant = yield* lowerAssistantMessage(message)
    return assistant ? [assistant] : []
  }
  return yield* lowerToolMessages(message)
})

const lowerMessages = Effect.fn("OpenAIChat.lowerMessages")(function* (request: LLMRequest) {
  const system: OpenAIChatMessage[] =
    request.system.length === 0 ? [] : [{ role: "system", content: ProviderShared.joinText(request.system) }]
  return [...system, ...Arr.flatten(yield* Effect.forEach(request.messages, lowerMessage))]
})

const lowerOptions = Effect.fn("OpenAIChat.lowerOptions")(function* (request: LLMRequest) {
  const store = OpenAIOptions.store(request)
  const reasoningEffort = OpenAIOptions.reasoningEffort(request)
  if (reasoningEffort && !OpenAIOptions.isReasoningEffort(reasoningEffort))
    return yield* invalid(`OpenAI Chat does not support reasoning effort ${reasoningEffort}`)
  return {
    ...(store !== undefined ? { store } : {}),
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  }
})

const fromRequest = Effect.fn("OpenAIChat.fromRequest")(function* (request: LLMRequest) {
  // `fromRequest` returns the provider body only. Endpoint, auth, framing,
  // validation, and HTTP execution are composed by `Route.make`.
  const generation = request.generation
  return {
    model: request.model.id,
    messages: yield* lowerMessages(request),
    tools: request.tools.length === 0 ? undefined : request.tools.map(lowerTool),
    tool_choice: request.toolChoice ? yield* lowerToolChoice(request.toolChoice) : undefined,
    stream: true as const,
    stream_options: { include_usage: true },
    max_tokens: generation?.maxTokens,
    temperature: generation?.temperature,
    top_p: generation?.topP,
    frequency_penalty: generation?.frequencyPenalty,
    presence_penalty: generation?.presencePenalty,
    seed: generation?.seed,
    stop: generation?.stop,
    ...(yield* lowerOptions(request)),
  }
})

// =============================================================================
// Stream Parsing
// =============================================================================
// Streaming parsers are small state machines: every event returns a new state
// plus the common `LLMEvent`s produced by that event. Tool calls are accumulated
// because OpenAI streams JSON arguments across multiple deltas.
const mapFinishReason = (reason: string | null | undefined): FinishReason => {
  if (reason === "stop") return "stop"
  if (reason === "length") return "length"
  if (reason === "content_filter") return "content-filter"
  if (reason === "function_call" || reason === "tool_calls") return "tool-calls"
  return "unknown"
}

// OpenAI Chat reports `prompt_tokens` (inclusive total) with a
// `cached_tokens` subset, and `completion_tokens` (inclusive total) with
// a `reasoning_tokens` subset. We pass the inclusive totals through and
// derive the non-cached breakdown so the `LLM.Usage` contract is
// satisfied on both sides.
const mapUsage = (usage: OpenAIChatEvent["usage"]): Usage | undefined => {
  if (!usage) return undefined
  const cached = usage.prompt_tokens_details?.cached_tokens
  const reasoning = usage.completion_tokens_details?.reasoning_tokens
  const nonCached = ProviderShared.subtractTokens(usage.prompt_tokens, cached)
  return new Usage({
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    nonCachedInputTokens: nonCached,
    cacheReadInputTokens: cached,
    reasoningTokens: reasoning,
    totalTokens: ProviderShared.totalTokens(usage.prompt_tokens, usage.completion_tokens, usage.total_tokens),
    providerMetadata: { openai: usage },
  })
}

const step = (state: ParserState, event: OpenAIChatEvent) =>
  Effect.gen(function* () {
    const events: LLMEvent[] = []
    const usage = mapUsage(event.usage) ?? state.usage
    const choice = event.choices[0]
    const finishReason = choice?.finish_reason ? mapFinishReason(choice.finish_reason) : state.finishReason
    const delta = choice?.delta
    const toolDeltas = delta?.tool_calls ?? []
    let tools = state.tools

    let lifecycle = state.lifecycle
    let reasoningText = state.reasoningText

    if (delta?.reasoning_content) {
      lifecycle = Lifecycle.reasoningDelta(lifecycle, events, "reasoning-0", delta.reasoning_content)
      reasoningText += delta.reasoning_content
    }

    if (delta?.content) lifecycle = Lifecycle.textDelta(lifecycle, events, "text-0", delta.content)

    for (const tool of toolDeltas) {
      const result = ToolStream.appendOrStart(
        ADAPTER,
        tools,
        tool.index,
        { id: tool.id ?? undefined, name: tool.function?.name ?? undefined, text: tool.function?.arguments ?? "" },
        "OpenAI Chat tool call delta is missing id or name",
      )
      if (ToolStream.isError(result)) return yield* result
      tools = result.tools
      if (result.events.length) lifecycle = Lifecycle.stepStart(lifecycle, events)
      events.push(...result.events)
    }

    // Finalize accumulated tool inputs eagerly when finish_reason arrives so
    // JSON parse failures fail the stream at the boundary rather than at halt.
    const finished =
      finishReason !== undefined && state.finishReason === undefined && Object.keys(tools).length > 0
        ? yield* ToolStream.finishAll(ADAPTER, tools)
        : undefined

    return [
      {
        tools: finished?.tools ?? tools,
        toolCallEvents: finished?.events ?? state.toolCallEvents,
        usage,
        finishReason,
        lifecycle,
        reasoningText,
      },
      events,
    ] as const
  })

// Tool-repair stage 2: reasoning scavenger.
// When MiMo answers in its thinking trace instead of emitting a structured
// tool_call (a frequent failure mode in deep reasoning), look for tool-call
// shaped JSON inside reasoning_content and synthesize ToolCallParts before
// the stream finishes. Patterns recognised: `<tool_call>{...}</tool_call>`
// and fenced ```json{ "name": "...", "arguments": {...} } ``` blocks.
const TOOL_CALL_PATTERNS = [
  /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g,
  /```(?:json)?\n(\{[\s\S]*?"(?:name|function)"\s*:\s*"[^"]+"\s*,[\s\S]*?\})\n```/g,
]

function scavengeToolCalls(reasoning: string): Array<{ name: string; arguments: Record<string, unknown> }> {
  const found: Array<{ name: string; arguments: Record<string, unknown> }> = []
  const seen = new Set<string>()
  for (const pattern of TOOL_CALL_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of reasoning.matchAll(pattern)) {
      try {
        const parsed = JSON.parse(match[1]) as Record<string, unknown>
        const name = parsed.name ?? parsed.function
        const args = parsed.arguments ?? parsed.args ?? parsed.parameters ?? {}
        if (typeof name !== "string" || !name) continue
        const dedup = `${name}:${JSON.stringify(args)}`
        if (seen.has(dedup)) continue
        seen.add(dedup)
        found.push({ name, arguments: typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {} })
      } catch {
        // ignore unparseable matches
      }
    }
  }
  return found
}

const finishEvents = (state: ParserState): ReadonlyArray<LLMEvent> => {
  const events: LLMEvent[] = []
  let toolCallEvents = state.toolCallEvents
  let hasToolCalls = toolCallEvents.length > 0

  // Scavenge tool calls from reasoning text when the model "forgot" to emit
  // them through the structured channel. Only run when:
  //   - finish_reason === "stop" (not "tool_calls"), AND
  //   - no structured tool calls were emitted, AND
  //   - reasoning text is non-empty.
  if (state.finishReason === "stop" && !hasToolCalls && state.reasoningText.length > 0) {
    const scavenged = scavengeToolCalls(state.reasoningText)
    if (scavenged.length > 0) {
      const synthetic: LLMEvent[] = []
      for (let i = 0; i < scavenged.length; i++) {
        const call = scavenged[i]
        const id = `scavenged-${i}-${Date.now()}`
        synthetic.push({
          type: "tool-call",
          id,
          name: call.name,
          input: call.arguments,
          providerMetadata: { scavenged: true } as any,
        })
      }
      toolCallEvents = synthetic
      hasToolCalls = true
    }
  }

  // Always emit a finish at stream end. A well-behaved server sends a
  // finish_reason, but some MiMo / OpenAI-compatible endpoints (and proxy or
  // mid-stream cutoffs) close the SSE without one. If we skipped the finish when
  // finishReason was absent, the processor never set assistantMessage.finish,
  // the prompt loop never exited, and the session stayed "busy" (思考中) forever
  // even though the reply text had already been streamed and persisted. Default
  // the reason when the server omitted it (this onHalt runs only on normal
  // stream end — transport errors take the catchCause path instead).
  const resolved = state.finishReason ?? (hasToolCalls ? "tool-calls" : "stop")
  const reason = resolved === "stop" && hasToolCalls ? "tool-calls" : resolved
  const lifecycle = toolCallEvents.length ? Lifecycle.stepStart(state.lifecycle, events) : state.lifecycle
  events.push(...toolCallEvents)
  Lifecycle.finish(lifecycle, events, { reason, usage: state.usage })
  return events
}

// =============================================================================
// Protocol And OpenAI Route
// =============================================================================
/**
 * The OpenAI Chat protocol — request body construction, body schema, and the
 * streaming-event state machine. Reused by every route that speaks OpenAI Chat
 * over HTTP+SSE: native OpenAI, DeepSeek, TogetherAI, Cerebras, Baseten,
 * Fireworks, DeepInfra, and (once added) Azure OpenAI Chat.
 */
export const protocol = Protocol.make({
  id: ADAPTER,
  body: {
    schema: OpenAIChatBody,
    from: fromRequest,
  },
  stream: {
    event: Protocol.jsonEvent(OpenAIChatEvent),
    initial: () => ({
      tools: ToolStream.empty<number>(),
      toolCallEvents: [],
      lifecycle: Lifecycle.initial(),
      reasoningText: "",
    }),
    step,
    onHalt: finishEvents,
  },
})

export const httpTransport = HttpTransport.sseJson.with<OpenAIChatBody>()

export const route = Route.make({
  id: ADAPTER,
  provider: "openai",
  protocol,
  endpoint: Endpoint.path(PATH, { baseURL: DEFAULT_BASE_URL }),
  auth: Auth.none,
  transport: httpTransport,
})

export * as OpenAIChat from "./openai-chat"
