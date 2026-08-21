# Mio LLM Runtime

`@opencode-ai/llm` is kept under its compatibility package scope for now. It is
the schema-first LLM routing layer used by Mio's native request path.

The package defines one typed request, response, event, and tool language.
Provider-specific details live in route adapters; calling code should work with
`LLM.request`, `LLM.generate`, `LLM.stream`, and normalized `LLMEvent` values.

```ts
import { Effect } from "effect"
import { LLM, LLMClient } from "@opencode-ai/llm"
import { MiMo } from "@opencode-ai/llm/providers"

const model = MiMo.configure({ apiKey: process.env.MIO_API_KEY }).model("mimo-v2.5")

const request = LLM.request({
  model,
  system: "You are concise.",
  prompt: "Say hello in one short sentence.",
  generation: { maxTokens: 40 },
})

const program = Effect.gen(function* () {
  const response = yield* LLMClient.generate(request)
  console.log(response.text)
})
```

## Supported Facades

- `MiMo` - primary MiMo provider facade with OpenAI-compatible and Anthropic-compatible protocols.
- `Anthropic` - low-level Anthropic protocol facade retained for routes that need it.
- `OpenAIChat` and `AnthropicMessages` - supported protocol barrels.

The wider upstream multi-provider export surface is intentionally
not restored here. Additions should be driven by Mio runtime needs, not by
provider catalog parity.

## Caching

Prompt caching defaults to `cache: "auto"`. Automatic placement targets the last
tool definition, last system part, and latest user message. Providers that do
not need inline cache markers treat the policy as a no-op.

Opt out per request:

```ts
LLM.request({
  model,
  prompt: "one-off question",
  cache: "none",
})
```

## Verification

Run checks from this package:

```bash
bun typecheck
bun test
```
