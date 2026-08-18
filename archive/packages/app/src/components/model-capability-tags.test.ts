import { describe, expect, test } from "bun:test"
import { modelCapabilityTags } from "./model-capability-tags"

const input = (value: Partial<Record<"text" | "audio" | "image" | "video" | "pdf", boolean>>) => ({
  text: false,
  audio: false,
  image: false,
  video: false,
  pdf: false,
  ...value,
})

describe("modelCapabilityTags", () => {
  test("returns text only for mimo-v2.5-pro input capabilities", () => {
    expect(modelCapabilityTags(input({ text: true }))).toEqual(["text"])
  })

  test("returns text audio and video for mimo-v2.5 input capabilities", () => {
    expect(modelCapabilityTags(input({ text: true, audio: true, image: true, video: true, pdf: true }))).toEqual([
      "text",
      "audio",
      "video",
    ])
  })

  test("does not show image or pdf as capability tags", () => {
    expect(modelCapabilityTags(input({ image: true, pdf: true }))).toEqual([])
  })
})
