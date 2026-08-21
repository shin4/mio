import { describe, expect, test } from "bun:test"
import { buildDictationBody, DICTATION_MODEL } from "@/server/routes/instance/httpapi/handlers/dictation-body"
import type { DictationRequest } from "@/server/routes/instance/httpapi/groups/dictation"

const ok = (r: ReturnType<typeof buildDictationBody>) => {
  if (!r.ok) throw new Error(`expected ok, got error: ${r.message}`)
  return r
}

type Content = { type: string; input_audio?: { data?: string } }
type Msg = { role: string; content: Content[] }

const requestBody = (r: ReturnType<typeof buildDictationBody>) =>
  ok(r).body as {
    model: string
    messages: Msg[]
    asr_options: { language: string }
    stream: false
    temperature?: unknown
    max_tokens?: unknown
    thinking?: unknown
  }

describe("buildDictationBody", () => {
  const sampleRate = 16_000
  const wav = wavDataUrl(speechLike(2.1, sampleRate), sampleRate)

  test("targets the dedicated ASR model", () => {
    const body = requestBody(buildDictationBody({ audio: { dataUrl: wav, mime: "audio/wav" } } as DictationRequest))
    expect(DICTATION_MODEL).toBe("mimo-v2.5-asr")
    expect(body.model).toBe("mimo-v2.5-asr")
  })

  test("sends a single user message containing only the wav input_audio", () => {
    const body = requestBody(buildDictationBody({ audio: { dataUrl: wav, mime: "audio/wav" } } as DictationRequest))
    expect(body.messages).toHaveLength(1)
    const user = body.messages[0]
    expect(user.role).toBe("user")
    expect(user.content).toEqual([{ type: "input_audio", input_audio: { data: wav } }])
  })

  test("omits chat-style params and is non-streaming", () => {
    const body = requestBody(buildDictationBody({ audio: { dataUrl: wav, mime: "audio/wav" } } as DictationRequest))
    expect(body.stream).toBe(false)
    expect("temperature" in body).toBe(false)
    expect("max_tokens" in body).toBe(false)
    expect("thinking" in body).toBe(false)
  })

  test("defaults asr language to auto and passes through an explicit language", () => {
    const auto = requestBody(buildDictationBody({ audio: { dataUrl: wav, mime: "audio/wav" } } as DictationRequest))
    expect(auto.asr_options).toEqual({ language: "auto" })

    const zh = requestBody(
      buildDictationBody({ audio: { dataUrl: wav, mime: "audio/wav" }, language: "zh" } as DictationRequest),
    )
    expect(zh.asr_options).toEqual({ language: "zh" })

    const en = requestBody(
      buildDictationBody({ audio: { dataUrl: wav, mime: "audio/wav" }, language: "en" } as DictationRequest),
    )
    expect(en.asr_options).toEqual({ language: "en" })
  })

  test("rejects empty, non-wav, too-long, and oversized audio", () => {
    expect(buildDictationBody({ audio: { dataUrl: "", mime: "audio/wav" } } as DictationRequest).ok).toBe(false)
    expect(
      buildDictationBody({ audio: { dataUrl: "data:audio/webm;base64,AAAA", mime: "audio/webm" } } as DictationRequest)
        .ok,
    ).toBe(false)
    expect(
      buildDictationBody({ audio: { dataUrl: wav, mime: "audio/wav", durationSeconds: 61 } } as DictationRequest).ok,
    ).toBe(false)
    expect(
      buildDictationBody({ audio: { dataUrl: wav, mime: "audio/wav", durationSeconds: 0 } } as DictationRequest).ok,
    ).toBe(false)
    expect(
      buildDictationBody({ audio: { dataUrl: wav, mime: "audio/wav", durationSeconds: -1 } } as DictationRequest).ok,
    ).toBe(false)
    const oversized = buildDictationBody({
      audio: { dataUrl: `data:audio/wav;base64,${"A".repeat(11_000_000)}`, mime: "audio/wav" },
    } as DictationRequest)
    expect(oversized.ok).toBe(false)
    expect(oversized.ok ? "" : oversized.message).toContain("10MB")
  })

  test("rejects short and silent wav audio before calling MiMo", () => {
    const short = buildDictationBody({
      audio: { dataUrl: wavDataUrl(tone(0.3, 0.04, sampleRate), sampleRate), mime: "audio/wav" },
    } as DictationRequest)
    const silence = buildDictationBody({
      audio: { dataUrl: wavDataUrl(new Float32Array(sampleRate * 2), sampleRate), mime: "audio/wav" },
    } as DictationRequest)

    expect(short.ok).toBe(false)
    expect(short.ok ? "" : short.message).toContain("too_short")
    expect(silence.ok).toBe(false)
    expect(silence.ok ? "" : silence.message).toContain("no_speech")
  })
})

function tone(seconds: number, amplitude: number, sampleRate: number) {
  const samples = new Float32Array(Math.floor(seconds * sampleRate))
  samples.forEach((_, index) => {
    samples[index] = Math.sin((2 * Math.PI * 220 * index) / sampleRate) * amplitude
  })
  return samples
}

function speechLike(seconds: number, sampleRate: number) {
  const samples = new Float32Array(Math.floor(seconds * sampleRate))
  samples.forEach((_, index) => {
    samples[index] = index < sampleRate * 0.2 ? 0 : Math.sin((2 * Math.PI * 220 * index) / sampleRate) * 0.04
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
