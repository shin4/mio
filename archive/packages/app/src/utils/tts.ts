import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/auth"

export type SynthesizeSpeechResult = { audio: string; format: string }

export type TtsMode = "preset" | "design" | "clone"
export type TtsReferenceAudio = { dataUrl: string; mime: string; filename?: string }
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * Error from the /tts endpoint. `code` mirrors the server's structured error
 * name when detectable (e.g. "ProviderNotConnected") so callers can show a
 * targeted message.
 */
export class ReadAloudError extends Error {
  readonly code?: string
  readonly status?: number
  constructor(message: string, code?: string, status?: number) {
    super(message)
    this.name = "ReadAloudError"
    this.code = code
    this.status = status
  }
}

/**
 * Call the agent server's POST /tts (MiMo TTS) and return the synthesized
 * audio. The voice is applied server-side from the saved MiMo setting, so the
 * caller passes text only (an explicit `voice` overrides it).
 */
export async function synthesizeSpeech(input: {
  http: ServerConnection.HttpBase
  directory: string
  text: string
  voice?: string
  mode?: TtsMode
  designPrompt?: string
  optimizeTextPreview?: boolean
  referenceAudio?: TtsReferenceAudio
  singing?: boolean
  fetch?: Fetcher
}): Promise<SynthesizeSpeechResult> {
  const base = input.http.url.replace(/\/+$/, "")
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (input.http.password) {
    headers["Authorization"] = `Basic ${authTokenFromCredentials({
      username: input.http.username,
      password: input.http.password,
    })}`
  }
  const url = `${base}/tts?directory=${encodeURIComponent(input.directory)}`
  const doFetch = input.fetch ?? fetch
  const mode = input.mode ?? "preset"
  const response = await doFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: input.text,
      ...(mode !== "preset" ? { mode } : {}),
      // Only send the field each mode needs, to keep the body small (the clone
      // reference audio can be ~13MB base64).
      ...(mode === "preset" && input.voice ? { voice: input.voice } : {}),
      ...(mode === "preset" && input.singing ? { singing: true } : {}),
      ...(mode === "design" && input.designPrompt ? { designPrompt: input.designPrompt } : {}),
      ...(mode === "design" && input.optimizeTextPreview !== undefined
        ? { optimizeTextPreview: input.optimizeTextPreview }
        : {}),
      ...(mode === "clone" && input.referenceAudio ? { referenceAudio: input.referenceAudio } : {}),
    }),
  })
  if (!response.ok) {
    let detail = ""
    try {
      detail = await response.text()
    } catch {
      // ignore — fall back to the status code below
    }
    const notConnected = response.status === 400 && detail.includes("ProviderNotConnected")
    throw new ReadAloudError(
      detail || `HTTP ${response.status}`,
      notConnected ? "ProviderNotConnected" : undefined,
      response.status,
    )
  }
  const json = (await response.json()) as { audio?: string; format?: string }
  if (!json?.audio) throw new ReadAloudError("TTS returned no audio")
  return { audio: json.audio, format: json.format ?? "wav" }
}
