import { ACCEPTED_FILE_TYPES, ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES } from "@/constants/file-picker"

export { ACCEPTED_FILE_TYPES }

const IMAGE_MIMES = new Set(ACCEPTED_IMAGE_TYPES)
const VIDEO_MIMES = new Set(ACCEPTED_VIDEO_TYPES)
const IMAGE_EXTS = new Map([
  ["gif", "image/gif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
])
const VIDEO_EXTS = new Map([
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
  ["mov", "video/quicktime"],
])
const AUDIO_EXTS = new Map([
  ["mp3", "audio/mpeg"],
  ["wav", "audio/wav"],
  ["flac", "audio/flac"],
  ["m4a", "audio/mp4"],
  ["ogg", "audio/ogg"],
  ["aac", "audio/aac"],
  ["opus", "audio/ogg"],
])

/** Media category for an accepted mime, used to bucket prompt attachments. */
export type MediaCategory = "image" | "audio" | "video" | "pdf"

export function mediaCategory(mime: string): MediaCategory | undefined {
  const type = kind(mime)
  if (type.startsWith("image/")) return "image"
  // Broad `audio/*` match is safe: no source-file type is reported as audio/*
  // (unlike `.ts` → video/mp2t, which is why video uses an explicit allow-list).
  if (type.startsWith("audio/")) return "audio"
  if (VIDEO_MIMES.has(type)) return "video"
  if (type === "application/pdf") return "pdf"
  return undefined
}
const TEXT_MIMES = new Set([
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
])

const SAMPLE = 4096

function kind(type: string) {
  return type.split(";", 1)[0]?.trim().toLowerCase() ?? ""
}

function ext(name: string) {
  const idx = name.lastIndexOf(".")
  if (idx === -1) return ""
  return name.slice(idx + 1).toLowerCase()
}

function textMime(type: string) {
  if (!type) return false
  if (type.startsWith("text/")) return true
  if (TEXT_MIMES.has(type)) return true
  if (type.endsWith("+json")) return true
  return type.endsWith("+xml")
}

function textBytes(bytes: Uint8Array) {
  if (bytes.length === 0) return true
  let count = 0
  for (const byte of bytes) {
    if (byte === 0) return false
    if (byte < 9 || (byte > 13 && byte < 32)) count += 1
  }
  return count / bytes.length <= 0.3
}

export async function attachmentMime(file: File) {
  const type = kind(file.type)
  if (IMAGE_MIMES.has(type)) return type
  // Broad `audio/*` match (see mediaCategory): no source file reports as audio/*.
  if (type.startsWith("audio/")) return type
  // Explicit video allow-list only: `.ts` files masquerade as `video/mp2t`.
  if (VIDEO_MIMES.has(type)) return type
  if (type === "application/pdf") return type

  const suffix = ext(file.name)
  const fallback =
    IMAGE_EXTS.get(suffix) ??
    AUDIO_EXTS.get(suffix) ??
    VIDEO_EXTS.get(suffix) ??
    (suffix === "pdf" ? "application/pdf" : undefined)
  if ((!type || type === "application/octet-stream") && fallback) return fallback

  if (textMime(type)) return "text/plain"
  const bytes = new Uint8Array(await file.slice(0, SAMPLE).arrayBuffer())
  if (!textBytes(bytes)) return
  return "text/plain"
}
