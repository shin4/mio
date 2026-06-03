import { Provider } from "@/provider/provider"
import { ProviderID } from "@/provider/schema"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { DictationApiError, type DictationRequest } from "../groups/dictation"
import { buildDictationBody } from "./dictation-body"

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

type MiMoUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: {
    cached_tokens?: number
    audio_tokens?: number
  }
}

export const dictationHandlers = HttpApiBuilder.group(InstanceHttpApi, "dictation", (handlers) =>
  Effect.gen(function* () {
    const provider = yield* Provider.Service

    const transcribe = Effect.fn("DictationHttpApi.transcribe")(function* (ctx: { payload: DictationRequest }) {
      const info = yield* provider.getProvider(ProviderID.make("mimo"))
      const apiKey = info.options["apiKey"] as string | undefined
      const baseURL = info.options["baseURL"] as string | undefined
      if (!apiKey || !baseURL) {
        return yield* new DictationApiError({
          name: "ProviderNotConnected",
          data: { message: "MiMo provider is not connected. Configure it in Settings → Providers." },
        })
      }

      const built = buildDictationBody(ctx.payload)
      if (!built.ok) {
        return yield* new DictationApiError({ name: "BadRequest", data: { message: built.message } })
      }

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`${baseURL}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "api-key": apiKey },
            body: JSON.stringify(built.body),
          }),
        catch: (error) => new DictationApiError({ name: "UpstreamError", data: { message: errorMessage(error) } }),
      })

      if (!response.ok) {
        const detail = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => new DictationApiError({ name: "UpstreamError", data: { message: `HTTP ${response.status}` } }),
        })
        return yield* new DictationApiError({
          name: "UpstreamError",
          data: { message: `MiMo dictation HTTP ${response.status}: ${detail.slice(0, 300)}` },
        })
      }

      const json = yield* Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: (error) => new DictationApiError({ name: "UpstreamError", data: { message: errorMessage(error) } }),
      })

      const text = transcribedText(json)
      if (!text) {
        // The ASR call succeeded but produced no transcript — treat it as "no speech detected"
        // so the client surfaces the same clear prompt as the pre-send no_speech rejection.
        return yield* new DictationApiError({
          name: "BadRequest",
          data: { message: "dictation no_speech: model returned no transcript" },
        })
      }

      return {
        text,
        usage: usageFromResponse(json),
      }
    })

    return handlers.handle("transcribe", transcribe)
  }),
)

export function transcribedText(input: unknown) {
  const message = (input as { choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }> })?.choices?.[0]
    ?.message
  if (typeof message?.content === "string") {
    const text = message.content.trim()
    if (text) return text
  }
  if (Array.isArray(message?.content)) {
    const text = message.content
      .flatMap((part) => {
        if (typeof part === "string") return [part]
        if (typeof (part as { text?: unknown }).text === "string") return [(part as { text: string }).text]
        return []
      })
      .join("")
      .trim()
    if (text) return text
  }
  if (typeof message?.reasoning_content === "string") return message.reasoning_content.trim()
  return ""
}

function usageFromResponse(input: unknown) {
  const usage = (input as { usage?: MiMoUsage }).usage
  if (!usage) return undefined
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cacheReadInputTokens: usage.prompt_tokens_details?.cached_tokens,
    audioTokens: usage.prompt_tokens_details?.audio_tokens,
  }
}
