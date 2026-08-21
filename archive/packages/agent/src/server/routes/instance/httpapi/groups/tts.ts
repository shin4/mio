import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/tts"

// MiMo speech-synthesis v2.5 voices (model "mimo-v2.5-tts").
export const TtsVoiceId = Schema.Literals(["mimo_default", "冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"])
export type TtsVoiceId = Schema.Schema.Type<typeof TtsVoiceId>

// HTML <audio> can only play "wav" — "pcm16" is raw samples with no container.
export const TtsFormat = Schema.Literals(["wav", "pcm16"])

// Voice source mode → selects the MiMo TTS model:
//   preset → mimo-v2.5-tts            (one of the 9 preset voices; supports 唱歌 + audio tags)
//   design → mimo-v2.5-tts-voicedesign (natural-language prompt describes the timbre)
//   clone  → mimo-v2.5-tts-voiceclone  (synthesize in the timbre of a reference clip)
export const TtsMode = Schema.Literals(["preset", "design", "clone"])
export type TtsMode = Schema.Schema.Type<typeof TtsMode>

// Reference audio for voice clone. dataUrl is "data:<mime>;base64,<...>".
export const TtsReferenceAudio = Schema.Struct({
  dataUrl: Schema.String,
  mime: Schema.String,
  filename: Schema.optional(Schema.String),
})
export type TtsReferenceAudio = Schema.Schema.Type<typeof TtsReferenceAudio>

export const TTSRequest = Schema.Struct({
  text: Schema.String,
  voice: Schema.optional(TtsVoiceId),
  format: Schema.optional(TtsFormat),
  // Optional style/instruction sent as the user message (e.g. "speak slowly").
  style: Schema.optional(Schema.String),
  // Voice source mode (defaults to "preset" in the handler for back-compat).
  mode: Schema.optional(TtsMode),
  // mode=design: 1–4 sentence natural-language description of the desired voice.
  designPrompt: Schema.optional(Schema.String),
  // mode=clone: reference audio whose timbre is reproduced.
  referenceAudio: Schema.optional(TtsReferenceAudio),
  // preset only: prefix the synthesized text with (唱歌) to enter singing mode.
  singing: Schema.optional(Schema.Boolean),
  // design only: ask mimo-v2.5-tts-voicedesign to optimize the preview text.
  optimizeTextPreview: Schema.optional(Schema.Boolean),
})
export type TTSRequest = Schema.Schema.Type<typeof TTSRequest>

export const TTSResponse = Schema.Struct({
  // base64-encoded audio bytes (no data: prefix).
  audio: Schema.String,
  format: Schema.String,
  voice: Schema.String,
})
export type TTSResponse = Schema.Schema.Type<typeof TTSResponse>

const TtsErrorName = Schema.Union([
  Schema.Literal("BadRequest"),
  Schema.Literal("ProviderNotConnected"),
  Schema.Literal("UpstreamError"),
])

export class TtsApiError extends Schema.ErrorClass<TtsApiError>("TtsError")(
  {
    name: TtsErrorName,
    data: Schema.Struct({
      message: Schema.optional(Schema.String),
    }),
  },
  { httpApiStatus: 400 },
) {}

export const TtsApi = HttpApi.make("tts")
  .add(
    HttpApiGroup.make("tts")
      .add(
        HttpApiEndpoint.post("synthesize", root, {
          query: WorkspaceRoutingQuery,
          payload: TTSRequest,
          success: described(TTSResponse, "Synthesized speech audio (base64)"),
          error: TtsApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "tts.synthesize",
            summary: "Synthesize speech",
            description: "Convert text to speech with MiMo TTS (model mimo-v2.5-tts) and return the audio as base64.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "tts",
          description: "MiMo text-to-speech routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "mimo TTS HttpApi",
      version: "0.0.1",
      description: "Text-to-speech surface for the MiMo provider.",
    }),
  )
