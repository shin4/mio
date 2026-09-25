/** MiMo TTS behind an authenticated Host route; the browser half reads assistant replies aloud. */
import z from "@deepseek-ai/schemastery"
import { credentialRef } from "@deepseek-ai/dsh-credentials"

export const name = "mio-tts"
export const inject = ["connection", "credentials", "settings"]

/** Preset voices of mimo-v2.5-tts. */
export const VOICES = ["mimo_default", "冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"]

export const Config = z.object({
  voice: z
    .union(VOICES.map((voice) => z.const(voice)))
    .default("mimo_default")
    .description("Preset MiMo voice used to read replies aloud.")
    .volatile(),
  model: z.string().min(1).default("mimo-v2.5-tts"),
  // The llm-pi-ai route whose endpoint and credential this plugin shares.
  route: z.string().min(1).default("mimo"),
  apiKeyRef: z.string().min(1).default("MIO_API_KEY"),
  maxCharacters: z.natural().min(1).default(4000),
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
    throw new Error(`MiMo TTS: llm-pi-ai route "${route}" has no baseURL`)
  }
  return baseURL.replace(/\/+$/, "")
}

/**
 * Reduce a Markdown reply to what is worth hearing: code is skipped, markup is dropped.
 * @param markdown - assistant reply text.
 * @returns speakable prose.
 */
export function speakable(markdown) {
  return markdown
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/(\*\*|__|~~|\*|_)(?=\S)([^\n]*?\S)\1/g, "$2")
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, "")
    .replace(/\n[ \t]*(?:\n[ \t]*)+/g, "\n")
    .trim()
}

/**
 * The synthesis request MiMo documents for a preset voice: the text is the assistant turn.
 * @param config - validated configuration.
 * @param text - speakable text.
 * @param voice - preset voice.
 * @returns request body.
 */
export function synthesisBody(config, text, voice) {
  return {
    model: config.model,
    messages: [{ role: "assistant", content: text }],
    audio: { format: "wav", voice },
    stream: false,
  }
}

const failure = (status, message) =>
  new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json" } })

const json = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } })

/**
 * Serve `POST /api/mio/tts` with `{ text, voice? }`, answering WAV bytes, and the voice preference
 * at `GET`/`PUT /api/mio/tts/voice`.
 * @param ctx - Host context.
 * @param config - validated configuration.
 */
export function apply(ctx, config) {
  const apiKey = credentialRef(config.apiKeyRef)
  ctx.connection.fetch.register({
    path: "/api/mio/tts",
    methods: ["POST"],
    requestBody: "buffered",
    async fetch(request) {
      const body = await request.json().catch(() => undefined)
      if (typeof body?.text !== "string") return failure(400, "text is required")
      // A preview names its voice; a reply is read in the saved one, which is volatile, so a
      // choice made in settings reaches the next request without a remount.
      const voice = body.voice ?? config.voice.get()
      if (!VOICES.includes(voice)) return failure(400, "unknown voice")
      const text = speakable(body.text)
      if (text.length === 0) return failure(422, "nothing to read aloud")
      if (text.length > config.maxCharacters) return failure(413, `longer than ${config.maxCharacters} characters`)
      const key = (await ctx.credentials.resolve(apiKey))?.value
      if (!key) return failure(409, `${config.apiKeyRef} is not configured`)
      const response = await fetch(`${endpointOf(ctx, config.route)}/chat/completions`, {
        method: "POST",
        signal: request.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(synthesisBody(config, text, voice)),
      })
      if (!response.ok) {
        return failure(502, `MiMo TTS HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
      }
      const audio = (await response.json())?.choices?.[0]?.message?.audio?.data
      if (typeof audio !== "string" || audio.length === 0) return failure(502, "MiMo TTS returned no audio")
      return new Response(Buffer.from(audio, "base64"), {
        headers: { "content-type": "audio/wav", "cache-control": "no-store" },
      })
    },
  })
  ctx.connection.fetch.register({
    path: "/api/mio/tts/voice",
    methods: ["GET", "PUT"],
    requestBody: "buffered",
    async fetch(request) {
      if (request.method === "GET") return json({ voice: config.voice.get(), voices: VOICES })
      const voice = (await request.json().catch(() => undefined))?.voice
      if (!VOICES.includes(voice)) return failure(400, "unknown voice")
      // Persisted in this entry's profile config; the Loader updates the volatile field in place.
      await ctx.settings.update(ctx.fiber.entry?.options.id ?? name, { voice })
      return json({ voice: config.voice.get(), voices: VOICES })
    },
  })
}
