import type { TTSRequest } from "../groups/tts"

// Fixed TTS models — not user-selectable chat models, so they live here rather
// than in the provider's MODEL_PRICES catalog. One model per voice-source mode.
export const TTS_MODEL = "mimo-v2.5-tts"
export const TTS_MODEL_DESIGN = "mimo-v2.5-tts-voicedesign"
export const TTS_MODEL_CLONE = "mimo-v2.5-tts-voiceclone"
export const DEFAULT_VOICE = "mimo_default"

// Singing mode (preset only): prefix the synthesized text with this tag. The
// MiMo docs accept 半角 (), 全角 （） or [] with value 唱歌/sing/singing; we use 半角.
export const SINGING_PREFIX = "(唱歌)"

// Voice-clone reference audio limits. ~10MB raw → ~13.3MB once base64-encoded;
// the data: URL we receive is already encoded, so cap on the encoded length.
export const CLONE_MAX_BASE64 = 14 * 1024 * 1024
export const CLONE_MIME = new Set(["audio/mpeg", "audio/mp3", "audio/wav"])

type TtsMessage = { role: "user" | "assistant"; content: string }

export type TtsBodyResult =
  | { ok: true; body: Record<string, unknown>; voice: string }
  | { ok: false; message: string }

/**
 * Build the MiMo chat/completions request body for a TTS request. Pure (no I/O)
 * so the per-mode wire shape can be unit-tested. `defaultVoice` is the voice the
 * caller resolved from the provider config (used only by preset mode).
 *
 * Wire shapes per mode (verified against the MiMo v2.5 speech-synthesis docs):
 *   preset → model mimo-v2.5-tts; assistant holds the text (prefixed (唱歌) when
 *            singing); audio:{format, voice}.
 *   design → model mimo-v2.5-tts-voicedesign; user holds the description; audio
 *            can use optimize_text_preview and never sends a voice.
 *   clone  → model mimo-v2.5-tts-voiceclone; audio.voice is the reference clip's
 *            data: URL.
 *
 * Singing note: the documented singing example ALWAYS includes a leading
 * `{role:"user", content:""}` message before the assistant lyrics. Omitting it
 * (as a plain assistant-only request does) can make the model ignore the (唱歌)
 * tag and just speak the text — so singing requests always emit the user slot
 * (empty when there's no style).
 */
export function buildTtsBody(payload: TTSRequest, defaultVoice: string): TtsBodyResult {
  const mode = payload.mode ?? "preset"
  const text = payload.text.trim()
  const optimizeTextPreview = mode === "design" && payload.optimizeTextPreview !== false
  // Design mode can synthesize the model's own sample text when empty
  // (optimize_text_preview), so only preset/clone require text.
  if (!text && (mode !== "design" || !optimizeTextPreview)) return { ok: false, message: "text is required" }

  const format = payload.format ?? "wav"
  const style = payload.style?.trim()

  if (mode === "design") {
    const designPrompt = payload.designPrompt?.trim()
    if (!designPrompt) return { ok: false, message: "designPrompt is required" }
    const messages: TtsMessage[] = [{ role: "user", content: designPrompt }]
    if (text) messages.push({ role: "assistant", content: text })
    return {
      ok: true,
      voice: "",
      body: {
        model: TTS_MODEL_DESIGN,
        messages,
        // No `voice` for design; the model invents the timbre from the prompt.
        audio: optimizeTextPreview ? { format, optimize_text_preview: true } : { format },
        stream: false,
      },
    }
  }

  if (mode === "clone") {
    const ref = payload.referenceAudio
    if (!ref?.dataUrl) return { ok: false, message: "referenceAudio is required" }
    if (!CLONE_MIME.has(ref.mime)) return { ok: false, message: `unsupported reference audio type: ${ref.mime}` }
    if (ref.dataUrl.length > CLONE_MAX_BASE64) return { ok: false, message: "reference audio is too large (max ~10MB)" }
    const messages: TtsMessage[] = []
    if (style) messages.push({ role: "user", content: style })
    messages.push({ role: "assistant", content: text })
    return {
      ok: true,
      voice: "",
      body: {
        model: TTS_MODEL_CLONE,
        messages,
        // The reference clip's data: URL is the "voice".
        audio: { format, voice: ref.dataUrl },
        stream: false,
      },
    }
  }

  // preset
  const voice = payload.voice ?? defaultVoice
  const singing = payload.singing === true
  // Singing is preset-only; prefix the text so MiMo enters singing mode.
  const content = singing ? `${SINGING_PREFIX}${text}` : text
  const messages: TtsMessage[] = []
  if (singing) {
    // Always include the user slot for singing (empty when no style) to match
    // the documented request shape.
    messages.push({ role: "user", content: style ?? "" })
  } else if (style) {
    messages.push({ role: "user", content: style })
  }
  messages.push({ role: "assistant", content })

  return {
    ok: true,
    voice,
    body: {
      model: TTS_MODEL,
      messages,
      audio: { format, voice },
      stream: false,
    },
  }
}
