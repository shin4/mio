import type { Prompt } from "@/context/prompt"

export const DICTATION_MAX_SECONDS = 60
const DICTATION_WAVE_SHAPE = [
  0.16, 0.2, 0.14, 0.24, 0.18, 0.34, 0.28, 0.52, 0.4, 0.76, 0.48, 1, 0.46, 0.7, 0.36, 0.5, 0.3,
  0.42, 0.22, 0.28, 0.18,
]

export function encodeWavDataUrl(samples: Float32Array, sampleRate: number) {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  writeAscii(view, 0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(view, 8, "WAVE")
  writeAscii(view, 12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, "data")
  view.setUint32(40, samples.length * 2, true)

  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })

  return `data:audio/wav;base64,${bytesToBase64(bytes)}`
}

export function mergeAudioChunks(chunks: Float32Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const samples = new Float32Array(total)
  chunks.reduce((offset, chunk) => {
    samples.set(chunk, offset)
    return offset + chunk.length
  }, 0)
  return samples
}

export function dictationInputLevel(samples: Float32Array) {
  if (samples.length === 0) return 0

  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length
  const metrics = samples.reduce(
    (state, sample) => {
      const centered = sample - mean
      const absolute = Math.abs(centered)
      return {
        peak: Math.max(state.peak, absolute),
        sumSquares: state.sumSquares + centered * centered,
      }
    },
    { peak: 0, sumSquares: 0 },
  )
  const rms = Math.sqrt(metrics.sumSquares / samples.length)
  if (metrics.peak < 0.004 || rms < 0.0015) return 0
  return clamp(Math.max(rms / 0.08, metrics.peak / 0.22))
}

export function dictationWaveBars(level: number) {
  const value = clamp(level)
  return DICTATION_WAVE_SHAPE.map((height) => Math.round(3 + height * value * 15))
}

export function insertTranscript(value: string, transcript: string, cursor: number) {
  const content = transcript.trim().replace(/[ \t]+/g, " ")
  if (!content) return { text: value, cursor }

  const before = value.slice(0, cursor).replace(/[ \t]+$/g, "")
  const after = value.slice(cursor).replace(/^[ \t]+/g, "")
  const prefix = before ? `${before} ` : ""
  const suffix = after ? ` ${after}` : ""
  return {
    text: `${prefix}${content}${suffix}`,
    cursor: prefix.length + content.length + (after ? 1 : 0),
  }
}

export function readableDictationSeconds(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
}

export function promptText(prompt: Prompt) {
  return prompt.map((part) => ("content" in part ? part.content : "")).join("")
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

function writeAscii(view: DataView, offset: number, value: string) {
  Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
}

function bytesToBase64(bytes: Uint8Array) {
  const chunk = 0x8000
  const parts: string[] = []
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + chunk)))
  }
  return btoa(parts.join(""))
}
