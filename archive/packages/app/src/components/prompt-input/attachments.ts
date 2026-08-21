import { onMount } from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import { base64PayloadBytes } from "@opencode-ai/core/attachment-limits"
import { showToast } from "@opencode-ai/ui/toast"
import { usePrompt, type ContentPart, type MediaAttachmentPart } from "@/context/prompt"
import { useLanguage } from "@/context/language"
import { uuid } from "@/utils/uuid"
import { getCursorPosition } from "./editor-dom"
import { attachmentMime, mediaCategory } from "./files"
import { normalizePaste, pasteMode } from "./paste"
import { attachmentLimitError } from "./attachment-limit"

/** Drag feedback category derived from the dragged file's mime, when known. */
export type DragKind = "image" | "audio" | "video" | "pdf" | "@mention"

export function dataUrl(file: File, mime: string) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.addEventListener("error", () => resolve(""))
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : ""
      const idx = value.indexOf(",")
      if (idx === -1) {
        resolve(value)
        return
      }
      resolve(`data:${mime};base64,${value.slice(idx + 1)}`)
    })
    reader.readAsDataURL(file)
  })
}

type PromptAttachmentsInput = {
  editor: () => HTMLDivElement | undefined
  isDialogActive: () => boolean
  setDraggingType: (type: DragKind | null) => void
  focusEditor: () => void
  addPart: (part: ContentPart) => boolean
  readClipboardImage?: () => Promise<File | null>
}

type AttachmentLimitError = NonNullable<ReturnType<typeof attachmentLimitError>>
type AddResult =
  | { ok: true }
  | { ok: false; reason: "too_large"; error: AttachmentLimitError }
  | { ok: false; reason: "unsupported" | "not_ready" }

export function createPromptAttachments(input: PromptAttachmentsInput) {
  const prompt = usePrompt()
  const language = useLanguage()

  const warn = () => {
    showToast({
      title: language.t("prompt.toast.pasteUnsupported.title"),
      description: language.t("prompt.toast.pasteUnsupported.description"),
    })
  }

  const warnTooLarge = (error: AttachmentLimitError) => {
    showToast({
      title: language.t("prompt.toast.attachmentTooLarge.title"),
      description: language.t("prompt.toast.attachmentTooLarge.description", error),
    })
  }

  const add = async (file: File, toast = true): Promise<AddResult> => {
    const mime = await attachmentMime(file)
    if (!mime) {
      if (toast) warn()
      return { ok: false, reason: "unsupported" }
    }

    const projectedError = attachmentLimitError(file, mime)
    if (projectedError) {
      if (toast) warnTooLarge(projectedError)
      return { ok: false, reason: "too_large", error: projectedError }
    }

    const editor = input.editor()
    if (!editor) return { ok: false, reason: "not_ready" }

    const url = await dataUrl(file, mime)
    if (!url) return { ok: false, reason: "not_ready" }

    const payloadBytes = base64PayloadBytes(url)
    const payloadError = attachmentLimitError(file, mime, payloadBytes)
    if (payloadError) {
      if (toast) warnTooLarge(payloadError)
      return { ok: false, reason: "too_large", error: payloadError }
    }

    // Bucket the attachment by media category. Anything that isn't a
    // recognised image/audio/video/pdf (e.g. dropped text files) falls back to
    // the "image" part type, which serialises to a generic file part on the wire.
    const base = { id: uuid(), filename: file.name, mime, dataUrl: url, sizeBytes: file.size }
    const category = mediaCategory(mime)
    const attachment: MediaAttachmentPart =
      category === "audio"
        ? { type: "audio", ...base }
        : category === "video"
          ? { type: "video", ...base }
          : category === "pdf"
            ? { type: "pdf", ...base }
            : { type: "image", ...base }

    const cursor = prompt.cursor() ?? getCursorPosition(editor)
    prompt.set([...prompt.current(), attachment], cursor)
    return { ok: true }
  }

  const addAttachment = async (file: File) => (await add(file)).ok

  const addAttachments = async (files: File[], toast = true) => {
    let found = false
    let tooLarge: AttachmentLimitError | undefined

    for (const file of files) {
      const ok = await add(file, false)
      if (ok.ok) {
        found = true
        continue
      }
      if (ok.reason === "too_large") tooLarge ??= ok.error
    }

    if (tooLarge && toast) {
      warnTooLarge(tooLarge)
      return found
    }
    if (!found && files.length > 0 && toast) warn()
    return found
  }

  const removeAttachment = (id: string) => {
    const current = prompt.current()
    // Media parts (image/audio/video/pdf) all carry an `id`; text/file/agent
    // parts don't. Drop the media part whose id matches.
    const next = current.filter((part) => !("id" in part) || part.id !== id)
    prompt.set(next, prompt.cursor())
  }

  const handlePaste = async (event: ClipboardEvent) => {
    const clipboardData = event.clipboardData
    if (!clipboardData) return

    event.preventDefault()
    event.stopPropagation()

    const files = Array.from(clipboardData.items).flatMap((item) => {
      if (item.kind !== "file") return []
      const file = item.getAsFile()
      return file ? [file] : []
    })

    if (files.length > 0) {
      await addAttachments(files)
      return
    }

    const plainText = clipboardData.getData("text/plain") ?? ""

    // Desktop: Browser clipboard has no images and no text, try platform's native clipboard for images
    if (input.readClipboardImage && !plainText) {
      const file = await input.readClipboardImage()
      if (file) {
        await addAttachment(file)
        return
      }
    }

    if (!plainText) return

    const text = normalizePaste(plainText)

    const put = () => {
      if (input.addPart({ type: "text", content: text, start: 0, end: 0 })) return true
      input.focusEditor()
      return input.addPart({ type: "text", content: text, start: 0, end: 0 })
    }

    if (pasteMode(text) === "manual") {
      put()
      return
    }

    const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, text)
    if (inserted) return

    put()
  }

  const handleGlobalDragOver = (event: DragEvent) => {
    if (input.isDialogActive()) return

    event.preventDefault()
    const transfer = event.dataTransfer
    const hasFiles = transfer?.types.includes("Files")
    const hasText = transfer?.types.includes("text/plain")
    if (hasFiles) {
      // The file bytes aren't readable during dragover, but item mime types
      // usually are — use them to pick a more specific drop affordance.
      const item = Array.from(transfer?.items ?? []).find((i) => i.kind === "file")
      input.setDraggingType((item && mediaCategory(item.type)) ?? "image")
    } else if (hasText) {
      input.setDraggingType("@mention")
    }
  }

  const handleGlobalDragLeave = (event: DragEvent) => {
    if (input.isDialogActive()) return
    if (!event.relatedTarget) {
      input.setDraggingType(null)
    }
  }

  const handleGlobalDrop = async (event: DragEvent) => {
    if (input.isDialogActive()) return

    event.preventDefault()
    input.setDraggingType(null)

    const plainText = event.dataTransfer?.getData("text/plain")
    const filePrefix = "file:"
    if (plainText?.startsWith(filePrefix)) {
      const filePath = plainText.slice(filePrefix.length)
      input.focusEditor()
      input.addPart({ type: "file", path: filePath, content: "@" + filePath, start: 0, end: 0 })
      return
    }

    const dropped = event.dataTransfer?.files
    if (!dropped) return

    await addAttachments(Array.from(dropped))
  }

  onMount(() => {
    makeEventListener(document, "dragover", handleGlobalDragOver)
    makeEventListener(document, "dragleave", handleGlobalDragLeave)
    makeEventListener(document, "drop", handleGlobalDrop)
  })

  return {
    addAttachment,
    addAttachments,
    removeAttachment,
    handlePaste,
  }
}
