import { describe, expect, test } from "bun:test"
import { MODELS } from "@opencode-ai/core/mimo-catalog"

describe("MiMo static catalog", () => {
  test("marks only MiMo V2.5 as multimodal input", () => {
    expect(MODELS["mimo-v2.5"].capabilities.input).toEqual(["text", "image/*", "audio/*", "video/*"])
    expect(MODELS["mimo-v2.5-pro"].capabilities.input).toEqual(["text"])
  })

  test("uses official 128K output limit for MiMo V2.5 models", () => {
    expect(MODELS["mimo-v2.5"].limit.output).toBe(128_000)
    expect(MODELS["mimo-v2.5-pro"].limit.output).toBe(128_000)
  })
})
