import { DataProvider } from "@opencode-ai/ui/context"
import { playReadAloudAudio } from "@opencode-ai/ui/message-part"
import { showToast } from "@opencode-ai/ui/toast"
import { base64Encode } from "@opencode-ai/core/util/encode"
import type { Message } from "@opencode-ai/sdk/v2/client"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, on, type ParentProps, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useProviders } from "@/hooks/use-providers"
import { useSettings } from "@/context/settings"
import { LocalProvider } from "@/context/local"
import { MimoProCelebrationProvider } from "@/context/mimo-pro-celebration"
import { SDKProvider } from "@/context/sdk"
import { useServer } from "@/context/server"
import { useSync } from "@/context/sync"
import { decode64 } from "@/utils/base64"
import { ReadAloudError, synthesizeSpeech } from "@/utils/tts"
import { Schema } from "effect"

function DirectoryDataProvider(props: ParentProps<{ directory: string }>) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const sync = useSync()
  const server = useServer()
  const language = useLanguage()
  const settings = useSettings()
  const providers = useProviders()
  const slug = createMemo(() => base64Encode(props.directory))

  const readAloud = async (input: { messageID: string; text: string }) => {
    const http = server.current?.http
    if (!http) return undefined
    const mode = settings.tts.mode()
    try {
      return await synthesizeSpeech({
        http,
        directory: props.directory,
        text: input.text,
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
    } catch (error) {
      const notConnected = error instanceof ReadAloudError && error.code === "ProviderNotConnected"
      showToast({
        title: language.t("provider.mimo.readAloud.error.title"),
        description: language.t(
          notConnected ? "provider.mimo.readAloud.error.notConnected" : "provider.mimo.readAloud.error.failed",
        ),
      })
      return undefined
    }
  }

  createEffect(() => {
    const next = sync.data.path.directory
    if (!next || next === props.directory) return
    const path = location.pathname.slice(slug().length + 1)
    navigate(`/${base64Encode(next)}${path}${location.search}${location.hash}`, { replace: true })
  })

  createResource(
    () => params.id,
    (id) => sync.session.sync(id),
  )

  // Auto-play (TTS read-aloud) the latest assistant reply the moment it
  // completes, when enabled. Reuses the shared singleton player so it
  // coordinates with the manual read-aloud button (one clip at a time).
  const liveAssistantID = createMemo(() => {
    const id = params.id
    if (!id) return undefined
    const messages = sync.data.message[id] as Message[] | undefined
    return messages?.findLast((message) => message.role === "assistant" && typeof message.time.completed !== "number")
      ?.id
  })
  createEffect(
    on(liveAssistantID, (current, previous) => {
      if (!previous || current) return // only the streaming → completed edge
      if (!settings.tts.autoplay()) return
      // Silently no-op when MiMo TTS isn't configured (provider disconnected
      // after the toggle was enabled) instead of error-toasting every reply.
      if (!providers.connected().some((provider) => provider.id === "mimo")) return
      const id = params.id
      if (!id) return
      // Guard against cross-session edges: the completed message must belong to
      // the session we're viewing and actually be finished.
      const messages = (sync.data.message[id] ?? []) as Message[]
      const message = messages.find((item) => item.id === previous)
      if (!message || message.role !== "assistant" || typeof message.time.completed !== "number") return
      const text = (sync.data.part[previous] ?? [])
        .flatMap((part) => (part.type === "text" && !part.synthetic && !part.ignored ? [part.text] : []))
        .join("\n")
        .trim()
      if (!text) return
      void readAloud({ messageID: previous, text }).then((result) => {
        if (result?.audio) playReadAloudAudio({ messageID: previous, audio: result.audio, format: result.format })
      })
    }),
  )

  return (
    <DataProvider
      data={sync.data}
      directory={props.directory}
      onNavigateToSession={(sessionID: string) => navigate(`/${slug()}/session/${sessionID}`)}
      onSessionHref={(sessionID: string) => `/${slug()}/session/${sessionID}`}
      onReadAloud={readAloud}
    >
      <LocalProvider>
        <MimoProCelebrationProvider>{props.children}</MimoProCelebrationProvider>
      </LocalProvider>
    </DataProvider>
  )
}

export const ProjectDirString = Schema.String.pipe(Schema.brand("ProjectDirString"))
export type ProjectDirString = Schema.Schema.Type<typeof ProjectDirString>

export function decodeDirectory(dir: string): ProjectDirString | undefined {
  const decoded = decode64(dir)
  if (!decoded) return
  return ProjectDirString.make(decoded)
}

export default function Layout(props: ParentProps) {
  const params = useParams()
  const language = useLanguage()
  const navigate = useNavigate()
  let invalid = ""

  const resolved = createMemo(() => {
    if (!params.dir) return ""
    return decodeDirectory(params.dir) ?? ""
  })

  createEffect(() => {
    const dir = params.dir
    if (!dir) return
    if (resolved()) {
      invalid = ""
      return
    }
    if (invalid === dir) return
    invalid = dir
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: language.t("directory.error.invalidUrl"),
    })
    navigate("/", { replace: true })
  })

  return (
    <Show when={resolved()} keyed>
      {(resolved) => (
        <SDKProvider directory={resolved}>
          <DirectoryDataProvider directory={resolved}>{props.children}</DirectoryDataProvider>
        </SDKProvider>
      )}
    </Show>
  )
}
