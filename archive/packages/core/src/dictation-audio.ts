export const DICTATION_MIN_SECONDS = 2
export const DICTATION_MIN_PEAK = 0.012
export const DICTATION_MIN_RMS = 0.0025
export const DICTATION_MIN_ACTIVE_MS = 180
export const DICTATION_FRAME_MS = 20

export type DictationAudioRejectionReason = "too_short" | "no_speech"

export type DictationAudioValidation =
  | {
      ok: true
      durationSeconds: number
      rms: number
      peak: number
      activeMs: number
    }
  | {
      ok: false
      reason: DictationAudioRejectionReason
      durationSeconds: number
      rms: number
      peak: number
      activeMs: number
    }

export type DecodedPcm16MonoWav =
  | { ok: true; samples: Float32Array; sampleRate: number }
  | { ok: false; message: string }

export function validateDictationAudio(samples: Float32Array, sampleRate: number): DictationAudioValidation {
  const durationSeconds = sampleRate > 0 ? samples.length / sampleRate : 0
  const mean = samples.length === 0 ? 0 : samples.reduce((sum, sample) => sum + sample, 0) / samples.length
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
  const rms = samples.length === 0 ? 0 : Math.sqrt(metrics.sumSquares / samples.length)
  const activeMs = activeMilliseconds(samples, sampleRate, mean)

  if (durationSeconds < DICTATION_MIN_SECONDS) {
    return { ok: false, reason: "too_short", durationSeconds, rms, peak: metrics.peak, activeMs }
  }
  if (metrics.peak < DICTATION_MIN_PEAK || rms < DICTATION_MIN_RMS || activeMs < DICTATION_MIN_ACTIVE_MS) {
    return { ok: false, reason: "no_speech", durationSeconds, rms, peak: metrics.peak, activeMs }
  }
  return { ok: true, durationSeconds, rms, peak: metrics.peak, activeMs }
}

export function decodePcm16MonoWavDataUrl(dataUrl: string): DecodedPcm16MonoWav {
  const prefix = "data:audio/wav;base64,"
  if (!dataUrl.startsWith(prefix)) return { ok: false, message: "audio must be a WAV data URL" }

  const bytes = base64ToBytes(dataUrl.slice(prefix.length))
  if (!bytes) return { ok: false, message: "audio WAV base64 payload is invalid" }
  if (bytes.length < 44) return { ok: false, message: "audio WAV data is too short" }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WAVE") {
    return { ok: false, message: "audio must be a RIFF/WAVE file" }
  }

  const chunks = wavChunks(view)
  const fmt = chunks.find((chunk) => chunk.id === "fmt ")
  const data = chunks.find((chunk) => chunk.id === "data")
  if (!fmt || !data) return { ok: false, message: "audio WAV is missing fmt or data chunk" }
  if (fmt.size < 16) return { ok: false, message: "audio WAV fmt chunk is invalid" }

  const audioFormat = view.getUint16(fmt.offset, true)
  const channels = view.getUint16(fmt.offset + 2, true)
  const sampleRate = view.getUint32(fmt.offset + 4, true)
  const bitsPerSample = view.getUint16(fmt.offset + 14, true)
  if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16 || sampleRate <= 0) {
    return { ok: false, message: "audio WAV must be PCM16 mono" }
  }

  const sampleCount = Math.floor(data.size / 2)
  const samples = new Float32Array(sampleCount)
  samples.forEach((_, index) => {
    const value = view.getInt16(data.offset + index * 2, true)
    samples[index] = value < 0 ? value / 0x8000 : value / 0x7fff
  })
  return { ok: true, samples, sampleRate }
}

function activeMilliseconds(samples: Float32Array, sampleRate: number, mean: number) {
  if (samples.length === 0 || sampleRate <= 0) return 0

  const frameSize = Math.max(1, Math.round((sampleRate * DICTATION_FRAME_MS) / 1000))
  const frames = frameRms(samples, frameSize, mean)
  const noiseFloor = percentile(frames, 0.2)
  const activeThreshold = Math.min(DICTATION_MIN_PEAK, Math.max(0.004, noiseFloor * 2.5))

  return frames
    .filter((frame) => frame.rms >= activeThreshold)
    .reduce((sum, frame) => sum + (frame.samples / sampleRate) * 1000, 0)
}

function frameRms(samples: Float32Array, frameSize: number, mean: number) {
  return Array.from({ length: Math.ceil(samples.length / frameSize) }, (_, frame) => {
    const start = frame * frameSize
    const end = Math.min(samples.length, start + frameSize)
    const sumSquares = samples
      .subarray(start, end)
      .reduce((sum, sample) => sum + (sample - mean) * (sample - mean), 0)
    return { rms: Math.sqrt(sumSquares / Math.max(1, end - start)), samples: end - start }
  })
}

function percentile(frames: Array<{ rms: number }>, value: number) {
  if (frames.length === 0) return 0
  const sorted = frames.map((frame) => frame.rms).sort((a, b) => a - b)
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * value)))] ?? 0
}

function wavChunks(view: DataView) {
  const chunks: Array<{ id: string; offset: number; size: number }> = []
  let offset = 12
  while (offset + 8 <= view.byteLength) {
    const id = ascii(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const dataOffset = offset + 8
    if (dataOffset + size > view.byteLength) break
    chunks.push({ id, offset: dataOffset, size })
    offset = dataOffset + size + (size % 2)
  }
  return chunks
}

function ascii(view: DataView, offset: number, length: number) {
  return Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join("")
}

function base64ToBytes(value: string): Uint8Array | undefined {
  try {
    if (typeof atob === "function") {
      return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
    }
    const buffer = (globalThis as { Buffer?: { from(input: string, encoding: "base64"): Uint8Array } }).Buffer
    return buffer ? Uint8Array.from(buffer.from(value, "base64")) : undefined
  } catch {
    return undefined
  }
}
