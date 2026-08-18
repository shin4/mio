import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import path from "path"
import { tool, type ModelMessage } from "ai"
import { Effect, Layer, Stream } from "effect"
import { InstanceRef } from "../../src/effect/instance-ref"
import { LLM } from "../../src/session/llm"
import { LLMClient, RequestExecutor, WebSocketExecutor } from "@opencode-ai/llm/route"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { Plugin } from "@/plugin"
import { testEffect } from "../lib/effect"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import { LLMAISDK } from "@/session/llm/ai-sdk"
import { Session as SessionNs } from "@/session/session"

type ConfigModel = NonNullable<NonNullable<Config.Info["provider"]>[string]["models"]>[string]

const openAIConfig = (model: ModelsDev.Provider["models"][string], baseURL: string): Partial<Config.Info> => {
  const { experimental: _experimental, ...configModel } = model
  return {
    enabled_providers: ["openai"],
    provider: {
      openai: {
        name: "OpenAI",
        env: ["OPENAI_API_KEY"],
        npm: "@ai-sdk/openai",
        api: "https://api.openai.com/v1",
        models: {
          [model.id]: JSON.parse(JSON.stringify(configModel)) as ConfigModel,
        },
        options: {
          apiKey: "test-openai-key",
          baseURL,
        },
      },
    },
  }
}

const it = testEffect(Layer.mergeAll(LLM.defaultLayer, Provider.defaultLayer))

// LLM.stream returns a Stream, not an Effect, so we can't use the serviceUse proxy.
const drain = (input: LLM.StreamInput) => LLM.Service.use((svc) => svc.stream(input).pipe(Stream.runDrain))

// drainWith builds an isolated runtime so the custom layer fully owns LLM and
// its transitive deps — `Effect.provide(layer)` over an existing runtime layers
// the new services on top, but transitive Service overrides (e.g. RequestExecutor)
// resolved through the outer LLM.defaultLayer leak through.
const drainWith = (layer: Layer.Layer<LLM.Service>, input: LLM.StreamInput) =>
  Effect.gen(function* () {
    const ctx = yield* InstanceRef
    if (!ctx) return yield* Effect.die("InstanceRef not provided")
    return yield* Effect.promise(() =>
      Effect.runPromise(
        LLM.Service.use((svc) => svc.stream(input).pipe(Stream.runDrain)).pipe(
          Effect.provide(layer),
          Effect.provideService(InstanceRef, ctx),
        ),
      ),
    )
  })

function llmLayerWithExecutor(executor: Layer.Layer<RequestExecutor.Service>, flags: Partial<RuntimeFlags.Info> = {}) {
  return LLM.layer.pipe(
    Layer.provide(Auth.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Provider.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(LLMClient.layer.pipe(Layer.provide(Layer.mergeAll(executor, WebSocketExecutor.layer)))),
    Layer.provide(RuntimeFlags.layer(flags)),
  )
}

describe("session.llm.hasToolCalls", () => {
  test("returns false for empty messages array", () => {
    expect(LLM.hasToolCalls([])).toBe(false)
  })

  test("returns false for messages with only text content", () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Hi there" }],
      },
    ]
    expect(LLM.hasToolCalls(messages)).toBe(false)
  })

  test("returns true when messages contain tool-call", () => {
    const messages = [
      {
        role: "user",
        content: [{ type: "text", text: "Run a command" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-123",
            toolName: "bash",
          },
        ],
      },
    ] as ModelMessage[]
    expect(LLM.hasToolCalls(messages)).toBe(true)
  })

  test("returns true when messages contain tool-result", () => {
    const messages = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-123",
            toolName: "bash",
          },
        ],
      },
    ] as ModelMessage[]
    expect(LLM.hasToolCalls(messages)).toBe(true)
  })

  test("returns false for messages with string content", () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: "Hello world",
      },
      {
        role: "assistant",
        content: "Hi there",
      },
    ]
    expect(LLM.hasToolCalls(messages)).toBe(false)
  })

  test("returns true when tool-call is mixed with text content", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me run that command" },
          {
            type: "tool-call",
            toolCallId: "call-456",
            toolName: "read",
          },
        ],
      },
    ] as ModelMessage[]
    expect(LLM.hasToolCalls(messages)).toBe(true)
  })
})

describe("session.llm.ai-sdk adapter", () => {
  type AISDKAdapterEvent = Parameters<typeof LLMAISDK.toLLMEvents>[1]

  const adapt = (events: ReadonlyArray<AISDKAdapterEvent>) => {
    const state = LLMAISDK.adapterState()
    return Effect.runPromise(
      Effect.forEach(events, (event) => LLMAISDK.toLLMEvents(state, event)).pipe(Effect.map((items) => items.flat())),
    )
  }
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- tests defensive adapter branches outside AI SDK's current typed surface
  const uncheckedAdapterEvent = (input: unknown) => input as AISDKAdapterEvent

  test("maps AI SDK stream chunks without losing session-visible fields", async () => {
    const metadata = { openai: { itemID: "item-1" } }
    const events = await adapt([
      { type: "start" },
      { type: "start-step", request: {}, warnings: [] },
      { type: "text-start", id: "text-1", providerMetadata: metadata },
      { type: "text-delta", id: "text-1", text: "Hel", providerMetadata: { openai: { delta: 1 } } },
      { type: "text-delta", id: "text-1", text: "lo", providerMetadata: { openai: { delta: 2 } } },
      { type: "text-end", id: "text-1", providerMetadata: { openai: { done: true } } },
      { type: "reasoning-start", id: "reasoning-1", providerMetadata: metadata },
      { type: "reasoning-delta", id: "reasoning-1", text: "Think", providerMetadata: { openai: { delta: 3 } } },
      { type: "reasoning-end", id: "reasoning-1", providerMetadata: { openai: { done: true } } },
      { type: "tool-input-start", id: "call-1", toolName: "lookup", providerMetadata: metadata },
      { type: "tool-input-delta", id: "call-1", delta: '{"query":' },
      { type: "tool-input-delta", id: "call-1", delta: '"weather"}' },
      { type: "tool-input-end", id: "call-1", providerMetadata: { openai: { inputDone: true } } },
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "lookup",
        input: { query: "weather" },
        providerExecuted: true,
        providerMetadata: { openai: { called: true } },
      },
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "lookup",
        input: { query: "weather" },
        output: { title: "Lookup", output: "sunny", metadata: { ok: true } },
        providerExecuted: true,
        providerMetadata: { openai: { result: true } },
      },
      {
        type: "finish-step",
        response: { id: "response-1", timestamp: new Date(0), modelId: "gpt-test" },
        finishReason: "other",
        rawFinishReason: "other",
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          inputTokenDetails: { noCacheTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 2 },
          outputTokenDetails: { textTokens: 4, reasoningTokens: 1 },
        },
        providerMetadata: { openai: { step: true } },
      },
      {
        type: "finish",
        finishReason: "other",
        rawFinishReason: "other",
        totalUsage: {
          inputTokens: 11,
          outputTokens: 6,
          totalTokens: 17,
          cachedInputTokens: 4,
          reasoningTokens: 2,
          inputTokenDetails: { noCacheTokens: 7, cacheReadTokens: 4, cacheWriteTokens: undefined },
          outputTokenDetails: { textTokens: 4, reasoningTokens: 2 },
        },
      },
    ])

    expect(events).toMatchObject([
      { type: "step-start", index: 0 },
      { type: "text-start", id: "text-1", providerMetadata: metadata },
      { type: "text-delta", id: "text-1", text: "Hel", providerMetadata: { openai: { delta: 1 } } },
      { type: "text-delta", id: "text-1", text: "lo", providerMetadata: { openai: { delta: 2 } } },
      { type: "text-end", id: "text-1", providerMetadata: { openai: { done: true } } },
      { type: "reasoning-start", id: "reasoning-1", providerMetadata: metadata },
      { type: "reasoning-delta", id: "reasoning-1", text: "Think", providerMetadata: { openai: { delta: 3 } } },
      { type: "reasoning-end", id: "reasoning-1", providerMetadata: { openai: { done: true } } },
      { type: "tool-input-start", id: "call-1", name: "lookup", providerMetadata: metadata },
      { type: "tool-input-delta", id: "call-1", name: "lookup", text: '{"query":' },
      { type: "tool-input-delta", id: "call-1", name: "lookup", text: '"weather"}' },
      { type: "tool-input-end", id: "call-1", name: "lookup", providerMetadata: { openai: { inputDone: true } } },
      {
        type: "tool-call",
        id: "call-1",
        name: "lookup",
        input: { query: "weather" },
        providerExecuted: true,
        providerMetadata: { openai: { called: true } },
      },
      {
        type: "tool-result",
        id: "call-1",
        name: "lookup",
        result: { type: "json", value: { title: "Lookup", output: "sunny", metadata: { ok: true } } },
        providerExecuted: true,
        providerMetadata: { openai: { result: true } },
      },
      {
        type: "step-finish",
        index: 0,
        reason: "unknown",
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          reasoningTokens: 1,
          cacheReadInputTokens: 3,
          cacheWriteInputTokens: 2,
        },
        providerMetadata: { openai: { step: true } },
      },
      {
        type: "finish",
        reason: "unknown",
        usage: {
          inputTokens: 11,
          outputTokens: 6,
          totalTokens: 17,
          reasoningTokens: 2,
          cacheReadInputTokens: 4,
        },
      },
    ])
  })

  test("creates stable block ids when AI SDK omits them", async () => {
    const events = await adapt([
      uncheckedAdapterEvent({ type: "text-delta", text: "implicit text" }),
      uncheckedAdapterEvent({ type: "text-end" }),
      uncheckedAdapterEvent({ type: "reasoning-delta", text: "implicit reasoning" }),
      uncheckedAdapterEvent({ type: "reasoning-end" }),
    ])

    expect(events).toMatchObject([
      { type: "text-delta", id: "text-0", text: "implicit text" },
      { type: "text-end", id: "text-0" },
      { type: "reasoning-delta", id: "reasoning-0", text: "implicit reasoning" },
      { type: "reasoning-end", id: "reasoning-0" },
    ])
  })

  test("explicitly ignores non-session-visible AI SDK chunks", async () => {
    expect(
      await adapt([
        uncheckedAdapterEvent({ type: "abort" }),
        uncheckedAdapterEvent({ type: "source" }),
        uncheckedAdapterEvent({ type: "file" }),
        uncheckedAdapterEvent({ type: "raw" }),
        uncheckedAdapterEvent({ type: "tool-output-denied" }),
        uncheckedAdapterEvent({ type: "tool-approval-request" }),
      ]),
    ).toEqual([])
  })

  test("preserves tool-error cause", async () => {
    const error = new Permission.RejectedError()
    const events = await Effect.runPromise(
      LLMAISDK.toLLMEvents(LLMAISDK.adapterState(), {
        type: "tool-error",
        toolCallId: "call_123",
        toolName: "bash",
        input: {},
        error,
      }),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: "tool-error",
      id: "call_123",
      name: "bash",
      message: error.message,
      error,
    })
  })

  test("emits undefined usage when every AI SDK usage field is missing", async () => {
    // If every numeric field is undefined the translator should signal "no usage info"
    // by emitting undefined, not by polluting the event with usage: {}. Downstream cost
    // telemetry distinguishes "missing" from "zero," so emitting an empty object causes
    // false positives ("usage was tracked, just empty") instead of correct nulls.
    const events = await adapt([
      {
        type: "finish-step",
        response: { id: "response-1", timestamp: new Date(0), modelId: "gpt-test" },
        finishReason: "stop",
        rawFinishReason: "stop",
        providerMetadata: undefined,
        usage: {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
          reasoningTokens: undefined,
          cachedInputTokens: undefined,
          inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
          outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
        },
      },
    ])

    expect(events).toHaveLength(1)
    const stepFinish = events[0]
    if (stepFinish.type !== "step-finish") throw new Error("expected step-finish")
    expect(stepFinish.usage).toBeUndefined()
  })

  test("reuses adapter state cleanly across streams once finish has fired", async () => {
    // adapterState() is meant to be per-stream, but the only thing finish currently clears
    // is toolNames — step, text counters, and the current text/reasoning IDs all leak
    // forward. A caller that reuses a state across two streams sees text-1/reasoning-1/
    // step index 1 on the second stream's first events. The test pins the intended
    // contract: after finish, the same state can be reused and starts fresh.
    const state = LLMAISDK.adapterState()
    const run = (events: ReadonlyArray<AISDKAdapterEvent>) =>
      Effect.runPromise(
        Effect.forEach(events, (event) => LLMAISDK.toLLMEvents(state, event)).pipe(Effect.map((items) => items.flat())),
      )

    await run([
      { type: "start-step", request: {}, warnings: [] },
      uncheckedAdapterEvent({ type: "text-delta", text: "first" }),
      uncheckedAdapterEvent({ type: "text-end" }),
      uncheckedAdapterEvent({ type: "reasoning-delta", text: "first reasoning" }),
      uncheckedAdapterEvent({ type: "reasoning-end" }),
      {
        type: "finish-step",
        response: { id: "r1", timestamp: new Date(0), modelId: "gpt-test" },
        finishReason: "stop",
        rawFinishReason: "stop",
        providerMetadata: undefined,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
          outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
        },
      },
      {
        type: "finish",
        finishReason: "stop",
        rawFinishReason: "stop",
        totalUsage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
          outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
        },
      },
    ])

    const secondStream = await run([
      { type: "start-step", request: {}, warnings: [] },
      uncheckedAdapterEvent({ type: "text-delta", text: "second" }),
      uncheckedAdapterEvent({ type: "text-end" }),
      uncheckedAdapterEvent({ type: "reasoning-delta", text: "second reasoning" }),
      uncheckedAdapterEvent({ type: "reasoning-end" }),
    ])

    expect(secondStream).toMatchObject([
      { type: "step-start", index: 0 },
      { type: "text-delta", id: "text-0", text: "second" },
      { type: "text-end", id: "text-0" },
      { type: "reasoning-delta", id: "reasoning-0", text: "second reasoning" },
      { type: "reasoning-end", id: "reasoning-0" },
    ])
  })

  // Anthropic emits cache write counts in providerMetadata.anthropic.cacheCreationInputTokens
  // rather than usage.inputTokenDetails.cacheWriteTokens. Session.getUsage falls back to the
  // metadata path — but only if the adapter preserves providerMetadata on step-finish.
  test("preserves providerMetadata on step-finish so Anthropic cache writes survive getUsage", async () => {
    const events = await adapt([
      {
        type: "finish-step",
        response: { id: "msg_test", timestamp: new Date(0), modelId: "claude-3-5-sonnet" },
        finishReason: "stop",
        rawFinishReason: "stop",
        // Anthropic's AI SDK shape: cacheWriteTokens is NOT in usage, it arrives via providerMetadata.
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          inputTokenDetails: { noCacheTokens: 800, cacheReadTokens: 200, cacheWriteTokens: undefined },
          outputTokenDetails: { textTokens: 500, reasoningTokens: undefined },
        },
        providerMetadata: { anthropic: { cacheCreationInputTokens: 300 } },
      },
    ])

    expect(events).toHaveLength(1)
    const stepFinish = events[0]
    if (stepFinish.type !== "step-finish") throw new Error("expected step-finish")
    expect(stepFinish.providerMetadata).toEqual({ anthropic: { cacheCreationInputTokens: 300 } })
    expect(stepFinish.usage?.cacheWriteInputTokens).toBeUndefined()
    expect(stepFinish.usage?.cacheReadInputTokens).toBe(200)

    // End-to-end: with the metadata preserved, getUsage extracts cache.write from the fallback path.
    const result = SessionNs.getUsage({
      model: {
        id: "claude-3-5-sonnet",
        providerID: "anthropic",
        name: "Claude",
        limit: { context: 200_000, output: 8_000 },
        cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
        capabilities: {
          toolcall: true,
          attachment: false,
          reasoning: false,
          temperature: true,
          input: { text: true, image: false, audio: false, video: false },
          output: { text: true, image: false, audio: false, video: false },
        },
        api: { npm: "@ai-sdk/anthropic" },
        options: {},
      } as never,
      usage: stepFinish.usage!,
      metadata: stepFinish.providerMetadata,
    })
    expect(result.tokens.cache.write).toBe(300)
    expect(result.tokens.cache.read).toBe(200)
  })
})

type Capture = {
  url: URL
  headers: Headers
  body: Record<string, unknown>
}

const state = {
  server: null as ReturnType<typeof Bun.serve> | null,
  queue: [] as Array<{
    path: string
    response: Response | ((req: Request, capture: Capture) => Response)
    resolve: (value: Capture) => void
  }>,
}

function deferred<T>() {
  const result = {} as { promise: Promise<T>; resolve: (value: T) => void }
  result.promise = new Promise((resolve) => {
    result.resolve = resolve
  })
  return result
}

function waitRequest(pathname: string, response: Response) {
  const pending = deferred<Capture>()
  state.queue.push({ path: pathname, response, resolve: pending.resolve })
  return pending.promise
}

function timeout(ms: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
  })
}

function waitStreamingRequest(pathname: string) {
  const request = deferred<Capture>()
  const requestAborted = deferred<void>()
  const responseCanceled = deferred<void>()
  const encoder = new TextEncoder()

  state.queue.push({
    path: pathname,
    resolve: request.resolve,
    response(req: Request) {
      req.signal.addEventListener("abort", () => requestAborted.resolve(), { once: true })

      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                [
                  `data: ${JSON.stringify({
                    id: "chatcmpl-abort",
                    object: "chat.completion.chunk",
                    choices: [{ delta: { role: "assistant" } }],
                  })}`,
                ].join("\n\n") + "\n\n",
              ),
            )
          },
          cancel() {
            responseCanceled.resolve()
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        },
      )
    },
  })

  return {
    request: request.promise,
    requestAborted: requestAborted.promise,
    responseCanceled: responseCanceled.promise,
  }
}

beforeAll(() => {
  state.server = Bun.serve({
    port: 0,
    async fetch(req) {
      const next = state.queue.shift()
      if (!next) {
        return new Response("unexpected request", { status: 500 })
      }

      const url = new URL(req.url)
      const body = (await req.json()) as Record<string, unknown>
      next.resolve({ url, headers: req.headers, body })

      if (!url.pathname.endsWith(next.path)) {
        return new Response("not found", { status: 404 })
      }

      return typeof next.response === "function"
        ? next.response(req, { url, headers: req.headers, body })
        : next.response
    },
  })
})

beforeEach(() => {
  state.queue.length = 0
})

afterAll(() => {
  void state.server?.stop()
})

function createChatStream(text: string) {
  const payload =
    [
      `data: ${JSON.stringify({
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        choices: [{ delta: { role: "assistant" } }],
      })}`,
      `data: ${JSON.stringify({
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        choices: [{ delta: { content: text } }],
      })}`,
      `data: ${JSON.stringify({
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        choices: [{ delta: {}, finish_reason: "stop" }],
      })}`,
      "data: [DONE]",
    ].join("\n\n") + "\n\n"

  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
}

const MODELS_FIXTURE = JSON.parse(
  await Bun.file(path.join(import.meta.dir, "../tool/fixtures/models-api.json")).text(),
) as Record<string, ModelsDev.Provider>

function loadFixture(providerID: string, modelID: string) {
  const provider = MODELS_FIXTURE[providerID]
  if (!provider) throw new Error(`Missing provider in fixture: ${providerID}`)
  const model = provider.models[modelID]
  if (!model) throw new Error(`Missing model in fixture: ${modelID}`)
  return { provider, model }
}

function configModel(model: ModelsDev.Model) {
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    release_date: model.release_date,
    attachment: model.attachment,
    reasoning: model.reasoning,
    temperature: model.temperature,
    tool_call: model.tool_call,
    interleaved: model.interleaved,
    cost: model.cost ? { ...model.cost, tiers: undefined } : undefined,
    limit: model.limit,
    modalities: model.modalities,
    status: model.status,
    provider: model.provider,
  }
}

function createEventStream(chunks: unknown[], includeDone = false) {
  const lines = chunks.map((chunk) => `data: ${typeof chunk === "string" ? chunk : JSON.stringify(chunk)}`)
  if (includeDone) {
    lines.push("data: [DONE]")
  }
  const payload = lines.join("\n\n") + "\n\n"
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
}

function createEventResponse(chunks: unknown[], includeDone = false) {
  return new Response(createEventStream(chunks, includeDone), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  })
}
