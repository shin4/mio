import { describe, expect } from "bun:test"
import { Effect, Schema, Stream } from "effect"
import { HttpClientRequest } from "effect/unstable/http"
import { LLM, LLMError, Message, Model, ToolCallPart, Usage } from "../../src"
import * as OpenAIChat from "../../src/protocols/openai-chat"
import { Auth, LLMClient } from "../../src/route"
import { it } from "../lib/effect"
import { dynamicResponse, fixedResponse, truncatedStream } from "../lib/http"
import { deltaChunk, usageChunk } from "../lib/openai-chunks"
import { sseEvents } from "../lib/sse"

const TargetJson = Schema.fromJsonString(Schema.Unknown)
const encodeJson = Schema.encodeSync(TargetJson)
const decodeJson = Schema.decodeUnknownSync(TargetJson)

const model = OpenAIChat.route
  .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
  .model({ id: "gpt-4o-mini" })

const request = LLM.request({
  id: "req_1",
  model,
  system: "You are concise.",
  prompt: "Say hello.",
  generation: { maxTokens: 20, temperature: 0 },
})

describe("OpenAI Chat route", () => {
  it.effect("prepares OpenAI Chat payload", () =>
    Effect.gen(function* () {
      // Pass the OpenAIChat payload type so `prepared.body` is statically
      // typed to the route's native shape — the assertions below read field
      // names without `unknown` casts.
      const prepared = yield* LLMClient.prepare<OpenAIChat.OpenAIChatBody>(request)
      const _typed: { readonly model: string; readonly stream: true } = prepared.body

      expect(prepared.body).toEqual({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are concise." },
          { role: "user", content: "Say hello." },
        ],
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 20,
        temperature: 0,
      })
    }),
  )

  it.effect("adds native query params to the Chat Completions URL", () =>
    LLMClient.generate(
      LLM.updateRequest(request, {
        model: Model.update(model, { route: model.route.with({ endpoint: { query: { "api-version": "v1" } } }) }),
      }),
    ).pipe(
      Effect.provide(
        dynamicResponse((input) =>
          Effect.gen(function* () {
            const web = yield* HttpClientRequest.toWeb(input.request).pipe(Effect.orDie)
            expect(web.url).toBe("https://api.openai.test/v1/chat/completions?api-version=v1")
            return input.respond(sseEvents(deltaChunk({}, "stop")), {
              headers: { "content-type": "text/event-stream" },
            })
          }),
        ),
      ),
    ),
  )

  it.effect("applies serializable HTTP overlays after payload lowering", () =>
    LLMClient.generate(
      LLM.updateRequest(request, {
        model: model.route
          .with({ auth: Auth.bearer("fresh-key"), headers: { authorization: "Bearer stale" } })
          .model({ id: model.id }),
        http: {
          body: { metadata: { source: "test" } },
          headers: { authorization: "Bearer request", "x-custom": "yes" },
          query: { debug: "1" },
        },
      }),
    ).pipe(
      Effect.provide(
        dynamicResponse((input) =>
          Effect.gen(function* () {
            const web = yield* HttpClientRequest.toWeb(input.request).pipe(Effect.orDie)
            expect(web.url).toBe("https://api.openai.test/v1/chat/completions?debug=1")
            expect(web.headers.get("authorization")).toBe("Bearer fresh-key")
            expect(web.headers.get("x-custom")).toBe("yes")
            expect(decodeJson(input.text)).toMatchObject({
              stream: true,
              stream_options: { include_usage: true },
              metadata: { source: "test" },
            })
            return input.respond(sseEvents(deltaChunk({}, "stop")), {
              headers: { "content-type": "text/event-stream" },
            })
          }),
        ),
      ),
    ),
  )

  it.effect("prepares assistant tool-call and tool-result messages", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          id: "req_tool_result",
          model,
          messages: [
            Message.user("What is the weather?"),
            Message.assistant([ToolCallPart.make({ id: "call_1", name: "lookup", input: { query: "weather" } })]),
            Message.tool({ id: "call_1", name: "lookup", result: { forecast: "sunny" } }),
          ],
        }),
      )

      expect(prepared.body).toEqual({
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: "What is the weather?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "lookup", arguments: encodeJson({ query: "weather" }) },
              },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: encodeJson({ forecast: "sunny" }) },
        ],
        stream: true,
        stream_options: { include_usage: true },
      })
    }),
  )

  it.effect("drops assistant messages that become empty after lowering", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare<OpenAIChat.OpenAIChatBody>(
        LLM.request({
          id: "req_empty_assistant",
          model,
          messages: [
            Message.user("First question"),
            Message.assistant([
              { type: "reasoning", text: "private reasoning only" },
              { type: "text", text: "  " },
            ]),
            Message.user("Follow-up"),
          ],
        }),
      )

      expect(prepared.body.messages).toEqual([
        { role: "user", content: "First question" },
        { role: "user", content: "Follow-up" },
      ])
    }),
  )

  it.effect("keeps tool-call-only assistant messages", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare<OpenAIChat.OpenAIChatBody>(
        LLM.request({
          id: "req_tool_only_assistant",
          model,
          messages: [
            Message.user("Use a tool"),
            Message.assistant([ToolCallPart.make({ id: "call_2", name: "lookup", input: { query: "status" } })]),
          ],
        }),
      )

      expect(prepared.body.messages).toEqual([
        { role: "user", content: "Use a tool" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_2",
              type: "function",
              function: { name: "lookup", arguments: encodeJson({ query: "status" }) },
            },
          ],
        },
      ])
    }),
  )

  it.effect("keeps assistant messages with native OpenAI-compatible reasoning content", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare<OpenAIChat.OpenAIChatBody>(
        LLM.request({
          id: "req_native_reasoning_assistant",
          model,
          messages: [
            Message.user("Think"),
            Message.make({
              role: "assistant",
              content: [{ type: "reasoning", text: "local reasoning" }],
              native: { openaiCompatible: { reasoning_content: "provider reasoning" } },
            }),
          ],
        }),
      )

      expect(prepared.body.messages).toEqual([
        { role: "user", content: "Think" },
        { role: "assistant", content: null, reasoning_content: "provider reasoning" },
      ])
    }),
  )

  it.effect("lowers user image media to an image_url content part", () =>
    Effect.gen(function* () {
      // Multimodal: image/video/pdf user media is supported (G3). An image is
      // lowered to an OpenAI `image_url` content part carrying a data URL.
      const prepared = yield* LLMClient.prepare<OpenAIChat.OpenAIChatBody>(
        LLM.request({
          id: "req_media",
          model,
          messages: [Message.user({ type: "media", mediaType: "image/png", data: "AAECAw==" })],
        }),
      )

      const user = prepared.body.messages.find((m) => m.role === "user")
      expect(Array.isArray(user?.content)).toBe(true)
      const parts = user?.content as Array<{ type: string; image_url?: { url: string } }>
      const image = parts.find((p) => p.type === "image_url")
      expect(image?.image_url?.url).toBe("data:image/png;base64,AAECAw==")
    }),
  )

  it.effect("lowers user pdf media to a file content part", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare<OpenAIChat.OpenAIChatBody>(
        LLM.request({
          id: "req_pdf",
          model,
          messages: [Message.user({ type: "media", mediaType: "application/pdf", data: "JVBERi0=" })],
        }),
      )

      const user = prepared.body.messages.find((m) => m.role === "user")
      const parts = user?.content as Array<{ type: string; file?: { file_data: string } }>
      const file = parts.find((p) => p.type === "file")
      expect(file?.file?.file_data).toBe("data:application/pdf;base64,JVBERi0=")
    }),
  )

  it.effect("lowers user audio media to a MiMo input_audio content part (data URL, no format)", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare<OpenAIChat.OpenAIChatBody>(
        LLM.request({
          id: "req_audio",
          model,
          messages: [Message.user({ type: "media", mediaType: "audio/mpeg", data: "AAECAw==" })],
        }),
      )

      const user = prepared.body.messages.find((m) => m.role === "user")
      const parts = user?.content as Array<{ type: string; input_audio?: { data: string; format?: string } }>
      const audio = parts.find((p) => p.type === "input_audio")
      expect(audio?.input_audio?.data).toBe("data:audio/mpeg;base64,AAECAw==")
      // MiMo's input_audio has no `format` field (unlike OpenAI's schema).
      expect(audio?.input_audio && "format" in audio.input_audio).toBe(false)
    }),
  )

  it.effect("lowers user video media to a MiMo video_url content part with fps + media_resolution", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare<OpenAIChat.OpenAIChatBody>(
        LLM.request({
          id: "req_video",
          model,
          messages: [Message.user({ type: "media", mediaType: "video/mp4", data: "AAECAw==" })],
        }),
      )

      const user = prepared.body.messages.find((m) => m.role === "user")
      const parts = user?.content as Array<{
        type: string
        video_url?: { url: string }
        fps?: number
        media_resolution?: string
      }>
      const video = parts.find((p) => p.type === "video_url")
      expect(video?.video_url?.url).toBe("data:video/mp4;base64,AAECAw==")
      expect(video?.fps).toBe(2)
      expect(video?.media_resolution).toBe("default")
    }),
  )

  it.effect("drops assistant reasoning content so multi-turn chats survive", () =>
    Effect.gen(function* () {
      // Regression: MiMo emits reasoning parts on every turn. Replaying a prior
      // assistant turn that contains reasoning must NOT fail the request — the
      // reasoning is output-only and is skipped when lowering to OpenAI Chat.
      const prepared = yield* LLMClient.prepare<OpenAIChat.OpenAIChatBody>(
        LLM.request({
          id: "req_reasoning",
          model,
          messages: [
            Message.user("What is 2+2?"),
            Message.assistant([
              { type: "reasoning", text: "The user wants the sum of 2 and 2." },
              { type: "text", text: "4." },
            ]),
            Message.user("And 3+3?"),
          ],
        }),
      )

      const assistant = prepared.body.messages.find((m) => m.role === "assistant")
      expect(assistant?.content).toBe("4.")
      expect(assistant?.tool_calls).toBeUndefined()
      // No reasoning text leaks into the wire payload as content.
      expect(JSON.stringify(prepared.body.messages)).not.toContain("sum of 2 and 2")
    }),
  )

  it.effect("parses text and usage stream fixtures", () =>
    Effect.gen(function* () {
      const body = sseEvents(
        deltaChunk({ role: "assistant", content: "Hello" }),
        deltaChunk({ content: "!" }),
        deltaChunk({}, "stop"),
        usageChunk({
          prompt_tokens: 5,
          completion_tokens: 2,
          total_tokens: 7,
          prompt_tokens_details: { cached_tokens: 1 },
          completion_tokens_details: { reasoning_tokens: 0 },
        }),
      )
      const response = yield* LLMClient.generate(request).pipe(Effect.provide(fixedResponse(body)))
      const usage = new Usage({
        inputTokens: 5,
        outputTokens: 2,
        nonCachedInputTokens: 4,
        cacheReadInputTokens: 1,
        reasoningTokens: 0,
        totalTokens: 7,
        providerMetadata: {
          openai: {
            prompt_tokens: 5,
            completion_tokens: 2,
            total_tokens: 7,
            prompt_tokens_details: { cached_tokens: 1 },
            completion_tokens_details: { reasoning_tokens: 0 },
          },
        },
      })

      expect(response.text).toBe("Hello!")
      expect(response.events).toEqual([
        { type: "step-start", index: 0 },
        { type: "text-start", id: "text-0" },
        { type: "text-delta", id: "text-0", text: "Hello" },
        { type: "text-delta", id: "text-0", text: "!" },
        { type: "text-end", id: "text-0" },
        { type: "step-finish", index: 0, reason: "stop", usage, providerMetadata: undefined },
        {
          type: "finish",
          reason: "stop",
          usage,
        },
      ])
    }),
  )

  it.effect("parses OpenAI-compatible reasoning content deltas", () =>
    Effect.gen(function* () {
      const body = sseEvents(
        { choices: [{ delta: { reasoning_content: "thinking" } }] },
        { choices: [{ delta: { content: "Hello" } }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      )

      const response = yield* LLMClient.generate(request).pipe(Effect.provide(fixedResponse(body)))

      expect(response.reasoning).toBe("thinking")
      expect(response.text).toBe("Hello")
      expect(response.events).toMatchObject([
        { type: "step-start", index: 0 },
        { type: "reasoning-start", id: "reasoning-0" },
        { type: "reasoning-delta", id: "reasoning-0", text: "thinking" },
        { type: "text-start", id: "text-0" },
        { type: "text-delta", id: "text-0", text: "Hello" },
        { type: "reasoning-end", id: "reasoning-0" },
        { type: "text-end", id: "text-0" },
        { type: "step-finish", index: 0, reason: "stop" },
        { type: "finish", reason: "stop" },
      ])
    }),
  )

  it.effect("assembles streamed tool call input", () =>
    Effect.gen(function* () {
      const body = sseEvents(
        deltaChunk({
          role: "assistant",
          tool_calls: [{ index: 0, id: "call_1", function: { name: "lookup", arguments: '{"query"' } }],
        }),
        deltaChunk({ tool_calls: [{ index: 0, function: { arguments: ':"weather"}' } }] }),
        deltaChunk({}, "tool_calls"),
      )
      const response = yield* LLMClient.generate(
        LLM.updateRequest(request, {
          tools: [{ name: "lookup", description: "Lookup data", inputSchema: { type: "object" } }],
        }),
      ).pipe(Effect.provide(fixedResponse(body)))

      expect(response.events).toEqual([
        { type: "step-start", index: 0 },
        { type: "tool-input-start", id: "call_1", name: "lookup", providerMetadata: undefined },
        { type: "tool-input-delta", id: "call_1", name: "lookup", text: '{"query"' },
        { type: "tool-input-delta", id: "call_1", name: "lookup", text: ':"weather"}' },
        { type: "tool-input-end", id: "call_1", name: "lookup", providerMetadata: undefined },
        {
          type: "tool-call",
          id: "call_1",
          name: "lookup",
          input: { query: "weather" },
          providerExecuted: undefined,
          providerMetadata: undefined,
        },
        { type: "step-finish", index: 0, reason: "tool-calls", usage: undefined, providerMetadata: undefined },
        { type: "finish", reason: "tool-calls", usage: undefined },
      ])
    }),
  )

  it.effect("finalizes a streamed text reply even when the server omits a finish reason", () =>
    Effect.gen(function* () {
      // The user-facing bug: some MiMo / OpenAI-compatible endpoints (and proxy
      // or mid-stream cutoffs) close the SSE stream without a terminal
      // finish_reason. Previously no finish was emitted, so the processor never
      // set the assistant message's finish, the prompt loop never exited, and
      // the session hung "busy" (思考中) forever even though the reply text was
      // already streamed. The stream must now always finalize.
      const body = sseEvents(deltaChunk({ role: "assistant", content: "Hello there" }))
      const response = yield* LLMClient.generate(request).pipe(Effect.provide(fixedResponse(body)))

      const finish = response.events.find((event) => event.type === "finish")
      expect(finish).toEqual({ type: "finish", reason: "stop", usage: undefined })
    }),
  )

  it.effect("still finalizes when a tool-call stream is cut before its finish reason (no hang)", () =>
    Effect.gen(function* () {
      // A tool-call stream cut before the finish_reason chunk: ToolStream never
      // committed the call, so it is not finalized — but the stream must still
      // emit a finish so the session does not hang. (Graceful degradation: the
      // turn completes with "stop" rather than spinning forever.)
      const body = sseEvents(
        deltaChunk({
          role: "assistant",
          tool_calls: [{ index: 0, id: "call_1", function: { name: "lookup", arguments: '{"query"' } }],
        }),
        deltaChunk({ tool_calls: [{ index: 0, function: { arguments: ':"weather"}' } }] }),
      )
      const response = yield* LLMClient.generate(
        LLM.updateRequest(request, {
          tools: [{ name: "lookup", description: "Lookup data", inputSchema: { type: "object" } }],
        }),
      ).pipe(Effect.provide(fixedResponse(body)))

      const finish = response.events.find((event) => event.type === "finish")
      expect(finish).toEqual({ type: "finish", reason: "stop", usage: undefined })
    }),
  )

  it.effect("fails on malformed stream events", () =>
    Effect.gen(function* () {
      const body = sseEvents(deltaChunk({ content: 123 }))
      const error = yield* LLMClient.generate(request).pipe(Effect.provide(fixedResponse(body)), Effect.flip)

      expect(error.message).toContain("Invalid openai/openai-chat stream event")
    }),
  )

  it.effect("surfaces transport errors that occur mid-stream", () =>
    Effect.gen(function* () {
      const layer = truncatedStream([
        `data: ${JSON.stringify(deltaChunk({ role: "assistant", content: "Hello" }))}\n\n`,
      ])
      const error = yield* LLMClient.generate(request).pipe(Effect.provide(layer), Effect.flip)

      expect(error.message).toContain("Failed to read openai/openai-chat stream")
    }),
  )

  it.effect("fails HTTP provider errors before stream parsing", () =>
    Effect.gen(function* () {
      const error = yield* LLMClient.generate(request).pipe(
        Effect.provide(
          fixedResponse('{"error":{"message":"Bad request","type":"invalid_request_error"}}', {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
        ),
        Effect.flip,
      )

      expect(error).toBeInstanceOf(LLMError)
      expect(error.reason).toMatchObject({ _tag: "InvalidRequest" })
      expect(error.message).toContain("HTTP 400")
    }),
  )

  it.effect("short-circuits the upstream stream when the consumer takes a prefix", () =>
    Effect.gen(function* () {
      // The body has more chunks than we'll consume. If `Stream.take(1)` did
      // not interrupt the upstream HTTP body the test would hang waiting for
      // the rest of the stream to drain.
      const body = sseEvents(
        deltaChunk({ role: "assistant", content: "Hello" }),
        deltaChunk({ content: " world" }),
        deltaChunk({}, "stop"),
      )

      const events = Array.from(
        yield* LLMClient.stream(request).pipe(Stream.take(1), Stream.runCollect, Effect.provide(fixedResponse(body))),
      )
      expect(events.map((event) => event.type)).toEqual(["step-start"])
    }),
  )
})
