import { describe, expect, test } from "bun:test"
import {
  dictationInputLevel,
  dictationWaveBars,
  encodeWavDataUrl,
  insertTranscript,
  readableDictationSeconds,
} from "./dictation"

describe("prompt dictation helpers", () => {
  test("encodes mono float samples as an audio/wav data URL", () => {
    const dataUrl = encodeWavDataUrl(new Float32Array([-1, 0, 1]), 16_000)
    const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")

    expect(dataUrl.startsWith("data:audio/wav;base64,")).toBe(true)
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF")
    expect(bytes.toString("ascii", 8, 12)).toBe("WAVE")
    expect(bytes.readUInt16LE(20)).toBe(1)
    expect(bytes.readUInt16LE(22)).toBe(1)
    expect(bytes.readUInt32LE(24)).toBe(16_000)
    expect(bytes.readUInt16LE(34)).toBe(16)
  })

  test("inserts transcript at the saved cursor with spacing", () => {
    expect(insertTranscript("修复  缓存", "指标", 3)).toEqual({ text: "修复 指标 缓存", cursor: 6 })
    expect(insertTranscript("", "  你好  ", 0)).toEqual({ text: "你好", cursor: 2 })
  })

  test("formats countdown seconds as clock text", () => {
    expect(readableDictationSeconds(60)).toBe("01:00")
    expect(readableDictationSeconds(5)).toBe("00:05")
  })

  test("maps captured samples to a bounded visual input level", () => {
    expect(dictationInputLevel(new Float32Array(160))).toBe(0)
    expect(dictationInputLevel(tone(0.01))).toBeLessThan(dictationInputLevel(tone(0.08)))
    expect(dictationInputLevel(tone(1))).toBe(1)
  })

  test("builds stable waveform bars from visual input level", () => {
    const quiet = dictationWaveBars(0)
    const loud = dictationWaveBars(1)

    expect(quiet).toHaveLength(21)
    expect(loud).toHaveLength(21)
    expect(Math.max(...quiet)).toBeLessThan(Math.max(...loud))
    expect(Math.max(...loud)).toBeLessThanOrEqual(18)
    expect(Math.min(...quiet)).toBeGreaterThanOrEqual(3)
  })

  test("validates captured audio before encoding and transcribing", async () => {
    const source = await Bun.file(new URL("../prompt-input.tsx", import.meta.url)).text()
    const validation = source.indexOf("validateDictationAudio(samples, capture.sampleRate)")
    const encoding = source.indexOf("encodeWavDataUrl(samples, capture.sampleRate)")
    const transcribe = source.indexOf("transcribeDictation({")

    expect(validation).toBeGreaterThan(-1)
    expect(encoding).toBeGreaterThan(-1)
    expect(transcribe).toBeGreaterThan(-1)
    expect(validation).toBeLessThan(encoding)
    expect(validation).toBeLessThan(transcribe)
    expect(source).toContain("prompt.toast.dictationTooShort.description")
    expect(source).toContain("prompt.toast.dictationNoSpeech.description")
  })

  test("composer exposes a dedicated dictation action", async () => {
    const source = await Bun.file(new URL("../prompt-input.tsx", import.meta.url)).text()
    const dictationAction = source.indexOf('data-action="prompt-dictation"')
    const dictationMeter = source.indexOf('data-component="prompt-dictation-meter"')
    const submitAction = source.indexOf('data-action="prompt-submit"')
    const primaryActionGroup = source.indexOf('data-action="prompt-primary-actions"')
    const leftToolbarStart = source.indexOf('data-action="prompt-attach"')
    const leftToolbarEnd = source.indexOf("<Show when={showAgentControl()}>", leftToolbarStart)
    const primaryActionTag = source.slice(primaryActionGroup, source.indexOf(">", primaryActionGroup) + 1)
    const primaryActions = source.slice(primaryActionGroup, source.indexOf("</DockShellForm>", primaryActionGroup))

    expect(source).toContain('data-action="prompt-dictation"')
    expect(dictationAction).toBeGreaterThan(-1)
    expect(dictationMeter).toBeGreaterThan(-1)
    expect(submitAction).toBeGreaterThan(-1)
    expect(dictationMeter).toBeLessThan(dictationAction)
    expect(dictationAction).toBeLessThan(submitAction)
    expect(source.match(/data-action="prompt-dictation"/g) ?? []).toHaveLength(1)
    expect(source).toContain('icon={dictationStatus() === "recording" ? "stop" : "mic"}')
    expect(primaryActionGroup).toBeGreaterThan(-1)
    expect(primaryActionTag).toContain("gap-2")
    expect(primaryActions).toContain('data-action="prompt-dictation"')
    expect(primaryActions).toContain('data-component="prompt-dictation-meter"')
    expect(primaryActions).toContain('data-action="prompt-submit"')
    expect(primaryActions.indexOf('data-action="prompt-dictation"')).toBeLessThan(
      primaryActions.indexOf('data-action="prompt-submit"'),
    )
    expect(source.slice(leftToolbarStart, leftToolbarEnd)).not.toContain('data-action="prompt-dictation"')
    expect(source).toContain("startDictation")
    expect(source).toContain("stopDictation")
    expect(source).toContain("transcribeDictation")
    expect(source).toContain("prompt.dictation.startWithCost")
    expect(source).toContain("prompt.dictation.stopWithCost")
    expect(source).toContain("prompt.dictation.transcribingWithModel")
    expect(source).toContain("prompt.dictation.unavailableWithCost")
  })

  test("dictation tooltip translations mention mimo-v2.5-asr cost", async () => {
    const en = await Bun.file(new URL("../../i18n/en.ts", import.meta.url)).text()
    const zh = await Bun.file(new URL("../../i18n/zh.ts", import.meta.url)).text()
    const zht = await Bun.file(new URL("../../i18n/zht.ts", import.meta.url)).text()

    expect(en).toContain("Transcribing with mimo-v2.5-asr")
    expect(en).toContain("may increase usage cost")
    expect(zh).toContain("正在通过 mimo-v2.5-asr 转写")
    expect(zh).toContain("可能增加使用成本")
    expect(zht).toContain("正在透過 mimo-v2.5-asr 轉寫")
    expect(zht).toContain("可能增加使用成本")
  })

  test("dictation meter keeps only the orange waveform slots and reduced motion", async () => {
    const source = await Bun.file(new URL("../prompt-input.tsx", import.meta.url)).text()
    const css = await Bun.file(new URL("../../index.css", import.meta.url)).text()

    expect(source).toContain('data-component="prompt-dictation-meter"')
    expect(source).toContain('data-slot="prompt-dictation-meter-bars"')
    expect(source).toContain('data-slot="prompt-dictation-meter-bar"')
    expect(source).not.toContain('data-slot="prompt-dictation-meter-line"')
    expect(source).not.toContain('data-slot="prompt-dictation-meter-time"')
    expect(css).toContain('[data-component="prompt-dictation-meter"]')
    expect(css).toContain('[data-slot="prompt-dictation-meter-bars"]')
    expect(css).toContain('[data-slot="prompt-dictation-meter-bar"]')
    expect(css).toContain("background: var(--mimo-accent-text)")
    expect(css).not.toContain('[data-slot="prompt-dictation-meter-line"]')
    expect(css).not.toContain('[data-slot="prompt-dictation-meter-time"]')
    expect(css).not.toContain("border-top: 2px dotted")
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).toContain("transition: none")
  })
})

function tone(amplitude: number) {
  const samples = new Float32Array(160)
  samples.forEach((_, index) => {
    samples[index] = Math.sin((2 * Math.PI * index) / 16) * amplitude
  })
  return samples
}
