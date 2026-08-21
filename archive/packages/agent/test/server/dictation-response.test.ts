import { describe, expect, test } from "bun:test"
import { transcribedText } from "@/server/routes/instance/httpapi/handlers/dictation"

describe("transcribedText", () => {
  test("reads direct message content", () => {
    expect(transcribedText(response({ content: "  hello world  " }))).toBe("hello world")
  })

  test("joins text parts from array message content", () => {
    expect(transcribedText(response({ content: [{ text: "hello" }, { text: " world" }] }))).toBe("hello world")
  })

  test("falls back to MiMo audio reasoning_content when content is empty", () => {
    expect(
      transcribedText(
        response({
          content: "",
          reasoning_content: "Good morning. Could you tell me what the weather will be like today?",
        }),
      ),
    ).toBe("Good morning. Could you tell me what the weather will be like today?")
  })

  test("returns empty text when no transcript fields are present", () => {
    expect(transcribedText(response({ content: "" }))).toBe("")
  })
})

function response(message: { content?: unknown; reasoning_content?: unknown }) {
  return {
    choices: [
      {
        message,
      },
    ],
  }
}
