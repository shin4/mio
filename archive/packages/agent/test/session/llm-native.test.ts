import { describe, expect } from "bun:test"
import { ToolFailure } from "@opencode-ai/llm"
import { LLMClient, RequestExecutor, WebSocketExecutor } from "@opencode-ai/llm/route"
import { jsonSchema, type ModelMessage, type Tool } from "ai"
import { Effect, Layer } from "effect"
import { LLMNativeRuntime } from "@/session/llm/native-runtime"
import { testEffect } from "../lib/effect"

// Native-request lowering/routing for the old multi-provider world (OpenAI
// Responses, per-package route selection, encrypted OpenAI reasoning, OAuth)
// was removed with the MiMo refactor. MiMo's native-request lowering is now
// covered by the @opencode-ai/llm protocol tests (openai-chat / anthropic-
// messages) plus the live MiMo path. What remains provider-neutral here is the
// native runtime's tool wrapping.

const it = testEffect(
  LLMClient.layer.pipe(Layer.provide(Layer.mergeAll(RequestExecutor.defaultLayer, WebSocketExecutor.layer))),
)

describe("session.llm-native.request", () => {
  it.effect("native tool wrapper converts thrown errors into typed ToolFailure", () =>
    Effect.gen(function* () {
      const wrapped = LLMNativeRuntime.nativeTools(
        {
          explode: {
            description: "always throws",
            inputSchema: jsonSchema({ type: "object" }),
            execute: async () => {
              throw new Error("boom")
            },
          } satisfies Tool,
        },
        { messages: [] as ModelMessage[], abort: new AbortController().signal },
      )

      const failure = yield* Effect.flip(wrapped.explode.execute({}, { id: "call-1", name: "explode" }))
      expect(failure).toBeInstanceOf(ToolFailure)
      expect(failure.message).toBe("boom")
    }),
  )

  it.effect("native tool wrapper raises ToolFailure when the source tool has no execute handler", () =>
    Effect.gen(function* () {
      // The AI SDK Tool shape allows execute to be omitted (e.g., client-side / MCP tools).
      // The native runtime owns execution, so encountering such a tool here means upstream
      // wiring is wrong; we want a typed failure, not a silent skip or unhandled exception.
      const wrapped = LLMNativeRuntime.nativeTools(
        { incomplete: { description: "no execute", inputSchema: jsonSchema({ type: "object" }) } satisfies Tool },
        { messages: [] as ModelMessage[], abort: new AbortController().signal },
      )

      const failure = yield* Effect.flip(wrapped.incomplete.execute({}, { id: "call-1", name: "incomplete" }))
      expect(failure).toBeInstanceOf(ToolFailure)
      expect(failure.message).toContain("incomplete")
    }),
  )
})
