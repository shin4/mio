/**
 * `mimo_media_read`: MiMo understands an audio or video file for the agent. dsh stores any attached
 * file verbatim and hands the model its read-only path, but no dsh route carries audio or video to
 * a model; this tool reads the file through the mounted `fs` backend (the same path resolution and
 * access policy as `read_image`), asks MiMo about it on the `mimo` route's endpoint and credential,
 * and returns the answer as text. PDF is out: MiMo Chat Completions has no file content part.
 */
import { extname } from "node:path"
import z from "@deepseek-ai/schemastery"
import { credentialRef } from "@deepseek-ai/dsh-credentials"
import { defineTool } from "@deepseek-ai/dsh-tools"

export const name = "mio-media"
export const inject = ["tools", "fs", "settings", "credentials"]

/** Formats MiMo documents for audio and video understanding (2026-09-22), keyed by extension. */
export const FORMATS = {
  ".mp3": { kind: "audio", mime: "audio/mpeg" },
  ".wav": { kind: "audio", mime: "audio/wav" },
  ".flac": { kind: "audio", mime: "audio/flac" },
  ".m4a": { kind: "audio", mime: "audio/mp4" },
  ".ogg": { kind: "audio", mime: "audio/ogg" },
  ".mp4": { kind: "video", mime: "video/mp4" },
  ".mov": { kind: "video", mime: "video/quicktime" },
  ".avi": { kind: "video", mime: "video/x-msvideo" },
  ".wmv": { kind: "video", mime: "video/x-ms-wmv" },
}

export const Config = z.object({
  // Any model MiMo lists for audio and video understanding; Flash answered a short clip in about 2s.
  model: z.string().min(1).default("mimo-v2.6-flash"),
  // The llm-pi-ai route whose endpoint and credential this tool shares.
  route: z.string().min(1).default("mimo"),
  apiKeyRef: z.string().min(1).default("MIO_API_KEY"),
  // MiMo's documented cap on one base64-encoded audio or video, data-URL prefix excluded.
  maxEncodedBytes: z.natural().min(1).default(50 * 1000 * 1000),
  maxAnswerTokens: z.natural().min(1).default(4096),
  timeoutSeconds: z.natural().min(1).default(300),
})

/**
 * The format a path declares by its extension.
 * @param path - model-supplied path.
 * @returns the media kind and MIME type, or undefined for anything else.
 */
export function formatOf(path) {
  return FORMATS[extname(path).toLowerCase()]
}

/**
 * The largest raw file whose base64 encoding stays within the encoded cap.
 * @param maxEncodedBytes - cap on the base64 string.
 * @returns raw byte cap.
 */
export function rawCap(maxEncodedBytes) {
  return Math.floor(maxEncodedBytes / 4) * 3
}

/**
 * The Chat Completions request MiMo documents for one audio or video plus a question.
 * @param config - validated configuration.
 * @param format - the file's kind and MIME type.
 * @param data - file bytes.
 * @param args - tool arguments.
 * @returns request body.
 */
export function understandingBody(config, format, data, args) {
  const url = `data:${format.mime};base64,${Buffer.from(data).toString("base64")}`
  const part =
    format.kind === "audio"
      ? { type: "input_audio", input_audio: { data: url } }
      : {
          type: "video_url",
          video_url: { url },
          ...(args.fps === undefined ? {} : { fps: args.fps }),
          ...(args.media_resolution === undefined ? {} : { media_resolution: args.media_resolution }),
        }
  return {
    model: config.model,
    thinking: { type: "disabled" },
    max_completion_tokens: config.maxAnswerTokens,
    stream: false,
    messages: [{ role: "user", content: [part, { type: "text", text: args.question }] }],
  }
}

/**
 * The route's current endpoint. Welcome rewrites it per key (PAYG or a Token Plan region),
 * so it is read per call from the live llm-pi-ai entry rather than copied into config.
 * @param ctx - context carrying `settings`.
 * @param route - llm-pi-ai provider route key.
 * @returns the base URL without a trailing slash.
 */
function endpointOf(ctx, route) {
  const entry = ctx.settings.describe().find((descriptor) => descriptor.ns === "llm-pi-ai")
  const baseURL = entry?.value?.providers?.[route]?.baseURL
  if (typeof baseURL !== "string" || baseURL.length === 0) {
    throw new Error(`MiMo media: llm-pi-ai route "${route}" has no baseURL`)
  }
  return baseURL.replace(/\/+$/, "")
}

const SUPPORTED = Object.keys(FORMATS).map((extension) => extension.slice(1).toUpperCase()).join("/")

const VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: { type: "string", required: true },
    kind: { type: "string", enum: ["audio", "video"], required: true },
    model: { type: "string", required: true },
    answer: { type: "string", required: true },
  },
}

/**
 * Register `mimo_media_read`.
 * @param ctx - Host context.
 * @param config - validated configuration.
 */
export function apply(ctx, config) {
  const apiKey = credentialRef(config.apiKeyRef)
  ctx.effect(() =>
    ctx.tools.register(
      defineTool({
        name: "mimo_media_read",
        description:
          `Have MiMo listen to an audio file or watch a video file and answer a question about it (${SUPPORTED}). ` +
          "Use it for attached recordings and videos, which the read tool cannot open. The answer is MiMo's " +
          "description, not the media itself: ask for exactly what you need, such as a transcript, a summary or " +
          "what happens at a moment. The file is sent to the MiMo API. PDF and documents are not supported.",
        parameters: {
          file_path: { type: "string", required: true, description: "Path to the audio or video file, such as an attachment's saved read-only path." },
          question: { type: "string", required: true, description: "What MiMo should report about the media." },
          fps: { type: "number", description: "Video only: frames sampled per second, 0.1 to 10 (MiMo default 2). Raise for fast motion, lower for long videos." },
          media_resolution: { type: "string", enum: ["default", "max"], description: "Video only: frame detail; max helps with small text and objects." },
        },
        output: {
          schema: VALUE_SCHEMA,
          render: (_args, value) => [
            { type: "text", text: `<path>${value.path}</path>\n<type>${value.kind}</type>\n<answer model="${value.model}">\n${value.answer}\n</answer>` },
          ],
          presentationMeta: (_args, value) => ({ path: value.path }),
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
          if (args.question.trim().length === 0) throw new Error("question must be a non-empty string")
          const format = formatOf(args.file_path)
          if (format === undefined) {
            throw new Error(`cannot read "${args.file_path}": mimo_media_read accepts ${SUPPORTED} files only`)
          }
          if (format.kind === "audio" && (args.fps !== undefined || args.media_resolution !== undefined)) {
            throw new Error("fps and media_resolution apply to video only")
          }
          if (args.fps !== undefined && !(args.fps >= 0.1 && args.fps <= 10)) throw new Error("fps must be between 0.1 and 10")
          const key = (await ctx.credentials.resolve(apiKey))?.value
          if (!key) throw new Error(`MiMo is not connected: ${config.apiKeyRef} is not configured`)
          const cwd = exec.agent?.session.header.cwd
          const target = await ctx.fs.resolve(args.file_path, { ...(cwd === undefined ? {} : { cwd }), signal: exec.signal })
          const info = await ctx.fs.stat(target, exec.signal)
          if (info === undefined) throw new Error(`cannot read "${target.displayPath}": not found`)
          if (info.type !== "file") throw new Error(`cannot read "${target.displayPath}": not a regular file`)
          const cap = rawCap(config.maxEncodedBytes)
          if (info.size !== undefined && info.size > cap) {
            throw new Error(`cannot read "${target.displayPath}": ${info.size} bytes exceeds MiMo's ${cap}-byte limit for one ${format.kind}; trim or compress it first`)
          }
          const data = await ctx.fs.readBytes(target, exec.signal, cap)
          ctx.emit("fs/observed", target, { kind: "present", version: info.version }, exec)
          const response = await fetch(`${endpointOf(ctx, config.route)}/chat/completions`, {
            method: "POST",
            signal: AbortSignal.any([exec.signal, AbortSignal.timeout(config.timeoutSeconds * 1000)].filter(Boolean)),
            headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
            body: JSON.stringify(understandingBody(config, format, data, args)),
          })
          const text = await response.text()
          if (!response.ok) throw new Error(`MiMo ${format.kind} understanding failed: HTTP ${response.status} ${text.slice(0, 300)}`)
          const answer = JSON.parse(text)?.choices?.[0]?.message?.content
          if (typeof answer !== "string" || answer.trim().length === 0) throw new Error(`MiMo returned no answer for "${target.displayPath}"`)
          return { path: target.displayPath, kind: format.kind, model: config.model, answer: answer.trim() }
        },
        presentCall: (args) => ({
          card: "generic",
          title: `MiMo ${formatOf(args.file_path)?.kind ?? "media"} ${args.file_path}`,
          kind: "read",
          locations: [{ path: args.file_path }],
        }),
      }),
    ),
  )
}
