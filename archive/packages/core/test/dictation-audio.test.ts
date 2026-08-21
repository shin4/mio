import { describe, expect, test } from "bun:test"
import { decodePcm16MonoWavDataUrl, validateDictationAudio } from "../src/dictation-audio"

const SAMPLE_RATE = 16_000

describe("dictation audio validation", () => {
  test("rejects short audio even when it has signal", () => {
    const result = validateDictationAudio(tone(0.3, 0.04), SAMPLE_RATE)
    if (result.ok) throw new Error("expected short audio to be rejected")
    expect(result.reason).toBe("too_short")
  })

  test("rejects speech-like audio below the 2 second minimum", () => {
    const result = validateDictationAudio(speechLike(1.6), SAMPLE_RATE)
    if (result.ok) throw new Error("expected speech-like audio under 2 seconds to be rejected")
    expect(result.reason).toBe("too_short")
  })

  test("rejects silence and near-silence", () => {
    const silence = validateDictationAudio(new Float32Array(SAMPLE_RATE * 2), SAMPLE_RATE)
    const nearSilence = validateDictationAudio(tone(2, 0.001), SAMPLE_RATE)

    if (silence.ok) throw new Error("expected silence to be rejected")
    expect(silence.reason).toBe("no_speech")
    if (nearSilence.ok) throw new Error("expected near-silence to be rejected")
    expect(nearSilence.reason).toBe("no_speech")
  })

  test("rejects click-like bursts without enough active speech", () => {
    const samples = new Float32Array(SAMPLE_RATE * 2)
    samples.fill(0.8, 2_000, 2_080)

    const result = validateDictationAudio(samples, SAMPLE_RATE)

    if (result.ok) throw new Error("expected click-like bursts to be rejected")
    expect(result.reason).toBe("no_speech")
    expect(result.activeMs).toBeLessThan(180)
  })

  test("accepts continuous speech-like signal", () => {
    const result = validateDictationAudio(speechLike(2.1), SAMPLE_RATE)
    expect(result.ok).toBe(true)
    expect(result.durationSeconds).toBeGreaterThanOrEqual(2)
    expect(result.activeMs).toBeGreaterThanOrEqual(180)
  })

  test("accepts continuous speech-like signal without a quiet lead-in", () => {
    expect(validateDictationAudio(tone(2.1, 0.04), SAMPLE_RATE).ok).toBe(true)
  })

  test("decodes PCM16 mono WAV data URLs for server-side validation", () => {
    const decoded = decodePcm16MonoWavDataUrl(wavDataUrl(speechLike(2.1), SAMPLE_RATE))

    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.sampleRate).toBe(SAMPLE_RATE)
    expect(decoded.samples.length).toBe(Math.floor(2.1 * SAMPLE_RATE))
    expect(validateDictationAudio(decoded.samples, decoded.sampleRate).ok).toBe(true)
  })

  test("rejects malformed WAV data URLs without throwing", () => {
    expect(decodePcm16MonoWavDataUrl("data:audio/wav;base64,@@@").ok).toBe(false)
  })
})

function tone(seconds: number, amplitude: number) {
  const samples = new Float32Array(Math.floor(seconds * SAMPLE_RATE))
  samples.forEach((_, index) => {
    samples[index] = Math.sin((2 * Math.PI * 220 * index) / SAMPLE_RATE) * amplitude
  })
  return samples
}

function speechLike(seconds: number) {
  const samples = new Float32Array(Math.floor(seconds * SAMPLE_RATE))
  samples.forEach((_, index) => {
    samples[index] = index < SAMPLE_RATE * 0.2 ? 0 : Math.sin((2 * Math.PI * 220 * index) / SAMPLE_RATE) * 0.04
  })
  return samples
}

function wavDataUrl(samples: Float32Array, sampleRate: number) {
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

  return `data:audio/wav;base64,${Buffer.from(bytes).toString("base64")}`
}

function writeAscii(view: DataView, offset: number, value: string) {
  Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
}
