import { describe, expect, test } from "bun:test"
import {
  base64PayloadBytes,
  formatBytesDecimal,
  isMimoGovernedMediaMime,
  MIO_BASE64_MEDIA_LIMIT_BYTES,
  projectedBase64Bytes,
} from "../src/attachment-limits"

describe("MiMo attachment limits", () => {
  test("counts only the Base64 payload bytes in a data URL", () => {
    expect(base64PayloadBytes("data:image/png;base64,QUJDRA==")).toBe(8)
    expect(base64PayloadBytes("data:audio/mpeg;base64,")).toBe(0)
    expect(base64PayloadBytes("https://example.com/image.png")).toBeUndefined()
  })

  test("projects encoded bytes from raw input size", () => {
    expect(projectedBase64Bytes(0)).toBe(0)
    expect(projectedBase64Bytes(1)).toBe(4)
    expect(projectedBase64Bytes(2)).toBe(4)
    expect(projectedBase64Bytes(3)).toBe(4)
    expect(projectedBase64Bytes(4)).toBe(8)
  })

  test("governs image audio and supported video MIME types", () => {
    expect(isMimoGovernedMediaMime("image/png")).toBe(true)
    expect(isMimoGovernedMediaMime("audio/mpeg")).toBe(true)
    expect(isMimoGovernedMediaMime("audio/x-m4a")).toBe(true)
    expect(isMimoGovernedMediaMime("video/mp4")).toBe(true)
    expect(isMimoGovernedMediaMime("video/quicktime")).toBe(true)
    expect(isMimoGovernedMediaMime("video/x-msvideo")).toBe(true)
    expect(isMimoGovernedMediaMime("video/mp2t")).toBe(false)
    expect(isMimoGovernedMediaMime("application/pdf")).toBe(false)
    expect(isMimoGovernedMediaMime("text/plain")).toBe(false)
  })

  test("formats decimal byte values for tooltip copy", () => {
    expect(MIO_BASE64_MEDIA_LIMIT_BYTES).toBe(50_000_000)
    expect(formatBytesDecimal(999)).toBe("999 B")
    expect(formatBytesDecimal(1_500)).toBe("1.5 KB")
    expect(formatBytesDecimal(50_000_000)).toBe("50 MB")
  })
})
