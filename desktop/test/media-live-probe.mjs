// Opt-in live probe: which MiMo chat models accept audio, video and PDF input on the Chat Completions
// endpoint. Measures the provider API directly; dsh has no content path for these media.
// MIO_API_KEY (or MIMO_API_KEY); MIO_REGION (cn/sgp/ams) for a `tp-` key.
// Run from desktop/: node test/media-live-probe.mjs <samples-dir>
// The samples directory holds speech.wav and speech.mp3 saying "The secret code is forty two blue
// apples.", video.mp4 showing red for two seconds then green, and doc.pdf reading
// "MIO PDF CODE 58 ORANGE".
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { upstream } from "../../script/desktop/prepare.mjs"

const key = process.env.MIO_API_KEY ?? process.env.MIMO_API_KEY
assert.ok(key, "Set MIO_API_KEY for this explicitly opt-in live probe")
const samples = process.argv[2]
assert.ok(samples, "Pass the samples directory")
const region = key.startsWith("tp-") ? (process.env.MIO_REGION ?? "cn") : undefined
const baseURL = region ? `https://token-plan-${region}.xiaomimimo.com/v1` : "https://api.xiaomimimo.com/v1"
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" }
const redact = (value) => value.replaceAll(key, "[REDACTED]")
const dataUrl = async (file, mime) => `data:${mime};base64,${(await readFile(join(samples, file))).toString("base64")}`

const CASES = [
  {
    id: "audio-wav",
    part: { type: "input_audio", input_audio: { data: await dataUrl("speech.wav", "audio/wav") } },
    question: "Transcribe the speech in the audio, then state the secret code.",
    expect: /42|forty[- ]two/i,
  },
  {
    id: "audio-mp3",
    part: { type: "input_audio", input_audio: { data: await dataUrl("speech.mp3", "audio/mpeg") } },
    question: "Transcribe the speech in the audio, then state the secret code.",
    expect: /42|forty[- ]two/i,
  },
  {
    id: "video-mp4",
    part: { type: "video_url", video_url: { url: await dataUrl("video.mp4", "video/mp4") }, fps: 2, media_resolution: "default" },
    question: "The video shows two solid colors one after another. Name them in order, as: first=<color>, second=<color>",
    expect: /first\s*=\s*red[\s\S]*second\s*=\s*green/i,
  },
  {
    id: "pdf",
    part: { type: "file", file: { file_data: await dataUrl("doc.pdf", "application/pdf") } },
    question: "Quote the exact text written in the PDF.",
    expect: /58[\s\S]*orange|orange[\s\S]*58/i,
  },
]

const listed = await fetch(`${baseURL}/models`, { headers }).then((r) => r.json())
const available = (listed.data ?? []).map((m) => m.id).sort((a, b) => a.localeCompare(b))
const models = available.filter((id) => !/tts|asr|voice/i.test(id))
const report = { date: new Date().toISOString(), billing: region ? `token-plan-${region}` : "pay-as-you-go", available, results: [] }

try {
  for (const model of models) {
    for (const test of CASES) {
      const start = Date.now()
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          model,
          thinking: { type: "disabled" },
          max_completion_tokens: 512,
          messages: [{ role: "user", content: [test.part, { type: "text", text: test.question }] }],
        }),
      }).catch((error) => ({ ok: false, status: 0, text: async () => String(error) }))
      const raw = await response.text()
      const body = (() => {
        try {
          return JSON.parse(raw)
        } catch {
          return undefined
        }
      })()
      const text = body?.choices?.[0]?.message?.content ?? ""
      const result = {
        model,
        case: test.id,
        status: response.status,
        milliseconds: Date.now() - start,
        correct: response.ok && test.expect.test(text),
        text: redact(text).slice(0, 300),
        error: response.ok ? undefined : redact(body?.error?.message ?? raw).slice(0, 300),
        promptTokens: body?.usage?.prompt_tokens_details ?? undefined,
      }
      report.results.push(result)
      console.log("MEDIA_RESULT", JSON.stringify(result))
    }
  }
} finally {
  await writeFile(join(upstream, "../media-live-validation.json"), redact(JSON.stringify(report, null, 2)))
}
