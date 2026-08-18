import { describe, expect, test } from "bun:test"

import config from "../../electron-builder.config"

describe("desktop microphone permission", () => {
  test("allows trusted renderer media permission requests", async () => {
    const source = await Bun.file(new URL("./windows.ts", import.meta.url)).text()

    expect(source).toContain('const mediaPermission = "media"')
    expect(source).toContain("rendererPermissions = new Set([clipboardWritePermission, notificationPermission, mediaPermission])")
    expect(source).toContain('mediaDetails.mediaTypes?.includes("audio")')
    expect(source).toContain('mediaDetails.mediaType === "audio"')
  })

  test("declares a macOS microphone usage description", () => {
    expect(config.mac?.extendInfo).toMatchObject({
      NSMicrophoneUsageDescription: expect.any(String),
    })
  })
})
