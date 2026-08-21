#!/usr/bin/env node
/**
 * Capture real MiMo wire traffic into replay cassettes.
 *
 * Recordings are the ONLY source of truth for the adapter's translation tests,
 * so they are captured from the live API rather than hand-written. Requests go
 * out as raw fetch (not through the adapter) so a cassette records what MiMo
 * actually sent, independent of the code under test.
 *
 * Authentication is never recorded: the key arrives in `$MIO_API_KEY`, is sent
 * in the `api-key` header, and is stripped from the saved request. Response
 * headers are filtered to the few fields the adapter reads.
 *
 * Usage (from packages/llm-mimo):
 *   MIO_API_KEY=<key> node --experimental-strip-types script/record.ts
 *   MIMO_BILLING=token-plan MIMO_REGION=cn ... (defaults shown)
 *
 * Re-run when MiMo's wire behavior changes; commit the updated cassettes.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveBaseURL, type MimoBilling, type MimoRegion } from "../src/endpoints.ts"

const OUT = fileURLToPath(new URL("../test/fixtures/recordings/", import.meta.url))

const apiKey = process.env.MIO_API_KEY?.trim()
if (!apiKey) throw new Error("record: $MIO_API_KEY is required")

const baseURL = resolveBaseURL({
  billing: (process.env.MIMO_BILLING as MimoBilling) ?? "token-plan",
  region: (process.env.MIMO_REGION as MimoRegion) ?? "cn",
  protocol: "openai",
})

const WEATHER_TOOL = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a city.",
    parameters: {
      type: "object",
      properties: { city: { type: "string", description: "City name" } },
      required: ["city"],
    },
  },
}

type Scenario = { name: string; tags: string[]; body: Record<string, unknown>; key?: string }

const base = { model: "mimo-v2.5", stream: true, stream_options: { include_usage: true } }

const SCENARIOS: Scenario[] = [
  {
    name: "reasoning-and-text",
    tags: ["reasoning", "text"],
    body: {
      ...base,
      messages: [
        { role: "system", content: "Answer in exactly one short sentence." },
        { role: "user", content: "What is a prefix cache? One sentence." },
      ],
      max_tokens: 200,
    },
  },
  {
    name: "tool-call",
    tags: ["tool"],
    body: {
      ...base,
      messages: [
        { role: "system", content: "Use tools when relevant." },
        { role: "user", content: "What is the weather in Paris? Use the tool." },
      ],
      tools: [WEATHER_TOOL],
      max_tokens: 300,
    },
  },
  {
    name: "tool-result-continuation",
    tags: ["tool", "cache"],
    body: {
      ...base,
      messages: [
        { role: "system", content: "Use tools when relevant." },
        { role: "user", content: "What is the weather in Paris? Use the tool." },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_recorded", type: "function", function: { name: "get_weather", arguments: '{"city": "Paris"}' } },
          ],
        },
        { role: "tool", tool_call_id: "call_recorded", content: '{"forecast":"sunny","temperature_c":22}' },
      ],
      tools: [WEATHER_TOOL],
      max_tokens: 300,
    },
  },
  {
    name: "max-tokens-truncation",
    tags: ["truncation"],
    body: {
      ...base,
      messages: [
        { role: "system", content: "Be verbose." },
        { role: "user", content: "Explain how HTTP caching works in detail." },
      ],
      max_tokens: 16,
    },
  },
  {
    name: "auth-error",
    tags: ["error"],
    key: "sk-definitely-not-a-valid-key",
    body: { ...base, messages: [{ role: "user", content: "hi" }], max_tokens: 16 },
  },
]

// Only the response headers the adapter reads; everything else is noise or PII-adjacent.
const KEPT_HEADERS = ["content-type", "retry-after", "x-request-id"]

await mkdir(OUT, { recursive: true })

for (const scenario of SCENARIOS) {
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": scenario.key ?? apiKey },
    body: JSON.stringify(scenario.body),
  })
  const body = await response.text()

  const headers: Record<string, string> = {}
  for (const name of KEPT_HEADERS) {
    const value = response.headers.get(name)
    if (value !== null) headers[name] = value
  }

  const recording = {
    version: 1,
    metadata: {
      name: `mimo/${scenario.name}`,
      // Captured against the live API; see this script's header for how to refresh.
      tags: ["provider:mimo", "protocol:openai-chat", ...scenario.tags],
    },
    interactions: [
      {
        transport: "http",
        request: {
          method: "POST",
          url: `${baseURL}/chat/completions`,
          // The `api-key` header is deliberately absent — cassettes carry no credentials.
          headers: { "content-type": "application/json" },
          body: JSON.stringify(scenario.body),
        },
        response: { status: response.status, headers, body },
      },
    ],
  }

  const file = path.join(OUT, `${scenario.name}.json`)
  await writeFile(file, `${JSON.stringify(recording, null, 2)}\n`)
  console.log(`recorded ${scenario.name}: status=${response.status} bytes=${body.length}`)
}
