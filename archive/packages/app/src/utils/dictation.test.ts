import { describe, expect, test } from "bun:test"
import { asrLanguageFromLocale, DictationError, transcribeDictation } from "./dictation"

describe("asrLanguageFromLocale", () => {
  test("maps Chinese locales to zh, English to en, others to auto", () => {
    expect(asrLanguageFromLocale("zh")).toBe("zh")
    expect(asrLanguageFromLocale("zht")).toBe("zh")
    expect(asrLanguageFromLocale("en")).toBe("en")
    expect(asrLanguageFromLocale("ja")).toBe("auto")
    expect(asrLanguageFromLocale("fr")).toBe("auto")
  })
})

describe("transcribeDictation", () => {
  test("posts audio and asr language to the workspace dictation endpoint", async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const result = await transcribeDictation({
      http: { url: "http://127.0.0.1:4096", username: "u", password: "p" },
      directory: "/repo",
      audio: { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav", durationSeconds: 1 },
      language: "zh",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init })
        return new Response(JSON.stringify({ text: "hello world", usage: { inputTokens: 12 } }), { status: 200 })
      },
    })

    expect(result.text).toBe("hello world")
    expect(calls[0]?.url).toBe("http://127.0.0.1:4096/dictation?directory=%2Frepo")
    expect(calls[0]?.init?.method).toBe("POST")
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      audio: { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav", durationSeconds: 1 },
      language: "zh",
    })
  })

  test("omits language from the request body when unset", async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    await transcribeDictation({
      http: { url: "http://127.0.0.1:4096" },
      directory: "/repo",
      audio: { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav", durationSeconds: 1 },
      fetch: async (url, init) => {
        calls.push({ url: String(url), init })
        return new Response(JSON.stringify({ text: "hi" }), { status: 200 })
      },
    })

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      audio: { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav", durationSeconds: 1 },
    })
  })

  test("throws a typed error when MiMo is not connected", async () => {
    await expect(
      transcribeDictation({
        http: { url: "http://127.0.0.1:4096" },
        directory: "/repo",
        audio: { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav" },
        fetch: async () => new Response("ProviderNotConnected", { status: 400 }),
      }),
    ).rejects.toMatchObject({ name: "DictationError", code: "ProviderNotConnected", status: 400 } satisfies Partial<
      DictationError
    >)
  })

  test("maps backend audio rejection errors to typed dictation errors", async () => {
    await expect(
      transcribeDictation({
        http: { url: "http://127.0.0.1:4096" },
        directory: "/repo",
        audio: { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav" },
        fetch: async () => new Response("dictation audio rejected: no_speech", { status: 400 }),
      }),
    ).rejects.toMatchObject({ name: "DictationError", code: "no_speech", status: 400 } satisfies Partial<
      DictationError
    >)

    await expect(
      transcribeDictation({
        http: { url: "http://127.0.0.1:4096" },
        directory: "/repo",
        audio: { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav" },
        fetch: async () => new Response("dictation audio rejected: too_short", { status: 400 }),
      }),
    ).rejects.toMatchObject({ name: "DictationError", code: "too_short", status: 400 } satisfies Partial<
      DictationError
    >)
  })

  test("maps an empty ASR transcript to a no_speech error (server 400)", async () => {
    await expect(
      transcribeDictation({
        http: { url: "http://127.0.0.1:4096" },
        directory: "/repo",
        audio: { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav" },
        fetch: async () => new Response("dictation no_speech: model returned no transcript", { status: 400 }),
      }),
    ).rejects.toMatchObject({ name: "DictationError", code: "no_speech", status: 400 } satisfies Partial<
      DictationError
    >)
  })

  test("maps a 200 response with blank text to a no_speech error", async () => {
    await expect(
      transcribeDictation({
        http: { url: "http://127.0.0.1:4096" },
        directory: "/repo",
        audio: { dataUrl: "data:audio/wav;base64,AAAA", mime: "audio/wav" },
        fetch: async () => new Response(JSON.stringify({ text: "   " }), { status: 200 }),
      }),
    ).rejects.toMatchObject({ name: "DictationError", code: "no_speech" } satisfies Partial<DictationError>)
  })
})
