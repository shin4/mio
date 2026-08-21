import type { ServerConnection } from "@/context/server"
import type { Locale } from "@/context/language"
import { authTokenFromCredentials } from "@/utils/auth"

export type DictationAudio = {
  dataUrl: string
  mime: string
  durationSeconds?: number
}

export type DictationLanguage = "auto" | "zh" | "en"

// MiMo ASR (mimo-v2.5-asr) accepts auto/zh/en. Map the UI locale onto it; Traditional Chinese
// (zht) folds into "zh", and any other UI language falls back to automatic detection.
export function asrLanguageFromLocale(locale: Locale): DictationLanguage {
  if (locale === "zh" || locale === "zht") return "zh"
  if (locale === "en") return "en"
  return "auto"
}

export type DictationUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cacheReadInputTokens?: number
  audioTokens?: number
}

export type TranscribeDictationResult = {
  text: string
  usage?: DictationUsage
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class DictationError extends Error {
  readonly code?: string
  readonly status?: number
  constructor(message: string, code?: string, status?: number) {
    super(message)
    this.name = "DictationError"
    this.code = code
    this.status = status
  }
}

export async function transcribeDictation(input: {
  http: ServerConnection.HttpBase
  directory: string
  audio: DictationAudio
  language?: DictationLanguage
  fetch?: Fetcher
}): Promise<TranscribeDictationResult> {
  const base = input.http.url.replace(/\/+$/, "")
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (input.http.password) {
    headers["Authorization"] = `Basic ${authTokenFromCredentials({
      username: input.http.username,
      password: input.http.password,
    })}`
  }
  const response = await (input.fetch ?? fetch)(`${base}/dictation?directory=${encodeURIComponent(input.directory)}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      audio: input.audio,
      ...(input.language ? { language: input.language } : {}),
    }),
  })

  if (!response.ok) {
    let detail = ""
    try {
      detail = await response.text()
    } catch {
      // fall back to the status code
    }
    const notConnected = response.status === 400 && detail.includes("ProviderNotConnected")
    const audioRejectionCode =
      response.status !== 400
        ? undefined
        : detail.includes("too_short")
          ? "too_short"
          : detail.includes("no_speech")
            ? "no_speech"
            : undefined
    throw new DictationError(
      detail || `HTTP ${response.status}`,
      notConnected ? "ProviderNotConnected" : audioRejectionCode,
      response.status,
    )
  }

  const json = (await response.json()) as TranscribeDictationResult
  if (!json?.text?.trim()) throw new DictationError("Dictation returned no text", "no_speech")
  return { text: json.text, usage: json.usage }
}
