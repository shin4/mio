import { Provider } from "@/provider/provider"
import { ProviderID } from "@/provider/schema"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { TtsApiError, type TTSRequest } from "../groups/tts"
import { buildTtsBody, DEFAULT_VOICE } from "./tts-body"

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const ttsHandlers = HttpApiBuilder.group(InstanceHttpApi, "tts", (handlers) =>
  Effect.gen(function* () {
    const provider = yield* Provider.Service

    const synthesize = Effect.fn("TtsHttpApi.synthesize")(function* (ctx: { payload: TTSRequest }) {
      // Reuse the MiMo provider's resolved key + base URL (api-key auth, region
      // aware). All three TTS models are OpenAI-compatible: POST the text in a
      // role:assistant message with an `audio` param and read back base64 audio.
      const info = yield* provider.getProvider(ProviderID.make("mimo"))
      const apiKey = info.options["apiKey"] as string | undefined
      const baseURL = info.options["baseURL"] as string | undefined
      if (!apiKey || !baseURL) {
        return yield* new TtsApiError({
          name: "ProviderNotConnected",
          data: { message: "MiMo provider is not connected. Configure it in Settings → Providers." },
        })
      }

      // Build the per-mode request body (pure; see ./tts-body for the wire
      // shapes + validation). voice is resolved here so preset can fall back to
      // the provider's saved voice.
      const defaultVoice = (info.options["voice"] as string | undefined) ?? DEFAULT_VOICE
      const built = buildTtsBody(ctx.payload, defaultVoice)
      if (!built.ok) {
        return yield* new TtsApiError({ name: "BadRequest", data: { message: built.message } })
      }
      const { body, voice } = built
      const format = ctx.payload.format ?? "wav"

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`${baseURL}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "api-key": apiKey },
            body: JSON.stringify(body),
          }),
        catch: (error) => new TtsApiError({ name: "UpstreamError", data: { message: errorMessage(error) } }),
      })

      if (!response.ok) {
        const detail = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => new TtsApiError({ name: "UpstreamError", data: { message: `HTTP ${response.status}` } }),
        })
        return yield* new TtsApiError({
          name: "UpstreamError",
          data: { message: `MiMo TTS HTTP ${response.status}: ${detail.slice(0, 300)}` },
        })
      }

      const json = yield* Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: (error) => new TtsApiError({ name: "UpstreamError", data: { message: errorMessage(error) } }),
      })

      const audio = (json as { choices?: Array<{ message?: { audio?: { data?: unknown } } }> })?.choices?.[0]?.message
        ?.audio?.data
      if (typeof audio !== "string" || !audio) {
        return yield* new TtsApiError({ name: "UpstreamError", data: { message: "MiMo TTS returned no audio data" } })
      }

      return { audio, format, voice }
    })

    return handlers.handle("synthesize", synthesize)
  }),
)
