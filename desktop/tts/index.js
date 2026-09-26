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
  // Synthesis time grows with length (about 30 Chinese characters per second on 2026-09-26), so
  // a short first part starts playback quickly and later parts are prefetched while it plays.
  firstPartCharacters: z.natural().min(1).default(120),
  partCharacters: z.natural().min(1).default(600),
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
 * The part of a long reply one synthesis reads: whole sentences up to the limit, so a long
 * answer is read from its start instead of failing. Without a sentence end in reach, the
 * text is cut at the limit.
 * @param text - speakable text.
 * @param limit - maximum characters per synthesis.
 * @returns text of at most `limit` characters.
 */
export function opening(text, limit) {
  if (text.length <= limit) return text
  const head = text.slice(0, limit)
  const end = Math.max(...["。", "！", "？", ".", "!", "?", "\n"].map((mark) => head.lastIndexOf(mark)))
  return (end > 0 ? head.slice(0, end + 1) : head).trim()
}

/**
 * Cut text into pieces of at most `size` characters, breaking after a clause mark or space in the
 * second half of a piece when there is one, so a long sentence is not split inside a word.
 * @param text - one sentence.
 * @param size - maximum characters per piece.
 * @returns pieces in order.
 */
function cut(text, size) {
  if (text.length <= size) return [text]
  const head = text.slice(0, size)
  const soft = Math.max(...["，", "、", "；", "：", ",", ";", ":", " "].map((mark) => head.lastIndexOf(mark)))
  const at = soft >= size / 2 ? soft + 1 : size
  return [text.slice(0, at), ...cut(text.slice(at), size)]
}

/**
 * Split speakable text into parts synthesized one after another: whole sentences, the first part
 * short so playback starts quickly. A sentence longer than a part is cut at clause marks or spaces.
 * @param text - speakable text, already limited by {@link opening}.
 * @param first - maximum characters of the first part.
 * @param rest - maximum characters of every later part.
 * @returns non-empty parts in reading order.
 */
export function parts(text, first, rest) {
  const sentences = text.match(/[^。！？.!?\n]+(?:[。！？.!?]+|\n|$)\s*/g) ?? []
  const [opener = "", ...others] = sentences
  const [lead, ...tail] = cut(opener, first)
  return [lead, ...[...tail, ...others].flatMap((sentence) => cut(sentence, rest))]
    .reduce((result, piece) => {
      const limit = result.length <= 1 ? first : rest
      const last = result.at(-1)
      if (last !== undefined && last.length + piece.length <= limit) result[result.length - 1] = last + piece
      else result.push(piece)
      return result
    }, [])
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
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
 * Serve `POST /api/mio/tts` with `{ text, voice?, part? }`, answering one part's WAV bytes and the
 * part count in `x-mio-tts-parts`, and the voice preference
 * at `GET`/`PUT /api/mio/tts/voice`.
 * @param ctx - Host context.
 * @param config - validated configuration.
 */
export function apply(ctx, config) {
  const apiKey = credentialRef(config.apiKeyRef)
  ctx.effect(() => ctx.connection.fetch.register({
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
      const all = parts(opening(speakable(body.text), config.maxCharacters), config.firstPartCharacters, config.partCharacters)
      if (all.length === 0) return failure(422, "nothing to read aloud")
      const part = body.part ?? 0
      if (!Number.isInteger(part) || part < 0 || part >= all.length) return failure(400, "no such part")
      const text = all[part]
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
        headers: { "content-type": "audio/wav", "cache-control": "no-store", "x-mio-tts-parts": String(all.length) },
      })
    },
  }))
  ctx.effect(() => ctx.connection.fetch.register({
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
  }))
}
