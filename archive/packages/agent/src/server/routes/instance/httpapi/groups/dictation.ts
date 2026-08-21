import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/dictation"

export const DictationAudio = Schema.Struct({
  dataUrl: Schema.String,
  mime: Schema.String,
  durationSeconds: Schema.optional(Schema.Finite),
})
export type DictationAudio = Schema.Schema.Type<typeof DictationAudio>

export const DictationLanguage = Schema.Literals(["auto", "zh", "en"])
export type DictationLanguage = Schema.Schema.Type<typeof DictationLanguage>

export const DictationRequest = Schema.Struct({
  audio: DictationAudio,
  language: Schema.optional(DictationLanguage),
})
export type DictationRequest = Schema.Schema.Type<typeof DictationRequest>

export const DictationUsage = Schema.Struct({
  inputTokens: Schema.optional(Schema.Finite),
  outputTokens: Schema.optional(Schema.Finite),
  totalTokens: Schema.optional(Schema.Finite),
  cacheReadInputTokens: Schema.optional(Schema.Finite),
  audioTokens: Schema.optional(Schema.Finite),
})
export type DictationUsage = Schema.Schema.Type<typeof DictationUsage>

export const DictationResponse = Schema.Struct({
  text: Schema.String,
  usage: Schema.optional(DictationUsage),
})
export type DictationResponse = Schema.Schema.Type<typeof DictationResponse>

const DictationErrorName = Schema.Union([
  Schema.Literal("BadRequest"),
  Schema.Literal("ProviderNotConnected"),
  Schema.Literal("UpstreamError"),
])

export class DictationApiError extends Schema.ErrorClass<DictationApiError>("DictationError")(
  {
    name: DictationErrorName,
    data: Schema.Struct({
      message: Schema.optional(Schema.String),
    }),
  },
  { httpApiStatus: 400 },
) {}

export const DictationApi = HttpApi.make("dictation")
  .add(
    HttpApiGroup.make("dictation")
      .add(
        HttpApiEndpoint.post("transcribe", root, {
          query: WorkspaceRoutingQuery,
          payload: DictationRequest,
          success: described(DictationResponse, "Transcribed dictation text"),
          error: DictationApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "dictation.transcribe",
            summary: "Transcribe dictation",
            description: "Transcribe a short WAV audio clip with the MiMo v2.5 ASR model.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "dictation",
          description: "MiMo v2.5 ASR short-form dictation routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "mimo Dictation HttpApi",
      version: "0.0.1",
      description: "Short audio dictation surface for the MiMo provider.",
    }),
  )
