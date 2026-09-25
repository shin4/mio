/** MiMo ASR registered as a cloud recognizer beside the official dsh voice input. */
import z from "@deepseek-ai/schemastery"
import { credentialRef } from "@deepseek-ai/dsh-credentials"
import { validateWave } from "@deepseek-ai/dsh-experimental-speech-to-text/wave"

export const name = "mio-asr"
export const inject = ["speechToText", "credentials", "settings"]

/** MiMo's own `asr_options.language` values; the voice input offers exactly these. */
const LANGUAGES = ["auto", "zh", "en"]

export const Config = z.object({
  providerId: z.string().min(1).default("mio-asr"),
  model: z.string().min(1).default("mimo-v2.5-asr"),
  // The llm-pi-ai route whose endpoint and credential this recognizer shares.
  route: z.string().min(1).default("mimo"),
  apiKeyRef: z.string().min(1).default("MIO_API_KEY"),
  maxDurationSeconds: z.number().min(1).default(60),
})

/**
 * The route's current endpoint. Welcome rewrites it per key (PAYG or a Token Plan region),
 * so it is read per request from the live llm-pi-ai entry rather than copied into config.
 * @param ctx - context carrying `settings`.
 * @param route - llm-pi-ai provider route key.
 * @returns the base URL without a trailing slash.
 */
function endpointOf(ctx, route) {
  const entry = ctx.settings.describe().find((descriptor) => descriptor.ns === "llm-pi-ai")
  const baseURL = entry?.value?.providers?.[route]?.baseURL
  if (typeof baseURL !== "string" || baseURL.length === 0) {
    throw new Error(`MiMo ASR: llm-pi-ai route "${route}" has no baseURL`)
  }
  return baseURL.replace(/\/+$/, "")
}

/**
 * The transcript MiMo returned; ASR answers as an ordinary chat completion.
 * @param body - parsed response.
 * @returns trimmed text, empty when no speech was recognized.
 */
function transcriptOf(body) {
  const content = body?.choices?.[0]?.message?.content
  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => (typeof part === "string" ? part : typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim()
}

/**
 * Register MiMo ASR with the speech registry; activation makes no network call.
 * @param ctx - Host context.
 * @param config - validated configuration.
 */
export function apply(ctx, config) {
  const apiKey = credentialRef(config.apiKeyRef)
  ctx.effect(() =>
    ctx.speechToText.register({
      info: { id: config.providerId, name: "MiMo ASR", location: "cloud", languages: LANGUAGES },
      async transcribe(input, signal) {
        const audioSeconds = validateWave(input.audio, config.maxDurationSeconds)
        if (!LANGUAGES.includes(input.language)) throw new Error(`MiMo ASR: unsupported language ${input.language}`)
        const key = (await ctx.credentials.resolve(apiKey))?.value
        if (!key) throw new Error(`MiMo ASR: ${config.apiKeyRef} is not configured`)
        const started = performance.now()
        const response = await fetch(`${endpointOf(ctx, config.route)}/chat/completions`, {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: config.model,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "input_audio",
                    input_audio: { data: `data:audio/wav;base64,${Buffer.from(input.audio).toString("base64")}` },
                  },
                ],
              },
            ],
            asr_options: { language: input.language },
            stream: false,
          }),
        })
        if (!response.ok) {
          throw new Error(`MiMo ASR HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
        }
        const text = transcriptOf(await response.json())
        return { text, audioSeconds, inferenceSeconds: (performance.now() - started) / 1000 }
      },
    }),
  )
}
