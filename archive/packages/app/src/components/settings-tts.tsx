import { Component, createSignal, Match, onCleanup, Show, Switch } from "solid-js"
import { Switch as Toggle } from "@opencode-ai/ui/switch"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { TTS_MODES, TTS_VOICES, useSettings, type TtsMode } from "@/context/settings"
import { dataUrl } from "@/components/prompt-input/attachments"
import { ReadAloudError, synthesizeSpeech } from "@/utils/tts"
import { SettingsList } from "./settings-list"

// Voice clone accepts mp3/wav only (per MiMo docs). Browsers report mp3 as
// audio/mpeg and wav as audio/wav (sometimes audio/x-wav / audio/wave).
const CLONE_MAX_BYTES = 10 * 1024 * 1024
const CLONE_ACCEPT = "audio/mpeg,audio/mp3,audio/wav,.mp3,.wav"

function normalizeCloneMime(file: File): string | undefined {
  const t = file.type.toLowerCase()
  if (t === "audio/mpeg" || t === "audio/mp3") return "audio/mpeg"
  if (t === "audio/wav" || t === "audio/x-wav" || t === "audio/wave") return "audio/wav"
  const name = file.name.toLowerCase()
  if (name.endsWith(".mp3")) return "audio/mpeg"
  if (name.endsWith(".wav")) return "audio/wav"
  return undefined
}

/**
 * TTS (read-aloud) settings — a standalone panel under the Server section of the
 * settings dialog. Lets the user pick a voice-source mode and configure it:
 *   preset → one of the 9 MiMo voices (+ optional singing + inline audio tags)
 *   design → a natural-language description of the desired voice
 *   clone  → a reference audio clip whose timbre is reproduced
 * The selection is stored in local app settings and sent with each /tts request,
 * so read-aloud (and the preview button here) honor it. The clone reference audio
 * lives in its own persisted key (it can be ~13MB base64).
 */
export const SettingsTts: Component = () => {
  const language = useLanguage()
  const settings = useSettings()
  const server = useServer()
  const t = language.t

  let fileInput: HTMLInputElement | undefined
  const [customSampleText, setCustomSampleText] = createSignal<string | undefined>()
  const sampleText = () => customSampleText() ?? t("settings.tts.preview.sample")
  const [previewing, setPreviewing] = createSignal(false)
  let previewAudio: HTMLAudioElement | undefined

  const stopPreview = () => {
    if (previewAudio) {
      previewAudio.pause()
      previewAudio.src = ""
      previewAudio = undefined
    }
    setPreviewing(false)
  }
  onCleanup(stopPreview)

  const errorToast = (code?: string, fallbackKey?: string) => {
    const key =
      code === "ProviderNotConnected"
        ? "provider.mimo.readAloud.error.notConnected"
        : (fallbackKey ?? "provider.mimo.readAloud.error.failed")
    showToast({ title: t("provider.mimo.readAloud.error.title"), description: t(key) })
  }

  const preview = async () => {
    if (previewing()) {
      stopPreview()
      return
    }
    const http = server.current?.http
    if (!http) {
      errorToast("ProviderNotConnected")
      return
    }
    const mode = settings.tts.mode()
    if (mode === "design" && !settings.tts.designPrompt().trim()) {
      errorToast(undefined, "provider.mimo.readAloud.error.designMissing")
      return
    }
    if (mode === "clone" && !settings.tts.clone.dataUrl()) {
      errorToast(undefined, "provider.mimo.readAloud.error.cloneMissing")
      return
    }

    setPreviewing(true)
    try {
      const result = await synthesizeSpeech({
        http,
        directory: server.projects.last() ?? ".",
        text: sampleText(),
        mode,
        voice: mode === "preset" ? settings.tts.voice() : undefined,
        singing: mode === "preset" ? settings.tts.singing() : undefined,
        designPrompt: mode === "design" ? settings.tts.designPrompt() : undefined,
        optimizeTextPreview: mode === "design" ? settings.tts.optimizeTextPreview() : undefined,
        referenceAudio:
          mode === "clone"
            ? {
                dataUrl: settings.tts.clone.dataUrl(),
                mime: settings.tts.clone.mime(),
                filename: settings.tts.clone.filename(),
              }
            : undefined,
      })
      // A newer click (stop) may have superseded this request while awaiting.
      if (!previewing()) return
      if (!result?.audio) {
        stopPreview()
        return
      }
      const mime = result.format === "wav" ? "audio/wav" : "audio/mpeg"
      const audio = new Audio(`data:${mime};base64,${result.audio}`)
      const clear = () => {
        if (previewAudio === audio) stopPreview()
      }
      audio.addEventListener("ended", clear)
      audio.addEventListener("error", clear)
      previewAudio = audio
      void audio.play().catch(() => clear())
    } catch (error) {
      stopPreview()
      errorToast(error instanceof ReadAloudError ? error.code : undefined)
    }
  }

  const onPickFile = () => fileInput?.click()

  const onFileChange = async (event: Event & { currentTarget: HTMLInputElement }) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = "" // allow re-selecting the same file
    if (!file) return
    const mime = normalizeCloneMime(file)
    if (!mime) {
      errorToast(undefined, "provider.mimo.readAloud.error.cloneType")
      return
    }
    if (file.size > CLONE_MAX_BYTES) {
      errorToast(undefined, "provider.mimo.readAloud.error.cloneTooLarge")
      return
    }
    const url = await dataUrl(file, mime)
    if (!url) {
      errorToast()
      return
    }
    settings.tts.clone.set({ dataUrl: url, mime, filename: file.name })
  }

  const modeLabel = (mode: TtsMode) =>
    mode === "preset"
      ? t("settings.tts.mode.preset")
      : mode === "design"
        ? t("settings.tts.mode.design")
        : t("settings.tts.mode.clone")

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{t("settings.tts.title")}</h2>
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[720px]">
        {/* Voice source mode */}
        <div class="flex flex-col gap-1">
          <SettingsList>
            <div class="flex flex-col gap-1.5 py-3">
              <span class="text-14-medium text-text-strong">{t("settings.tts.mode.label")}</span>
              <div class="flex gap-2 pt-2">
                {TTS_MODES.map((m) => (
                  <button
                    type="button"
                    data-action="settings-tts-mode"
                    onClick={() => settings.tts.setMode(m)}
                    class="flex-1 text-12-regular py-1.5 rounded border transition-colors"
                    classList={{
                      "border-border-focused bg-surface-raised-base text-text-base": settings.tts.mode() === m,
                      "border-border-base text-text-weak hover:bg-surface-raised-base": settings.tts.mode() !== m,
                    }}
                  >
                    {modeLabel(m)}
                  </button>
                ))}
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-4 py-3 border-t border-border-weak-base">
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-14-medium text-text-strong">{t("settings.tts.autoplay.label")}</span>
                <span class="text-12-regular text-text-weak">{t("settings.tts.autoplay.hint")}</span>
              </div>
              <div data-action="settings-tts-autoplay" class="flex w-full justify-end sm:w-auto sm:shrink-0">
                <Toggle checked={settings.tts.autoplay()} onChange={(v) => settings.tts.setAutoplay(v)} />
              </div>
            </div>

            <Switch>
              {/* Preset: voice grid + singing toggle + audio-tags hint */}
              <Match when={settings.tts.mode() === "preset"}>
                <div class="flex flex-col gap-1.5 py-3 border-t border-border-weak-base">
                  <span class="text-14-medium text-text-strong">{t("provider.mimo.voice.label")}</span>
                  <span class="text-12-regular text-text-weak">{t("provider.mimo.voice.hint")}</span>
                  <div class="flex flex-wrap gap-2 pt-2">
                    {TTS_VOICES.map((v) => (
                      <button
                        type="button"
                        data-action="settings-tts-voice"
                        onClick={() => settings.tts.setVoice(v)}
                        class="text-12-regular px-3 py-1.5 rounded border transition-colors"
                        classList={{
                          "border-border-focused bg-surface-raised-base text-text-base": settings.tts.voice() === v,
                          "border-border-base text-text-weak hover:bg-surface-raised-base": settings.tts.voice() !== v,
                        }}
                      >
                        {v === "mimo_default" ? t("provider.mimo.voice.default") : v}
                      </button>
                    ))}
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-4 py-3 border-t border-border-weak-base">
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="text-14-medium text-text-strong">{t("settings.tts.singing.label")}</span>
                    <span class="text-12-regular text-text-weak">{t("settings.tts.singing.hint")}</span>
                  </div>
                  <div data-action="settings-tts-singing" class="flex w-full justify-end sm:w-auto sm:shrink-0">
                    <Toggle checked={settings.tts.singing()} onChange={(v) => settings.tts.setSinging(v)} />
                  </div>
                </div>

                <div class="flex flex-col gap-0.5 py-3 border-t border-border-weak-base">
                  <span class="text-14-medium text-text-strong">{t("settings.tts.tags.label")}</span>
                  <span class="text-12-regular text-text-weak">{t("settings.tts.tags.hint")}</span>
                </div>
              </Match>

              {/* Design: natural-language voice description */}
              <Match when={settings.tts.mode() === "design"}>
                <div class="flex flex-col gap-1.5 py-3 border-t border-border-weak-base">
                  <span class="text-14-medium text-text-strong">{t("settings.tts.design.label")}</span>
                  <span class="text-12-regular text-text-weak">{t("settings.tts.design.hint")}</span>
                  <textarea
                    data-action="settings-tts-design-prompt"
                    rows={4}
                    value={settings.tts.designPrompt()}
                    onInput={(e) => settings.tts.setDesignPrompt(e.currentTarget.value)}
                    placeholder={t("settings.tts.design.placeholder")}
                    class="mt-2 w-full text-14-regular bg-surface-raised-base border border-border-base rounded px-3 py-2 focus:outline-none focus:border-border-focused resize-y"
                  />
                </div>
                <div class="flex flex-wrap items-center gap-4 py-3 border-t border-border-weak-base">
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="text-14-medium text-text-strong">{t("settings.tts.optimizeTextPreview.label")}</span>
                    <span class="text-12-regular text-text-weak">{t("settings.tts.optimizeTextPreview.hint")}</span>
                  </div>
                  <div
                    data-action="settings-tts-optimize-text-preview"
                    class="flex w-full justify-end sm:w-auto sm:shrink-0"
                  >
                    <Toggle
                      checked={settings.tts.optimizeTextPreview()}
                      onChange={(v) => settings.tts.setOptimizeTextPreview(v)}
                    />
                  </div>
                </div>
              </Match>

              {/* Clone: reference audio upload */}
              <Match when={settings.tts.mode() === "clone"}>
                <div class="flex flex-col gap-1.5 py-3 border-t border-border-weak-base">
                  <span class="text-14-medium text-text-strong">{t("settings.tts.clone.label")}</span>
                  <span class="text-12-regular text-text-weak">{t("settings.tts.clone.hint")}</span>
                  <input
                    ref={fileInput}
                    type="file"
                    accept={CLONE_ACCEPT}
                    class="hidden"
                    onChange={onFileChange}
                  />
                  <div class="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      data-action="settings-tts-clone-choose"
                      onClick={onPickFile}
                      class="text-12-regular px-3 py-1.5 rounded border border-border-base text-text-base hover:bg-surface-raised-base transition-colors"
                    >
                      {t("settings.tts.clone.choose")}
                    </button>
                    <Show
                      when={settings.tts.clone.filename()}
                      fallback={<span class="text-12-regular text-text-weaker">{t("settings.tts.clone.none")}</span>}
                    >
                      <span class="text-12-regular text-text-weak truncate">
                        {t("settings.tts.clone.selected", { name: settings.tts.clone.filename() })}
                      </span>
                      <button
                        type="button"
                        data-action="settings-tts-clone-clear"
                        onClick={() => settings.tts.clone.clear()}
                        class="text-12-regular text-text-weak hover:text-text-base transition-colors"
                      >
                        {t("settings.tts.clone.clear")}
                      </button>
                    </Show>
                  </div>
                </div>
              </Match>
            </Switch>

            {/* Preview / 试听 */}
            <div class="flex flex-col gap-1.5 py-3 border-t border-border-weak-base">
              <span class="text-14-medium text-text-strong">{t("settings.tts.preview.label")}</span>
              <div class="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  data-action="settings-tts-preview-text"
                  value={sampleText()}
                  onInput={(e) =>
                    setCustomSampleText(
                      e.currentTarget.value === t("settings.tts.preview.sample") ? undefined : e.currentTarget.value,
                    )
                  }
                  placeholder={t("settings.tts.preview.sample")}
                  class="flex-1 text-14-regular bg-surface-raised-base border border-border-base rounded px-3 py-1.5 focus:outline-none focus:border-border-focused"
                />
                <button
                  type="button"
                  data-action="settings-tts-preview"
                  onClick={() => void preview()}
                  class="text-12-regular px-3 py-1.5 rounded border border-border-base text-text-base hover:bg-surface-raised-base transition-colors shrink-0"
                >
                  {previewing() ? t("settings.tts.preview.stop") : t("settings.tts.preview.play")}
                </button>
              </div>
            </div>
          </SettingsList>
        </div>
      </div>
    </div>
  )
}
