import { describe, expect, test } from "bun:test"
import { attachmentTooltipRows } from "./image-attachment-tooltip"

describe("attachmentTooltipRows", () => {
  test("shows filename MIME file size encoded size and limit", () => {
    expect(
      attachmentTooltipRows({
        type: "audio",
        id: "voice",
        filename: "voice.mp3",
        mime: "audio/mpeg",
        dataUrl: "data:audio/mpeg;base64," + "A".repeat(4_000_000),
        sizeBytes: 3_000_000,
      }),
    ).toEqual([
      { label: "Name", value: "voice.mp3" },
      { label: "MIME", value: "audio/mpeg" },
      { label: "File", value: "3 MB" },
      { label: "Encoded", value: "4 MB / 50 MB" },
    ])
  })
})
