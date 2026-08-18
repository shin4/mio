import { describe, expect, test } from "bun:test"
import { LLM, LLMClient, Provider } from "@opencode-ai/llm"
import { Route, Protocol } from "@opencode-ai/llm/route"
import { Provider as ProviderSubpath } from "@opencode-ai/llm/provider"
import { Anthropic, MiMo } from "@opencode-ai/llm/providers"
import { OpenAIChat } from "@opencode-ai/llm/protocols"
import * as AnthropicMessages from "@opencode-ai/llm/protocols/anthropic-messages"

describe("public exports", () => {
  test("root exposes app-facing runtime APIs", () => {
    expect(LLM.request).toBeFunction()
    expect(LLMClient.Service).toBeFunction()
    expect(LLMClient.layer).toBeDefined()
    expect(Provider.make).toBeFunction()
    expect(ProviderSubpath.make).toBe(Provider.make)
  })

  test("route barrel exposes route-authoring APIs", () => {
    expect(Route.make).toBeFunction()
    expect(Protocol.make).toBeFunction()
  })

  test("provider barrels expose the MiMo and Anthropic facades", () => {
    // mimo-desktop ships a single cloud provider (MiMo) plus the Anthropic
    // protocol facade it reuses for the Anthropic-compatible endpoint.
    expect(MiMo.configure).toBeFunction()
    expect(MiMo.model).toBeFunction()
    expect(String(MiMo.id)).toBe("mimo")
    // OpenAI-compatible (default) protocol routes to the v1 chat endpoint.
    expect(MiMo.configure({ apiKey: "fixture" }).model("mimo-v2.5").route.id).toBe("openai-chat")
    // Anthropic-compatible protocol selectable via config.
    expect(MiMo.configure({ apiKey: "fixture", protocol: "anthropic" }).model("mimo-v2.5").route.id).toBe(
      "anthropic-messages",
    )
    expect(Anthropic.configure).toBeFunction()
  })

  test("protocol barrels expose supported low-level routes", () => {
    expect(OpenAIChat.route.id).toBe("openai-chat")
    expect(AnthropicMessages.route.id).toBe("anthropic-messages")
  })
})
