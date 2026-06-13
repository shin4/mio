import { beforeEach, describe, expect, mock, test } from "bun:test"
import { MIO_BASE64_MEDIA_LIMIT_BYTES } from "@opencode-ai/core/attachment-limits"
import { attachmentLimitError } from "./attachment-limit"
import { attachmentMime, mediaCategory } from "./files"
import { pasteMode } from "./paste"

type ToastCall = {
  title: string
  description?: string
}

type PromptPart = {
  type: string
  filename?: string
}

const toastCalls: ToastCall[] = []
let promptParts: PromptPart[] = []

mock.module("@opencode-ai/ui/toast", () => ({
  showToast: (call: ToastCall) => {
    toastCalls.push(call)
  },
}))

mock.module("@/context/language", () => ({
  useLanguage: () => ({
    t: (key: string, params?: Record<string, string>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))

mock.module("@/context/prompt", () => ({
  usePrompt: () => ({
    current: () => promptParts,
    cursor: () => 0,
    set: (next: PromptPart[]) => {
      promptParts = next
    },
  }),
}))

class TestFileReader extends EventTarget {
  result: string | ArrayBuffer | null = null

  readAsDataURL(file: File) {
    file.arrayBuffer().then(
      (buffer) => {
        this.result = `data:${file.type};base64,${Buffer.from(buffer).toString("base64")}`
        this.dispatchEvent(new Event("load"))
      },
      () => this.dispatchEvent(new Event("error")),
    )
  }
}

beforeEach(() => {
  toastCalls.length = 0
  promptParts = []
  Object.defineProperty(globalThis, "FileReader", {
    value: TestFileReader,
    configurable: true,
  })
})

describe("attachmentMime", () => {
  test("keeps PDFs when the browser reports the mime", async () => {
    const file = new File(["%PDF-1.7"], "guide.pdf", { type: "application/pdf" })
    expect(await attachmentMime(file)).toBe("application/pdf")
  })

  test("accepts mp4/webm/mov videos", async () => {
    expect(await attachmentMime(new File([Uint8Array.of(0, 1)], "clip.mp4", { type: "video/mp4" }))).toBe("video/mp4")
    expect(await attachmentMime(new File([Uint8Array.of(0, 1)], "clip.webm", { type: "video/webm" }))).toBe(
      "video/webm",
    )
    // .mov with no/unknown browser mime resolves via the extension fallback.
    expect(await attachmentMime(new File([Uint8Array.of(0, 1)], "clip.mov", { type: "" }))).toBe("video/quicktime")
  })

  test("accepts mp3/wav/flac/m4a/ogg audio", async () => {
    expect(await attachmentMime(new File([Uint8Array.of(0, 1)], "voice.mp3", { type: "audio/mpeg" }))).toBe(
      "audio/mpeg",
    )
    expect(await attachmentMime(new File([Uint8Array.of(0, 1)], "voice.wav", { type: "audio/wav" }))).toBe("audio/wav")
    // Browser MIME variants (audio/x-*) are accepted via the broad audio/ match.
    expect(await attachmentMime(new File([Uint8Array.of(0, 1)], "voice.flac", { type: "audio/x-flac" }))).toBe(
      "audio/x-flac",
    )
    // .m4a with no browser mime resolves via the extension fallback.
    expect(await attachmentMime(new File([Uint8Array.of(0, 1)], "voice.m4a", { type: "" }))).toBe("audio/mp4")
  })

  test("normalizes structured text types to text/plain", async () => {
    const file = new File(['{"ok":true}\n'], "data.json", { type: "application/json" })
    expect(await attachmentMime(file)).toBe("text/plain")
  })

  test("accepts text files even with a misleading browser mime", async () => {
    const file = new File(["export const x = 1\n"], "main.ts", { type: "video/mp2t" })
    expect(await attachmentMime(file)).toBe("text/plain")
  })

  test("rejects binary files", async () => {
    const file = new File([Uint8Array.of(0, 255, 1, 2)], "blob.bin", { type: "application/octet-stream" })
    expect(await attachmentMime(file)).toBeUndefined()
  })
})

describe("mediaCategory", () => {
  test("buckets image/audio/video/pdf and ignores the rest", () => {
    expect(mediaCategory("image/png")).toBe("image")
    expect(mediaCategory("audio/mpeg")).toBe("audio")
    expect(mediaCategory("audio/wav")).toBe("audio")
    expect(mediaCategory("audio/x-m4a")).toBe("audio")
    expect(mediaCategory("video/mp4")).toBe("video")
    expect(mediaCategory("application/pdf")).toBe("pdf")
    // `.ts` source files report as video/mp2t — must NOT be treated as video.
    expect(mediaCategory("video/mp2t")).toBeUndefined()
    expect(mediaCategory("text/plain")).toBeUndefined()
  })
})

describe("attachmentLimitError", () => {
  test("accepts governed media at the Base64 boundary", () => {
    const bytes = Math.floor((MIO_BASE64_MEDIA_LIMIT_BYTES / 4) * 3)
    expect(attachmentLimitError({ name: "boundary.png", size: bytes }, "image/png")).toBeUndefined()
  })

  test("rejects oversized image audio and video attachments", () => {
    const bytes = 40_000_000

    expect(attachmentLimitError({ name: "image.png", size: bytes }, "image/png")).toEqual({
      filename: "image.png",
      limit: "50 MB",
      size: "53.3 MB",
    })
    expect(attachmentLimitError({ name: "audio.mp3", size: bytes }, "audio/mpeg")).toEqual({
      filename: "audio.mp3",
      limit: "50 MB",
      size: "53.3 MB",
    })
    expect(attachmentLimitError({ name: "video.mp4", size: bytes }, "video/mp4")).toEqual({
      filename: "video.mp4",
      limit: "50 MB",
      size: "53.3 MB",
    })
  })

  test("does not govern PDFs or text attachments", () => {
    const bytes = 40_000_000

    expect(attachmentLimitError({ name: "guide.pdf", size: bytes }, "application/pdf")).toBeUndefined()
    expect(attachmentLimitError({ name: "notes.txt", size: bytes }, "text/plain")).toBeUndefined()
  })
})

describe("createPromptAttachments addAttachments", () => {
  const createAttachments = async () => {
    const { createPromptAttachments } = await import("./attachments")
    return createPromptAttachments({
      editor: () => ({}) as HTMLDivElement,
      isDialogActive: () => false,
      setDraggingType: () => {},
      focusEditor: () => {},
      addPart: () => true,
    })
  }

  test("shows the too-large toast for a batch with one oversized media attachment", async () => {
    const attachments = await createAttachments()
    const result = await attachments.addAttachments([
      { name: "large.png", size: 40_000_000, type: "image/png" } as File,
    ])

    expect(result).toBe(false)
    expect(toastCalls.map((call) => call.title)).toEqual(["prompt.toast.attachmentTooLarge.title"])
    expect(toastCalls[0]?.description).toContain("large.png")
  })

  test("adds accepted files and still reports an oversized media attachment in the same batch", async () => {
    const attachments = await createAttachments()
    const result = await attachments.addAttachments([
      new File([Uint8Array.of(1, 2, 3)], "small.png", { type: "image/png" }),
      { name: "large.mp3", size: 40_000_000, type: "audio/mpeg" } as File,
    ])

    expect(result).toBe(true)
    expect(promptParts.map((part) => part.filename)).toEqual(["small.png"])
    expect(toastCalls.map((call) => call.title)).toEqual(["prompt.toast.attachmentTooLarge.title"])
    expect(toastCalls[0]?.description).toContain("large.mp3")
  })

  test("keeps the unsupported toast for a batch with only unsupported files", async () => {
    const attachments = await createAttachments()
    const result = await attachments.addAttachments([
      new File([Uint8Array.of(0, 255, 1, 2)], "blob.bin", { type: "application/octet-stream" }),
    ])

    expect(result).toBe(false)
    expect(toastCalls.map((call) => call.title)).toEqual(["prompt.toast.pasteUnsupported.title"])
  })
})

describe("pasteMode", () => {
  test("uses native paste for short single-line text", () => {
    expect(pasteMode("hello world")).toBe("native")
  })

  test("uses manual paste for multiline text", () => {
    expect(
      pasteMode(`{
  "ok": true
}`),
    ).toBe("manual")
    expect(pasteMode("a\r\nb")).toBe("manual")
  })

  test("uses manual paste for large text", () => {
    expect(pasteMode("x".repeat(8000))).toBe("manual")
  })
})
