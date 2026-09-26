/** MiMo ASR registered as a cloud recognizer beside the official dsh voice input. */
import z from "@deepseek-ai/schemastery"
import { credentialRef } from "@deepseek-ai/dsh-credentials"
import { validateWave } from "@deepseek-ai/dsh-experimental-speech-to-text/wave"

export const name = "mio-asr"
export const inject = ["speechToText", "credentials", "settings", "connection"]

/**
 * MiMo `asr_options.language` values offered to voice input. `en` is withheld: on 2026-09-26 the
 * Token Plan endpoint prefixed English transcripts hinted `en` with stray tokens ("10.", "think>")
 * that `auto` did not produce for the same audio, so English is recognized through `auto`.
 */
const LANGUAGES = ["auto", "zh"]

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

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

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
  // Settings → General reads and changes the recognition language here. The official speech service
  // owns the preference and persists it into its own profile entry; this only selects MiMo ASR with it.
  const selection = () => {
    const { selection } = ctx.speechToText.snapshot()
    return { active: selection.providerId === config.providerId, language: selection.language, languages: LANGUAGES }
  }
  ctx.effect(() =>
    ctx.connection.fetch.register({
      path: "/api/mio/asr",
      methods: ["GET", "PUT"],
      requestBody: "buffered",
      async fetch(request) {
        if (request.method === "GET") return json(selection())
        const language = (await request.json().catch(() => undefined))?.language
        if (!LANGUAGES.includes(language)) return json({ error: "unsupported language" }, 400)
        await ctx.speechToText.configure({ providerId: config.providerId, language })
        return json(selection())
      },
    }),
  )
}
