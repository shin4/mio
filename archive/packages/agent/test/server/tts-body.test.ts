import { describe, expect, test } from "bun:test"
import {
  buildTtsBody,
  SINGING_PREFIX,
  TTS_MODEL,
  TTS_MODEL_CLONE,
  TTS_MODEL_DESIGN,
} from "@/server/routes/instance/httpapi/handlers/tts-body"
import type { TTSRequest } from "@/server/routes/instance/httpapi/groups/tts"

const ok = (r: ReturnType<typeof buildTtsBody>) => {
  if (!r.ok) throw new Error(`expected ok, got error: ${r.message}`)
  return r
}
type Msg = { role: string; content: string }
const messages = (r: ReturnType<typeof buildTtsBody>) => (ok(r).body as { messages: Msg[] }).messages
const audio = (r: ReturnType<typeof buildTtsBody>) => (ok(r).body as { audio: Record<string, unknown> }).audio
const model = (r: ReturnType<typeof buildTtsBody>) => (ok(r).body as { model: string }).model

describe("buildTtsBody — preset / singing", () => {
  test("singing prefixes the assistant text with (唱歌)", () => {
    const r = buildTtsBody({ text: "原谅我这一生", singing: true } as TTSRequest, "mimo_default")
    const assistant = messages(r).find((m) => m.role === "assistant")!
    expect(assistant.content).toBe(`${SINGING_PREFIX}原谅我这一生`)
    expect(assistant.content.startsWith("(唱歌)")).toBe(true)
    expect(model(r)).toBe(TTS_MODEL)
  })

  test("singing emits a leading (empty) user message per the docs", () => {
    const r = buildTtsBody({ text: "歌词", singing: true } as TTSRequest, "mimo_default")
    const msgs = messages(r)
    expect(msgs[0]).toEqual({ role: "user", content: "" })
    expect(msgs[1].role).toBe("assistant")
  })

  test("singing carries the style as the user message when present", () => {
    const r = buildTtsBody({ text: "歌词", singing: true, style: "欢快地" } as TTSRequest, "mimo_default")
    expect(messages(r)[0]).toEqual({ role: "user", content: "欢快地" })
  })

  test("non-singing preset does NOT prefix and omits the user message when no style", () => {
    const r = buildTtsBody({ text: "你好" } as TTSRequest, "mimo_default")
    const msgs = messages(r)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toEqual({ role: "assistant", content: "你好" })
    expect(audio(r)).toEqual({ format: "wav", voice: "mimo_default" })
  })

  test("singing=false behaves like plain speech", () => {
    const r = buildTtsBody({ text: "你好", singing: false } as TTSRequest, "mimo_default")
    const assistant = messages(r).find((m) => m.role === "assistant")!
    expect(assistant.content).toBe("你好")
    expect(messages(r).some((m) => m.role === "user")).toBe(false)
  })

  test("explicit voice overrides the default", () => {
    const r = buildTtsBody({ text: "你好", voice: "茉莉" } as TTSRequest, "mimo_default")
    expect(audio(r).voice).toBe("茉莉")
    expect(ok(r).voice).toBe("茉莉")
  })
})

describe("buildTtsBody — design", () => {
  test("uses the voicedesign model, user prompt, optimize_text_preview by default, no voice", () => {
    const r = buildTtsBody({ text: "", mode: "design", designPrompt: "低沉的男声" } as TTSRequest, "mimo_default")
    expect(model(r)).toBe(TTS_MODEL_DESIGN)
    expect(messages(r)).toEqual([{ role: "user", content: "低沉的男声" }])
    expect(audio(r)).toEqual({ format: "wav", optimize_text_preview: true })
    expect("voice" in audio(r)).toBe(false)
  })

  test("explicit optimizeTextPreview=true matches the default design behavior", () => {
    const r = buildTtsBody(
      { text: "", mode: "design", designPrompt: "低沉的男声", optimizeTextPreview: true } as TTSRequest,
      "mimo_default",
    )
    expect(model(r)).toBe(TTS_MODEL_DESIGN)
    expect(messages(r)).toEqual([{ role: "user", content: "低沉的男声" }])
    expect(audio(r)).toEqual({ format: "wav", optimize_text_preview: true })
  })

  test("optimizeTextPreview=false sends the exact assistant text without the upstream optimize flag", () => {
    const r = buildTtsBody(
      { text: "念这句", mode: "design", designPrompt: "低沉的男声", optimizeTextPreview: false } as TTSRequest,
      "mimo_default",
    )
    expect(messages(r)).toEqual([
      { role: "user", content: "低沉的男声" },
      { role: "assistant", content: "念这句" },
    ])
    expect(audio(r)).toEqual({ format: "wav" })
  })

  test("optimizeTextPreview=false rejects empty design text", () => {
    const r = buildTtsBody(
      { text: "   ", mode: "design", designPrompt: "低沉的男声", optimizeTextPreview: false } as TTSRequest,
      "mimo_default",
    )
    expect(r.ok).toBe(false)
    expect(r.ok ? "" : r.message).toBe("text is required")
  })

  test("includes assistant text when provided", () => {
    const r = buildTtsBody({ text: "念这句", mode: "design", designPrompt: "低沉的男声" } as TTSRequest, "mimo_default")
    expect(messages(r).some((m) => m.role === "assistant" && m.content === "念这句")).toBe(true)
  })

  test("missing designPrompt is rejected", () => {
    expect(buildTtsBody({ text: "", mode: "design" } as TTSRequest, "mimo_default").ok).toBe(false)
  })
})

describe("buildTtsBody — clone", () => {
  const ref = { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav" }
  test("uses the voiceclone model and puts the data URL in audio.voice", () => {
    const r = buildTtsBody({ text: "你好", mode: "clone", referenceAudio: ref } as TTSRequest, "mimo_default")
    expect(model(r)).toBe(TTS_MODEL_CLONE)
    expect(audio(r).voice).toBe(ref.dataUrl)
  })

  test("missing reference audio is rejected", () => {
    expect(buildTtsBody({ text: "你好", mode: "clone" } as TTSRequest, "mimo_default").ok).toBe(false)
  })

  test("unsupported mime is rejected", () => {
    const r = buildTtsBody(
      { text: "你好", mode: "clone", referenceAudio: { dataUrl: "data:audio/ogg;base64,AA", mime: "audio/ogg" } } as TTSRequest,
      "mimo_default",
    )
    expect(r.ok).toBe(false)
  })
})

describe("buildTtsBody — text requirement", () => {
  test("empty text is rejected for preset but allowed for design", () => {
    expect(buildTtsBody({ text: "   " } as TTSRequest, "mimo_default").ok).toBe(false)
    expect(buildTtsBody({ text: "", mode: "design", designPrompt: "x" } as TTSRequest, "mimo_default").ok).toBe(true)
  })

  test("optimizeTextPreview is ignored outside design mode", () => {
    const preset = buildTtsBody({ text: "你好", optimizeTextPreview: false } as TTSRequest, "mimo_default")
    const clone = buildTtsBody(
      {
        text: "你好",
        mode: "clone",
        optimizeTextPreview: false,
        referenceAudio: { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav" },
      } as TTSRequest,
      "mimo_default",
    )

    expect(audio(preset)).toEqual({ format: "wav", voice: "mimo_default" })
    expect(audio(clone)).toEqual({ format: "wav", voice: "data:audio/wav;base64,AAAA" })
  })
})
