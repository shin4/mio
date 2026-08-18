import { base64PayloadBytes, MIO_ASR_BASE64_LIMIT_BYTES } from "@opencode-ai/core/attachment-limits"
import { decodePcm16MonoWavDataUrl, validateDictationAudio } from "@opencode-ai/core/dictation-audio"
import type { DictationLanguage, DictationRequest } from "../groups/dictation"

export const DICTATION_MODEL = "mimo-v2.5-asr"
export const DICTATION_MAX_SECONDS = 60

type DictationContent = {
  type: "input_audio"
  input_audio: {
    data: string
  }
}

type DictationMessage = {
  role: "user"
  content: DictationContent[]
}

type DictationBody = {
  model: string
  messages: DictationMessage[]
  asr_options: { language: DictationLanguage }
  stream: false
}

export type DictationBodyResult =
  | { ok: true; body: DictationBody }
  | { ok: false; message: string }

export function buildDictationBody(payload: DictationRequest): DictationBodyResult {
  const dataUrl = payload.audio.dataUrl.trim()
  if (!dataUrl) return { ok: false, message: "audio.dataUrl is required" }
  if (payload.audio.mime !== "audio/wav") return { ok: false, message: `unsupported audio type: ${payload.audio.mime}` }
  if (!dataUrl.startsWith("data:audio/wav;base64,")) return { ok: false, message: "audio must be a WAV data URL" }
  if (payload.audio.durationSeconds !== undefined && payload.audio.durationSeconds > DICTATION_MAX_SECONDS) {
    return { ok: false, message: "audio duration exceeds 60 seconds" }
  }
  if (payload.audio.durationSeconds !== undefined && payload.audio.durationSeconds <= 0) {
    return { ok: false, message: "audio duration must be positive" }
  }

  const bytes = base64PayloadBytes(dataUrl)
  if (bytes !== undefined && bytes > MIO_ASR_BASE64_LIMIT_BYTES) {
    return { ok: false, message: "audio is too large (max 10MB base64)" }
  }

  const decoded = decodePcm16MonoWavDataUrl(dataUrl)
  if (!decoded.ok) return { ok: false, message: decoded.message }
  const validation = validateDictationAudio(decoded.samples, decoded.sampleRate)
  if (!validation.ok) return { ok: false, message: `dictation audio rejected: ${validation.reason}` }

  return {
    ok: true,
    body: {
      model: DICTATION_MODEL,
      messages: [
        {
          role: "user",
          content: [{ type: "input_audio", input_audio: { data: dataUrl } }],
        },
      ],
      asr_options: { language: payload.language ?? "auto" },
      stream: false,
    },
  }
}
