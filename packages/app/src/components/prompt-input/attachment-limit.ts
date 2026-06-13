import {
  formatBytesDecimal,
  isMimoGovernedMediaMime,
  MIO_BASE64_MEDIA_LIMIT_BYTES,
  projectedBase64Bytes,
} from "@opencode-ai/core/attachment-limits"

export function attachmentLimitError(file: Pick<File, "name" | "size">, mime: string, encodedBytes?: number) {
  if (!isMimoGovernedMediaMime(mime)) return undefined

  const bytes = encodedBytes ?? projectedBase64Bytes(file.size)
  if (bytes <= MIO_BASE64_MEDIA_LIMIT_BYTES) return undefined

  return {
    filename: file.name,
    size: formatBytesDecimal(bytes),
    limit: formatBytesDecimal(MIO_BASE64_MEDIA_LIMIT_BYTES),
  }
}
