#!/usr/bin/env bun
/**
 * Capture the REAL MiMo outputs that back the landing-page "Try it" playground.
 *
 * The playground (docs/index.html → #playground) replays pre-captured MiMo
 * responses with a fake-live typewriter reveal. The honesty chip on every panel
 * ("Recorded real MiMo output") is only true because the outputs in
 * docs/assets/playground/demos.json were genuinely produced by MiMo — this
 * script is what produces them. Re-run it when the model improves so the demos
 * never go stale. See docs/superpowers/specs/2026-06-08-multimodal-playground-design.md.
 *
 * It POSTs each sample's input + a fixed prompt straight to MiMo's
 * `${MIO_BASE_URL}/chat/completions` (stream:false), using the exact wire
 * shapes the agent server uses (api-key header; OpenAI-compatible multimodal
 * content parts; ASR via mimo-v2.5-asr + asr_options). It then writes the
 * captured text/code back into demos.json (creating it from the SOURCES seed if
 * missing), stamping meta.model + meta.capturedAt.
 *
 * Unlike gen-promo-tts.ts (which talks to a running agent's /tts endpoint), this
 * script needs no running server — it calls the MiMo API directly with creds
 * from the environment.
 *
 * Required env:
 *   MIO_API_KEY     MiMo API key (sent as the `api-key` header)
 *   MIO_BASE_URL    MiMo API base, e.g. https://api.example.com/v1
 *                    ("/chat/completions" is appended to it)
 * Optional env:
 *   MIO_CHAT_MODEL  chat/vision/video model id (default "mimo-v2.5")
 *
 * Prereqs:
 *   - The sample assets exist under docs/assets/playground/{img2code,video,voice}/.
 *     Missing assets are warned about and skipped — the run never hard-fails on
 *     them. Vision needs a raster image (PNG/JPG), not an .svg; ASR needs a WAV.
 *
 * Run from the repo root (this is a maintainer tool — run once with real assets):
 *   MIO_API_KEY=sk-... MIO_BASE_URL=https://api.example.com/v1 \
 *     bun run script/gen-playground.ts
 */

import path from "node:path"

const API_KEY = process.env["MIO_API_KEY"]
const BASE_URL = process.env["MIO_BASE_URL"]?.replace(/\/+$/, "")
const CHAT_MODEL = process.env["MIO_CHAT_MODEL"] ?? "mimo-v2.5"
// MiMo's dedicated ASR model — fixed, matching the agent's DICTATION_MODEL.
const ASR_MODEL = "mimo-v2.5-asr"
// MiMo's TTS model — used to synthesize the voice-demo clips when absent.
const TTS_MODEL = "mimo-v2.5-tts"

const ROOT = path.resolve(import.meta.dir, "..")
const DOCS = path.join(ROOT, "docs")
const DEMOS_PATH = path.join(DOCS, "assets", "playground", "demos.json")

// =============================================================================
// Capture jobs
// =============================================================================
// Each job describes one demos.json sample to (re)capture. Asset paths are
// relative to docs/ (the same form stored in demos.json, e.g.
// "assets/playground/..."); we resolve them against DOCS to read the bytes.
//
// `kind` selects the request shaping + which sample fields get written:
//   image-to-code  → one vision turn (image + prompt) → output.code (output.lang)
//   video-understanding → one vision turn per language (video + question) → output.<lang>
//   asr-execute    → ASR transcript per language, then optionally the transcript
//                    as a coding prompt → transcript.<lang> + action.<lang>

type Lang = "en" | "zh"

type ImageJob = {
  readonly demoId: "img2code"
  readonly sampleId: string
  readonly kind: "image-to-code"
  readonly asset: string
  readonly outputLang: string
  readonly prompt: string
}

type VideoJob = {
  readonly demoId: "video"
  readonly sampleId: string
  readonly kind: "video-understanding"
  readonly asset: string
  readonly questions: Readonly<Record<Lang, string>>
}

type VoiceClip = {
  // Page-relative WAV path (read for ASR + played by the page). Synthesized via
  // MiMo TTS if missing, so no manual recording is needed.
  readonly asset: string
  // Text to speak when synthesizing the clip, and the preset voice to use.
  readonly say: string
  readonly voice: string
}

type VoiceJob = {
  readonly demoId: "voice"
  readonly sampleId: string
  readonly kind: "asr-execute"
  // One clip per language: a native EN clip and a native ZH clip, each ASR'd in
  // its own language so both transcript columns are genuine ASR (not a
  // translation of the other clip).
  readonly clips: Readonly<Record<Lang, VoiceClip>>
  // When set, the transcript is replayed as a coding prompt to capture the
  // action MiMo would take. The {transcript} placeholder is substituted.
  readonly actionPrompt?: Readonly<Record<Lang, string>>
}

type Job = ImageJob | VideoJob | VoiceJob

const SOURCES: ReadonlyArray<Job> = [
  {
    demoId: "img2code",
    sampleId: "price-card",
    kind: "image-to-code",
    // NOTE: vision requires a raster. The committed sample currently points at
    // price-card.svg; export a price-card.png screenshot before capturing. An
    // .svg here is skipped with a clear "need a raster" warning (see main()).
    asset: "assets/playground/img2code/price-card.png",
    outputLang: "tsx",
    prompt: "Reproduce this UI as a single React + TypeScript component. Return only the code.",
  },
  {
    demoId: "img2code",
    sampleId: "login-form",
    kind: "image-to-code",
    // Same raster requirement as price-card — export login-form.png first.
    asset: "assets/playground/img2code/login-form.png",
    outputLang: "tsx",
    prompt: "Reproduce this UI as a single React + TypeScript component. Return only the code.",
  },
  {
    demoId: "video",
    sampleId: "npe",
    kind: "video-understanding",
    asset: "assets/playground/video/npe.mp4",
    questions: {
      en: "Watch this short screen recording of code running. What goes wrong, and why? Answer in 2-3 sentences.",
      zh: "看这段代码运行的短录屏。这里出了什么问题，为什么？用两三句话回答。",
    },
  },
  {
    demoId: "voice",
    sampleId: "make-async",
    kind: "asr-execute",
    // Sentences are intentionally free of embedded English code terms: ASR (esp.
    // for the Chinese clip) mangles mixed-language technical words, so we phrase
    // the intent in plain language and let the captured action be code-specific.
    clips: {
      en: {
        asset: "assets/playground/voice/make-async-en.wav",
        say: "Make this function asynchronous and wait for the network request.",
        voice: "Chloe",
      },
      zh: {
        asset: "assets/playground/voice/make-async-zh.wav",
        say: "把这个函数改成异步的，并且等待网络请求返回。",
        voice: "冰糖",
      },
    },
    actionPrompt: {
      en: 'A developer said by voice: "{transcript}". In one short sentence, describe the concrete code change you would make. Start with a past-tense verb.',
      zh: '一位开发者用语音说：“{transcript}”。用一句话描述你会做的具体代码改动，以动词开头。',
    },
  },
]

// =============================================================================
// MiMo content-part shapes (verified from packages/llm/src/protocols/openai-chat.ts)
// =============================================================================
type TextPart = { type: "text"; text: string }
type ImagePart = { type: "image_url"; image_url: { url: string } }
type VideoPart = {
  type: "video_url"
  video_url: { url: string }
  fps?: number
  media_resolution?: "default" | "max"
}
type AudioPart = { type: "input_audio"; input_audio: { data: string } }
type ContentPart = TextPart | ImagePart | VideoPart | AudioPart

type ChatBody = {
  model: string
  messages: Array<{ role: "user"; content: Array<ContentPart> }>
  stream: false
  asr_options?: { language: string }
}

const mimeFor = (file: string): string => {
  const ext = path.extname(file).toLowerCase()
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".webp") return "image/webp"
  if (ext === ".gif") return "image/gif"
  if (ext === ".svg") return "image/svg+xml"
  if (ext === ".mp4") return "video/mp4"
  if (ext === ".webm") return "video/webm"
  if (ext === ".mov") return "video/quicktime"
  if (ext === ".wav") return "audio/wav"
  if (ext === ".mp3") return "audio/mpeg"
  return "application/octet-stream"
}

// "data:<mime>;base64,<b64>" — the full data URL every MiMo media part expects.
async function dataUrl(absPath: string): Promise<string> {
  const bytes = new Uint8Array(await Bun.file(absPath).arrayBuffer())
  return `data:${mimeFor(absPath)};base64,${Buffer.from(bytes).toString("base64")}`
}

// =============================================================================
// Transport — STREAMING chat. MiMo's chat/vision/ASR models are reasoning models;
// a stream:false request can buffer the entire (slow) generation and time out, so
// we stream and accumulate the assistant content deltas (reasoning_content is
// ignored). One SSE line is `data: {json}`; the stream ends with `data: [DONE]`.
// =============================================================================
const CHAT_TIMEOUT_MS = 420_000

function deltaContent(dataLine: string): string {
  const json = JSON.parse(dataLine) as { choices?: Array<{ delta?: { content?: unknown } }> }
  const c = json.choices?.[0]?.delta?.content
  return typeof c === "string" ? c : ""
}

// Accumulate assistant content from a full SSE transcript ("data: {json}\n\n",
// terminated by "data: [DONE]"). reasoning_content deltas are ignored.
function accumulateSse(text: string): string {
  let out = ""
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line.startsWith("data:")) continue
    const data = line.slice(5).trim()
    if (data === "[DONE]" || data.length === 0) continue
    out += deltaContent(data)
  }
  return out
}

async function chat(body: ChatBody): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)
  // The MiMo reasoning chat model hangs on stream:false but streams promptly; the
  // server closes the connection after `data: [DONE]`, so reading the whole body
  // with res.text() resolves at end-of-stream (a manual ReadableStream for-await
  // does not terminate cleanly in Bun here).
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY as string },
    body: JSON.stringify({ ...body, stream: true }),
    signal: controller.signal,
  })
  if (!res.ok) {
    clearTimeout(timer)
    const detail = await res.text().catch(() => "")
    throw new Error(`HTTP ${res.status} ${detail.slice(0, 300)}`)
  }
  const text = await res.text()
  clearTimeout(timer)

  const out = accumulateSse(text).trim()
  if (out.length === 0) throw new Error("stream carried no assistant content deltas")
  return out
}

// Non-streaming POST for the fast audio models (ASR), which return promptly and
// (unlike the reasoning chat model) don't hang on stream:false. Assistant text
// is at choices[0].message.content.
async function chatOnce(body: ChatBody): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY as string },
    body: JSON.stringify({ ...body, stream: false }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`HTTP ${res.status} ${detail.slice(0, 300)}`)
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
  const content = json.choices?.[0]?.message?.content
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("response carried no assistant text at choices[0].message.content")
  }
  return content.trim()
}

// =============================================================================
// Per-kind capture
// =============================================================================
async function captureImage(job: ImageJob, absAsset: string): Promise<{ lang: string; code: string }> {
  const url = await dataUrl(absAsset)
  const code = await chat({
    model: CHAT_MODEL,
    stream: false,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url } },
          { type: "text", text: job.prompt },
        ],
      },
    ],
  })
  return { lang: job.outputLang, code: stripCodeFence(code) }
}

async function captureVideo(job: VideoJob, absAsset: string): Promise<Record<Lang, string>> {
  const url = await dataUrl(absAsset)
  const ask = (question: string) =>
    chat({
      model: CHAT_MODEL,
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            { type: "video_url", video_url: { url }, fps: 2, media_resolution: "default" },
            { type: "text", text: question },
          ],
        },
      ],
    })
  const en = await ask(job.questions.en)
  const zh = await ask(job.questions.zh)
  return { en, zh }
}

// Synthesize a voice clip via MiMo TTS (preset voice) and write it to disk.
// Wire shape matches the agent's preset TTS: assistant holds the text, audio
// carries { format, voice }; the WAV comes back base64 at message.audio.data.
async function synthVoice(say: string, voice: string, absOut: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY as string },
    body: JSON.stringify({
      model: TTS_MODEL,
      messages: [{ role: "assistant", content: say }],
      audio: { format: "wav", voice },
      stream: false,
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`TTS HTTP ${res.status} ${detail.slice(0, 200)}`)
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { audio?: { data?: unknown } } }> }
  const b64 = json.choices?.[0]?.message?.audio?.data
  if (typeof b64 !== "string" || b64.length === 0) throw new Error("TTS returned no audio data")
  await Bun.write(absOut, Buffer.from(b64, "base64"))
}

async function captureVoice(
  job: VoiceJob,
): Promise<{ transcript: Record<Lang, string>; action?: Record<Lang, string>; audio: Record<Lang, string> }> {
  const transcribe = (url: string, language: Lang) =>
    chatOnce({
      model: ASR_MODEL,
      stream: false,
      asr_options: { language },
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: url } }] }],
    })

  const transcript = {} as Record<Lang, string>
  const audio = {} as Record<Lang, string>
  for (const lang of ["en", "zh"] as ReadonlyArray<Lang>) {
    const clip = job.clips[lang]
    const abs = path.join(DOCS, clip.asset)
    const present = await Bun.file(abs).exists()
    if (!present) {
      process.stdout.write(`(tts ${lang}) `)
      await synthVoice(clip.say, clip.voice, abs)
    }
    transcript[lang] = cleanTranscript(await transcribe(await dataUrl(abs), lang))
    audio[lang] = clip.asset
  }

  if (!job.actionPrompt) return { transcript, audio }

  // Replay each transcript as a plain coding prompt to capture the action.
  const act = (template: string, said: string) =>
    chat({
      model: CHAT_MODEL,
      stream: false,
      messages: [{ role: "user", content: [{ type: "text", text: template.replace("{transcript}", said) }] }],
    })
  const action: Record<Lang, string> = {
    en: await act(job.actionPrompt.en, transcript.en),
    zh: await act(job.actionPrompt.zh, transcript.zh),
  }
  return { transcript, action, audio }
}

// MiMo often wraps code in a ```lang fence even when asked for "only the code".
// Strip a single surrounding fence so output.code is paste-ready.
function stripCodeFence(text: string): string {
  const inner = text.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)?.[1]
  return inner === undefined ? text : inner.trim()
}

// ASR occasionally leaks control/reasoning tokens ("think>", "<chinese>") or a
// leading list marker ("1. ", "1、"). Strip them so the transcript matches what
// the clip actually says.
function cleanTranscript(text: string): string {
  return text
    .replace(/<\/?think>/gi, "")
    .replace(/\bthink>/gi, "")
    .replace(/<\/?(chinese|english|zh|en)>/gi, "")
    .replace(/^\s*\d+\s*[.)、）]\s*/, "")
    .trim()
}

// =============================================================================
// demos.json read / seed / write
// =============================================================================
type Sample = Record<string, unknown> & { id: string; meta?: Record<string, unknown> }
type Demo = { id: string; kind: string; tab?: Record<string, string>; samples: Array<Sample> }
type Demos = { version: number; demos: Array<Demo> }

// A minimal seed matching the design spec, so a fresh checkout (no demos.json
// yet) still gets a well-formed manifest the script can fill in. Captured
// fields start empty and are overwritten per successful job.
function seed(): Demos {
  return {
    version: 1,
    demos: [
      {
        id: "img2code",
        kind: "image-to-code",
        tab: { en: "Screenshot → code", zh: "截图 → 代码" },
        samples: [
          {
            id: "price-card",
            input: {
              image: "assets/playground/img2code/price-card.svg",
              alt: { en: "Pricing card UI", zh: "价格卡片 UI" },
            },
            output: { lang: "tsx", code: "" },
            meta: { model: CHAT_MODEL, capturedAt: "" },
          },
          {
            id: "login-form",
            input: {
              image: "assets/playground/img2code/login-form.svg",
              alt: { en: "Login form UI", zh: "登录表单 UI" },
            },
            output: { lang: "tsx", code: "" },
            meta: { model: CHAT_MODEL, capturedAt: "" },
          },
        ],
      },
      {
        id: "video",
        kind: "video-understanding",
        tab: { en: "Video → understanding", zh: "看视频 → 读懂" },
        samples: [
          {
            id: "npe",
            input: {
              video: "assets/playground/video/npe.mp4",
              poster: "assets/playground/video/npe-poster.svg",
            },
            question: { en: "What goes wrong in this clip?", zh: "这段里出了什么问题？" },
            output: { en: "", zh: "" },
            highlights: [{ t: 12, label: { en: "null deref", zh: "空指针访问" } }],
            meta: { model: CHAT_MODEL, capturedAt: "" },
          },
        ],
      },
      {
        id: "voice",
        kind: "asr-execute",
        tab: { en: "Speak → act", zh: "说话 → 执行" },
        samples: [
          {
            id: "make-async",
            input: {
              audio: {
                en: "assets/playground/voice/make-async-en.wav",
                zh: "assets/playground/voice/make-async-zh.wav",
              },
            },
            transcript: { en: "", zh: "" },
            action: { en: "", zh: "" },
            meta: { model: ASR_MODEL, capturedAt: "" },
          },
        ],
      },
    ],
  }
}

async function loadDemos(): Promise<Demos> {
  const file = Bun.file(DEMOS_PATH)
  const exists = await file.exists()
  if (!exists) {
    console.log(`• demos.json not found — seeding ${path.relative(ROOT, DEMOS_PATH)} from SOURCES`)
    return seed()
  }
  return file.json() as Promise<Demos>
}

function findSample(demos: Demos, demoId: string, sampleId: string): Sample | undefined {
  return demos.demos.find((d) => d.id === demoId)?.samples.find((s) => s.id === sampleId)
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  if (!API_KEY || !BASE_URL) {
    console.error(
      "✗ Missing required env.\n" +
        "  MIO_API_KEY  and  MIO_BASE_URL  are required.\n" +
        "  Example (run from the repo root):\n" +
        "    MIO_API_KEY=sk-... MIO_BASE_URL=https://api.example.com/v1 \\\n" +
        "      bun run script/gen-playground.ts\n" +
        '  Optional: MIO_CHAT_MODEL (default "mimo-v2.5").',
    )
    process.exit(1)
  }

  const demos = await loadDemos()
  const capturedAt = new Date().toISOString().slice(0, 10)
  const stamps: Array<string> = []
  // Optional comma-separated demo-id filter (e.g. MIO_ONLY=voice) to re-capture
  // a subset without re-spending on the demos that are already good.
  const only = process.env["MIO_ONLY"]?.split(",").map((s) => s.trim()).filter(Boolean)

  for (const job of SOURCES) {
    if (only && !only.includes(job.demoId)) continue
    const sample = findSample(demos, job.demoId, job.sampleId)
    if (!sample) {
      console.warn(`! ${job.demoId}/${job.sampleId}: no matching sample in demos.json — skipping`)
      continue
    }

    // Voice has no single source asset: it synthesizes any missing per-language
    // clip via TTS, then ASRs each, then captures the action.
    if (job.kind === "asr-execute") {
      process.stdout.write(`• ${job.demoId}/${job.sampleId} (asr-execute) … `)
      const { transcript, action, audio } = await captureVoice(job)
      sample["transcript"] = transcript
      if (action) sample["action"] = action
      sample["input"] = { ...((sample["input"] as Record<string, unknown>) ?? {}), audio }
      sample["meta"] = { ...(sample["meta"] ?? {}), model: ASR_MODEL, capturedAt }
      console.log("✓")
      stamps.push(`${job.demoId}/${job.sampleId}`)
      continue
    }

    const absAsset = path.join(DOCS, job.asset)
    const present = await Bun.file(absAsset).exists()
    if (!present) {
      console.warn(`! ${job.demoId}/${job.sampleId}: asset missing (${job.asset}) — skipping`)
      continue
    }

    // Vision needs a raster; an .svg can't be sent as an image to MiMo.
    if (job.kind === "image-to-code" && mimeFor(absAsset) === "image/svg+xml") {
      console.warn(
        `! ${job.demoId}/${job.sampleId}: ${job.asset} is an SVG — vision needs a raster.` +
          ` Export a .png screenshot and re-run. Skipping.`,
      )
      continue
    }

    process.stdout.write(`• ${job.demoId}/${job.sampleId} (${job.kind}) … `)

    if (job.kind === "image-to-code") {
      const output = await captureImage(job, absAsset)
      sample["output"] = output
    } else {
      sample["output"] = await captureVideo(job, absAsset)
    }

    sample["meta"] = { ...(sample["meta"] ?? {}), model: CHAT_MODEL, capturedAt }
    console.log("✓")
    stamps.push(`${job.demoId}/${job.sampleId}`)
  }

  if (stamps.length === 0) {
    console.log("\nNothing captured (no assets present). demos.json left unchanged.")
    return
  }

  await Bun.write(DEMOS_PATH, JSON.stringify(demos, null, 2) + "\n")
  console.log(`\nDone. Updated ${stamps.length} sample(s) in ${path.relative(ROOT, DEMOS_PATH)}: ${stamps.join(", ")}`)
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
