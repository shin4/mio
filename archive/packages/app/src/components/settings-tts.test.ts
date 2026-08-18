import { describe, expect, test } from "bun:test"

describe("SettingsTts optimize text preview", () => {
  test("renders the voice-design optimize text preview toggle", async () => {
    const source = await Bun.file(new URL("./settings-tts.tsx", import.meta.url)).text()

    expect(source).toContain('data-action="settings-tts-optimize-text-preview"')
    expect(source).toContain("settings.tts.optimizeTextPreview.label")
    expect(source).toContain("settings.tts.optimizeTextPreview.hint")
    expect(source).toContain("settings.tts.optimizeTextPreview()")
    expect(source).toContain("settings.tts.setOptimizeTextPreview")
  })

  test("passes optimizeTextPreview from settings to preview and read-aloud requests", async () => {
    const settingsSource = await Bun.file(new URL("./settings-tts.tsx", import.meta.url)).text()
    const directorySource = await Bun.file(new URL("../pages/directory-layout.tsx", import.meta.url)).text()

    expect(settingsSource).toContain(
      "optimizeTextPreview: mode === \"design\" ? settings.tts.optimizeTextPreview() : undefined",
    )
    expect(directorySource).toContain(
      "optimizeTextPreview: mode === \"design\" ? settings.tts.optimizeTextPreview() : undefined",
    )
  })

  test("keeps the preview sample reactive until the user edits it", async () => {
    const source = await Bun.file(new URL("./settings-tts.tsx", import.meta.url)).text()

    expect(source).not.toContain('createSignal(t("settings.tts.preview.sample"))')
    expect(source).toContain('const sampleText = () => customSampleText() ?? t("settings.tts.preview.sample")')
    expect(source).toMatch(
      /setCustomSampleText\(\s*e\.currentTarget\.value === t\("settings\.tts\.preview\.sample"\) \? undefined : e\.currentTarget\.value,?\s*\)/,
    )
  })

  test("localizes optimize text preview in English and both Chinese locales", async () => {
    const en = await Bun.file(new URL("../i18n/en.ts", import.meta.url)).text()
    const zh = await Bun.file(new URL("../i18n/zh.ts", import.meta.url)).text()
    const zht = await Bun.file(new URL("../i18n/zht.ts", import.meta.url)).text()

    expect(en).toContain('"settings.tts.optimizeTextPreview.label"')
    expect(en).toContain('"settings.tts.optimizeTextPreview.hint"')
    expect(zh).toContain('"settings.tts.optimizeTextPreview.label"')
    expect(zh).toContain('"settings.tts.optimizeTextPreview.hint"')
    expect(zht).toContain('"settings.tts.optimizeTextPreview.label"')
    expect(zht).toContain('"settings.tts.optimizeTextPreview.hint"')
  })
})
