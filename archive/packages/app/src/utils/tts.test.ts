import { describe, expect, test } from "bun:test"
import { synthesizeSpeech } from "./tts"

describe("synthesizeSpeech", () => {
  test("serializes optimizeTextPreview for voice design requests", async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    await synthesizeSpeech({
      http: { url: "http://127.0.0.1:4096", username: "u", password: "p" },
      directory: "/repo",
      text: "念这句",
      mode: "design",
      designPrompt: "低沉的男声",
      optimizeTextPreview: false,
      fetch: async (url, init) => {
        calls.push({ url: String(url), init })
        return new Response(JSON.stringify({ audio: "AAAA", format: "wav" }), { status: 200 })
      },
    })

    expect(calls[0]?.url).toBe("http://127.0.0.1:4096/tts?directory=%2Frepo")
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      text: "念这句",
      mode: "design",
      designPrompt: "低沉的男声",
      optimizeTextPreview: false,
    })
  })

  test("does not serialize optimizeTextPreview for non-design requests", async () => {
    const calls: { init?: RequestInit }[] = []
    await synthesizeSpeech({
      http: { url: "http://127.0.0.1:4096" },
      directory: "/repo",
      text: "你好",
      mode: "preset",
      optimizeTextPreview: false,
      fetch: async (_, init) => {
        calls.push({ init })
        return new Response(JSON.stringify({ audio: "AAAA", format: "wav" }), { status: 200 })
      },
    })

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ text: "你好" })
  })
})
