import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CacheHint, LLM, Message } from "../src"
import { Auth, LLMClient } from "../src/route"
import * as AnthropicMessages from "../src/protocols/anthropic-messages"
import * as OpenAIChat from "../src/protocols/openai-chat"
import { applyCachePolicy } from "../src/cache-policy"
import { it } from "./lib/effect"

const anthropicModel = AnthropicMessages.route
  .with({ endpoint: { baseURL: "https://api.anthropic.test/v1/" }, auth: Auth.header("x-api-key", "test") })
  .model({ id: "claude-sonnet-4-5" })

const openaiModel = OpenAIChat.route
  .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
  .model({ id: "gpt-4o-mini" })

describe("applyCachePolicy", () => {
  it.effect("undefined cache resolves to 'auto' (the recommended default)", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: anthropicModel,
          system: "You are concise.",
          prompt: "hi",
        }),
      )

      // No explicit cache field → auto policy fires → last system part + latest
      // user message both get cache_control markers.
      expect(prepared.body).toMatchObject({
        system: [{ type: "text", text: "You are concise.", cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [{ type: "text", text: "hi", cache_control: { type: "ephemeral" } }] }],
      })
    }),
  )

  it.effect("'auto' marks the last tool, last system part, and latest user message on Anthropic", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: anthropicModel,
          system: "Sys A",
          tools: [{ name: "t1", description: "t1", inputSchema: { type: "object", properties: {} } }],
          messages: [
            Message.user("first user"),
            Message.assistant("assistant reply"),
            Message.user("latest user message"),
          ],
          cache: "auto",
        }),
      )

      expect(prepared.body).toMatchObject({
        tools: [{ name: "t1", cache_control: { type: "ephemeral" } }],
        system: [{ type: "text", text: "Sys A", cache_control: { type: "ephemeral" } }],
        messages: [
          { role: "user", content: [{ type: "text", text: "first user" }] },
          { role: "assistant", content: [{ type: "text", text: "assistant reply" }] },
          {
            role: "user",
            content: [{ type: "text", text: "latest user message", cache_control: { type: "ephemeral" } }],
          },
        ],
      })
    }),
  )

  it.effect("'auto' is a no-op on OpenAI (implicit caching protocol)", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: openaiModel,
          system: "Sys",
          prompt: "hi",
          cache: "auto",
        }),
      )

      const body = prepared.body as { messages: Array<{ content: unknown }> }
      // OpenAI doesn't accept cache_control on messages — policy must skip.
      const flat = JSON.stringify(body)
      expect(flat).not.toContain("cache_control")
      expect(flat).not.toContain("cachePoint")
    }),
  )

  it.effect("'none' disables auto placement even when manual hints exist", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: anthropicModel,
          system: "Sys",
          tools: [{ name: "t1", description: "t1", inputSchema: { type: "object", properties: {} } }],
          prompt: "hi",
          cache: "none",
        }),
      )

      expect(prepared.body).toMatchObject({
        tools: [{ name: "t1", cache_control: undefined }],
        system: [{ type: "text", text: "Sys", cache_control: undefined }],
      })
    }),
  )

  it.effect("granular object form: tools-only marks just tools", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: anthropicModel,
          system: "Sys",
          tools: [{ name: "t1", description: "t1", inputSchema: { type: "object", properties: {} } }],
          prompt: "hi",
          cache: { tools: true },
        }),
      )

      expect(prepared.body).toMatchObject({
        tools: [{ name: "t1", cache_control: { type: "ephemeral" } }],
        system: [{ type: "text", text: "Sys", cache_control: undefined }],
      })
    }),
  )

  it.effect("auto policy preserves manual CacheHints on other parts", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: anthropicModel,
          system: [
            { type: "text", text: "first system", cache: new CacheHint({ type: "ephemeral", ttlSeconds: 3600 }) },
            { type: "text", text: "last system" },
          ],
          prompt: "hi",
          cache: "auto",
        }),
      )

      const body = prepared.body as { system: Array<{ text: string; cache_control?: unknown }> }
      expect(body.system[0]?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" })
      expect(body.system[1]?.cache_control).toEqual({ type: "ephemeral" })
    }),
  )

  it.effect("ttlSeconds in the policy flows through to wire markers", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: anthropicModel,
          system: "Sys",
          prompt: "hi",
          cache: { system: true, ttlSeconds: 3600 },
        }),
      )

      expect(prepared.body).toMatchObject({
        system: [{ type: "text", text: "Sys", cache_control: { type: "ephemeral", ttl: "1h" } }],
      })
    }),
  )

  it.effect("messages: { tail: 2 } marks the last 2 message boundaries", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: anthropicModel,
          messages: [Message.user("u1"), Message.assistant("a1"), Message.user("u2"), Message.assistant("a2")],
          cache: { messages: { tail: 2 } },
        }),
      )

      const body = prepared.body as { messages: Array<{ content: Array<{ cache_control?: unknown }> }> }
      expect(body.messages[0]?.content[0]?.cache_control).toBeUndefined()
      expect(body.messages[1]?.content[0]?.cache_control).toBeUndefined()
      expect(body.messages[2]?.content[0]?.cache_control).toEqual({ type: "ephemeral" })
      expect(body.messages[3]?.content[0]?.cache_control).toEqual({ type: "ephemeral" })
    }),
  )

  it.effect("'latest-assistant' marks the last assistant message", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: anthropicModel,
          messages: [Message.user("u1"), Message.assistant("a1"), Message.user("u2")],
          cache: { messages: "latest-assistant" },
        }),
      )

      const body = prepared.body as { messages: Array<{ content: Array<{ cache_control?: unknown }> }> }
      expect(body.messages[0]?.content[0]?.cache_control).toBeUndefined()
      expect(body.messages[1]?.content[0]?.cache_control).toEqual({ type: "ephemeral" })
      expect(body.messages[2]?.content[0]?.cache_control).toBeUndefined()
    }),
  )

  test("returns the same request reference when policy is a no-op (pure function)", () => {
    const request = LLM.request({
      model: anthropicModel,
      prompt: "hi",
      cache: "none",
    })
    expect(applyCachePolicy(request)).toBe(request)
  })
})
