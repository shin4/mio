import {
  base64PayloadBytes,
  formatBytesDecimal,
  isMimoGovernedMediaMime,
  MIO_BASE64_MEDIA_LIMIT_BYTES,
} from "@opencode-ai/core/attachment-limits"
import type { MediaAttachmentPart } from "@/context/prompt"

export function attachmentTooltipRows(attachment: MediaAttachmentPart) {
  const payloadBytes = base64PayloadBytes(attachment.dataUrl)
  return [
    { label: "Name", value: attachment.filename },
    { label: "MIME", value: attachment.mime },
    ...(attachment.sizeBytes === undefined ? [] : [{ label: "File", value: formatBytesDecimal(attachment.sizeBytes) }]),
    ...(payloadBytes === undefined || !isMimoGovernedMediaMime(attachment.mime)
      ? []
      : [
          {
            label: "Encoded",
            value: `${formatBytesDecimal(payloadBytes)} / ${formatBytesDecimal(MIO_BASE64_MEDIA_LIMIT_BYTES)}`,
          },
        ]),
  ]
}
