const SUPPORTED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/avi",
  "video/msvideo",
  "video/x-msvideo",
  "video/x-ms-wmv",
])

export const MIO_BASE64_MEDIA_LIMIT_BYTES = 50_000_000

// MiMo ASR (mimo-v2.5-asr) caps the base64-encoded audio payload at 10MB.
export const MIO_ASR_BASE64_LIMIT_BYTES = 10_000_000

function cleanMime(mime: string) {
  return mime.split(";", 1)[0]?.trim().toLowerCase() ?? ""
}

export function base64PayloadBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",")
  if (comma === -1 || !dataUrl.slice(0, comma).toLowerCase().includes(";base64")) return undefined
  return dataUrl.length - comma - 1
}

export function projectedBase64Bytes(rawBytes: number) {
  return Math.ceil(rawBytes / 3) * 4
}

export function isMimoGovernedMediaMime(mime: string) {
  const type = cleanMime(mime)
  if (type.startsWith("image/")) return true
  if (type.startsWith("audio/")) return true
  return SUPPORTED_VIDEO_MIMES.has(type)
}

export function formatBytesDecimal(bytes: number) {
  if (bytes < 1_000) return `${bytes} B`
  if (bytes < 1_000_000) return `${Number((bytes / 1_000).toFixed(1))} KB`
  if (bytes < 1_000_000_000) return `${Number((bytes / 1_000_000).toFixed(1))} MB`
  return `${Number((bytes / 1_000_000_000).toFixed(1))} GB`
}
