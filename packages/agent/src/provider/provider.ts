import { Effect, Layer, Context, Schema, Types } from "effect"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { optionalOmitUndefined } from "@opencode-ai/core/schema"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Auth } from "../auth"
import { ModelID, ProviderID } from "./schema"
import { ModelStatus } from "./model-status"
import { ProviderError } from "./error"
import type { LanguageModelV3 } from "@ai-sdk/provider"

export { ModelID, ProviderID }

// ─── Types ──────────────────────────────────────────────────────────────────

const ProviderApiInfo = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  npm: Schema.String,
})

const ProviderModalities = Schema.Struct({
  text: Schema.Boolean,
  audio: Schema.Boolean,
  image: Schema.Boolean,
  video: Schema.Boolean,
  pdf: Schema.Boolean,
})

const ProviderInterleaved = Schema.Union([
  Schema.Boolean,
  Schema.Struct({
    field: Schema.Literals(["reasoning_content", "reasoning_details"]),
  }),
])

const ProviderCapabilities = Schema.Struct({
  temperature: Schema.Boolean,
  reasoning: Schema.Boolean,
  attachment: Schema.Boolean,
  toolcall: Schema.Boolean,
  input: ProviderModalities,
  output: ProviderModalities,
  interleaved: ProviderInterleaved,
})

const ProviderCacheCost = Schema.Struct({
  read: Schema.Finite,
  write: Schema.Finite,
})

const ProviderCostTier = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache: ProviderCacheCost,
  tier: Schema.Struct({
    type: Schema.Literal("context"),
    size: Schema.Finite,
  }),
})

const ProviderCost = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache: ProviderCacheCost,
  // ISO currency code for the input/output/cache values above.
  // Optional for back-compat with consumers that don't set it (assume USD).
  currency: optionalOmitUndefined(Schema.Literals(["USD", "RMB"])),
  tiers: optionalOmitUndefined(Schema.Array(ProviderCostTier)),
  experimentalOver200K: optionalOmitUndefined(
    Schema.Struct({
      input: Schema.Finite,
      output: Schema.Finite,
      cache: ProviderCacheCost,
    }),
  ),
})

const ProviderLimit = Schema.Struct({
  context: Schema.Finite,
  input: optionalOmitUndefined(Schema.Finite),
  output: Schema.Finite,
})

export const Model = Schema.Struct({
  id: ModelID,
  providerID: ProviderID,
  api: ProviderApiInfo,
  name: Schema.String,
  family: optionalOmitUndefined(Schema.String),
  capabilities: ProviderCapabilities,
  cost: ProviderCost,
  limit: ProviderLimit,
  status: ModelStatus,
  options: Schema.Record(Schema.String, Schema.Any),
  headers: Schema.Record(Schema.String, Schema.String),
  release_date: Schema.String,
  variants: optionalOmitUndefined(Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Any))),
}).annotate({ identifier: "Model" })
export type Model = Types.DeepMutable<Schema.Schema.Type<typeof Model>>

export const Info = Schema.Struct({
  id: ProviderID,
  name: Schema.String,
  source: Schema.Literals(["env", "config", "custom", "api"]),
  env: Schema.Array(Schema.String),
  key: optionalOmitUndefined(Schema.String),
  options: Schema.Record(Schema.String, Schema.Any),
  models: Schema.Record(Schema.String, Model),
}).annotate({ identifier: "Provider" })
export type Info = Types.DeepMutable<Schema.Schema.Type<typeof Info>>

const DefaultModelIDs = Schema.Record(Schema.String, Schema.String)
export const ListResult = Schema.Struct({
  all: Schema.Array(Info),
  default: DefaultModelIDs,
  connected: Schema.Array(Schema.String),
})
export type ListResult = Types.DeepMutable<Schema.Schema.Type<typeof ListResult>>

export const ConfigProvidersResult = Schema.Struct({
  providers: Schema.Array(Info),
  default: DefaultModelIDs,
})
export type ConfigProvidersResult = Types.DeepMutable<Schema.Schema.Type<typeof ConfigProvidersResult>>

export function defaultModelIDs<T extends { models: Record<string, { id: string }> }>(
  providers: Record<string, T>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [id, p] of Object.entries(providers)) {
    const first = Object.values(p.models)[0]
    if (first) out[id] = first.id
  }
  return out
}

// Legacy helper retained as a no-op for the v2 server handler signature.
export function fromModelsDevProvider(provider: unknown): Info {
  // mimo-desktop doesn't fetch from models.dev — the static MiMo catalog is the
  // single source of truth. This shim exists only so server/handlers/provider.ts
  // still compiles; the handler returns the same static catalog regardless.
  return provider as Info
}

// ─── Error types ────────────────────────────────────────────────────────────

export class ModelNotFoundError extends Schema.TaggedErrorClass<ModelNotFoundError>()("ProviderModelNotFoundError", {
  providerID: ProviderID,
  modelID: ModelID,
  suggestions: Schema.optional(Schema.Array(Schema.String)),
  cause: Schema.optional(Schema.Defect()),
}) {
  static isInstance(input: unknown): input is ModelNotFoundError {
    return input instanceof ModelNotFoundError
  }
}

export class InitError extends Schema.TaggedErrorClass<InitError>()("ProviderInitError", {
  providerID: ProviderID,
  cause: Schema.optional(Schema.Defect()),
}) {
  static isInstance(input: unknown): input is InitError {
    return input instanceof InitError
  }
}

export class NoProvidersError extends Schema.TaggedErrorClass<NoProvidersError>()("ProviderNoProvidersError", {}) {
  static isInstance(input: unknown): input is NoProvidersError {
    return input instanceof NoProvidersError
  }
}

export class NoModelsError extends Schema.TaggedErrorClass<NoModelsError>()("ProviderNoModelsError", {
  providerID: ProviderID,
}) {
  static isInstance(input: unknown): input is NoModelsError {
    return input instanceof NoModelsError
  }
}

export type DefaultModelError = ModelNotFoundError | NoProvidersError | NoModelsError
export type Error = ModelNotFoundError | InitError | NoProvidersError | NoModelsError

// ─── Service interface ───────────────────────────────────────────────────────

export interface Interface {
  readonly list: () => Effect.Effect<Record<ProviderID, Info>>
  readonly getProvider: (providerID: ProviderID) => Effect.Effect<Info>
  readonly getModel: (providerID: ProviderID, modelID: ModelID) => Effect.Effect<Model, ModelNotFoundError>
  readonly getLanguage: (model: Model) => Effect.Effect<LanguageModelV3, ModelNotFoundError>
  readonly closest: (
    providerID: ProviderID,
    query: string[],
  ) => Effect.Effect<{ providerID: ProviderID; modelID: string } | undefined>
  readonly getSmallModel: (providerID: ProviderID) => Effect.Effect<Model | undefined>
  readonly defaultModel: () => Effect.Effect<{ providerID: ProviderID; modelID: ModelID }, DefaultModelError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Provider") {}

export const use = serviceUse(Service)

// ─── MiMo static model catalog ──────────────────────────────────────────────

// Two independent billing tracks per platform.xiaomimimo.com/docs:
//   - "pay-as-you-go": USD per-token, key prefix `sk-`,
//     URL https://api.xiaomimimo.com/{v1,anthropic}
//   - "token-plan": subscription quota, key prefix `tp-`, region-aware,
//     URL https://token-plan-{cn|sgp|ams}.xiaomimimo.com/{v1,anthropic}
export type MimoBilling = "pay-as-you-go" | "token-plan"
export type MimoRegion = "cn" | "sgp" | "ams"

const PAY_AS_YOU_GO_URLS = {
  openai: "https://api.xiaomimimo.com/v1",
  anthropic: "https://api.xiaomimimo.com/anthropic",
} as const

const TOKEN_PLAN_URLS = {
  cn: {
    openai: "https://token-plan-cn.xiaomimimo.com/v1",
    anthropic: "https://token-plan-cn.xiaomimimo.com/anthropic",
  },
  sgp: {
    openai: "https://token-plan-sgp.xiaomimimo.com/v1",
    anthropic: "https://token-plan-sgp.xiaomimimo.com/anthropic",
  },
  ams: {
    openai: "https://token-plan-ams.xiaomimimo.com/v1",
    anthropic: "https://token-plan-ams.xiaomimimo.com/anthropic",
  },
} as const

function resolveBaseURL(opts: { billing: MimoBilling; region: MimoRegion; protocol: "openai" | "anthropic" }): string {
  if (opts.billing === "token-plan") return TOKEN_PLAN_URLS[opts.region][opts.protocol]
  return PAY_AS_YOU_GO_URLS[opts.protocol]
}

type Modalities = {
  text: boolean
  audio: boolean
  image: boolean
  video: boolean
  pdf: boolean
}

// Audio understanding (the model reasoning over an attached clip) is a
// supported input modality. ASR / speech-to-text transcription stays out of
// scope — audio is fed as context, we never request a transcript.
const MULTI_MODAL_CAPS: Modalities = {
  text: true,
  audio: true,
  image: true,
  video: true,
  pdf: false,
}

const TEXT_INPUT_CAPS: Modalities = {
  text: true,
  audio: false,
  image: false,
  video: false,
  pdf: false,
}

type CurrencyPrices = {
  inputPerM: number
  outputPerM: number
  cacheReadPerM: number
  cacheWritePerM: number
}

type ModelPriceTable = {
  USD: CurrencyPrices
  RMB: CurrencyPrices
}

// Official MiMo per-million-token rates from
// https://platform.xiaomimimo.com/docs/zh-CN/price/pay-as-you-go
//
// USD = "International Pricing" (sgp/ams users, all pay-as-you-go users
// with sk-xxxxx keys). RMB = "Domestic Pricing" (cn-region token-plan
// users with tp-xxxxx keys billed in renminbi).
//
// Cache write rates are 0 (限时免费 / temporarily free per docs).
const MODEL_PRICES: Record<string, ModelPriceTable & { contextTokens: number; name: string; input: Modalities }> = {
  "mimo-v2.5": {
    name: "MiMo V2.5",
    contextTokens: 1_048_576,
    input: MULTI_MODAL_CAPS,
    USD: { inputPerM: 0.14, outputPerM: 0.28, cacheReadPerM: 0.0028, cacheWritePerM: 0 },
    RMB: { inputPerM: 1.0, outputPerM: 2.0, cacheReadPerM: 0.02, cacheWritePerM: 0 },
  },
  "mimo-v2.5-pro": {
    name: "MiMo V2.5 Pro",
    contextTokens: 1_048_576,
    input: TEXT_INPUT_CAPS,
    USD: { inputPerM: 0.435, outputPerM: 0.87, cacheReadPerM: 0.0036, cacheWritePerM: 0 },
    RMB: { inputPerM: 3.0, outputPerM: 6.0, cacheReadPerM: 0.025, cacheWritePerM: 0 },
  },
}

// Pay-as-you-go (sk- keys) is always billed in USD per docs.
// Token-plan (tp- keys) bills in the region's local currency:
//   - cn region → RMB
//   - sgp/ams regions → USD
function currencyFor(billing: MimoBilling, region: MimoRegion): "USD" | "RMB" {
  if (billing === "token-plan" && region === "cn") return "RMB"
  return "USD"
}

function makeMimoModel(params: {
  id: string
  npm: string
  url: string
  currency: "USD" | "RMB"
}): Model {
  const spec = MODEL_PRICES[params.id]
  if (!spec) throw new Error(`Unknown MiMo model id: ${params.id}`)
  const prices = spec[params.currency]
  const mid = ModelID.make(params.id)
  return {
    id: mid,
    providerID: ProviderID.make("mimo"),
    api: {
      id: params.id,
      url: params.url,
      npm: params.npm,
    },
    name: spec.name,
    family: "mimo",
    release_date: "2026-04-22",
    capabilities: {
      temperature: true,
      reasoning: true,
      attachment: true,
      toolcall: true,
      input: { ...spec.input },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: {
      input: prices.inputPerM / 1_000_000,
      output: prices.outputPerM / 1_000_000,
      cache: {
        read: prices.cacheReadPerM / 1_000_000,
        write: prices.cacheWritePerM / 1_000_000,
      },
      currency: params.currency,
    },
    limit: {
      context: spec.contextTokens,
      output: 128_000,
    },
    status: "active",
    options: {},
    headers: {},
  }
}

function buildModels(opts: {
  protocol: "openai" | "anthropic"
  billing: MimoBilling
  region: MimoRegion
}): Record<string, Model> {
  const npm = opts.protocol === "anthropic" ? "@ai-sdk/anthropic" : "@ai-sdk/openai"
  const url = resolveBaseURL(opts)
  const currency = currencyFor(opts.billing, opts.region)
  const result: Record<string, Model> = {}
  for (const id of Object.keys(MODEL_PRICES)) {
    result[id] = makeMimoModel({ id, npm, url, currency })
  }
  return result
}

// ─── Layer ───────────────────────────────────────────────────────────────────

// MiMo speech-synthesis (mimo-v2.5-tts) voice ids. Persisted in auth.json
// metadata so the TTS read-aloud feature uses the user's chosen voice.
const TTS_VOICES = ["mimo_default", "冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"] as const
const DEFAULT_VOICE = "mimo_default"

type MimoConfig = {
  apiKey: string | undefined
  protocol: "openai" | "anthropic"
  billing: MimoBilling
  region: MimoRegion
  model: string
  contextWindow: number | undefined
  voice: string
}

const DEFAULT_CONFIG: Omit<MimoConfig, "apiKey"> = {
  protocol: "openai",
  billing: "pay-as-you-go",
  region: "sgp",
  model: "mimo-v2.5",
  contextWindow: undefined,
  voice: DEFAULT_VOICE,
}

function parseMetadata(metadata: Record<string, string> | undefined): Omit<MimoConfig, "apiKey"> {
  if (!metadata) return DEFAULT_CONFIG
  const protocol = metadata.protocol === "anthropic" ? "anthropic" : "openai"
  const billing: MimoBilling = metadata.billing === "token-plan" ? "token-plan" : "pay-as-you-go"
  const regionRaw = metadata.region
  const region: MimoRegion = regionRaw === "cn" || regionRaw === "ams" ? regionRaw : "sgp"
  const model = MODEL_PRICES[metadata.model] ? metadata.model : DEFAULT_CONFIG.model
  const cwRaw = metadata.contextWindow ? Number(metadata.contextWindow) : NaN
  const contextWindow = Number.isFinite(cwRaw) && cwRaw > 0 ? cwRaw : undefined
  const voice = TTS_VOICES.includes(metadata.voice as (typeof TTS_VOICES)[number]) ? metadata.voice : DEFAULT_VOICE
  return { protocol, billing, region, model, contextWindow, voice }
}

let warnedEnvKey = false

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const mimoID = ProviderID.make("mimo")
    const auth = yield* Auth.Service

    const buildInfo = (cfg: MimoConfig): Info => {
      const models = buildModels({ protocol: cfg.protocol, billing: cfg.billing, region: cfg.region })
      if (cfg.contextWindow !== undefined) {
        for (const m of Object.values(models)) {
          if (cfg.contextWindow < m.limit.context) m.limit.context = cfg.contextWindow
        }
      }
      return {
        id: mimoID,
        name: "MiMo",
        source: "api",
        env: [],
        key: cfg.apiKey,
        options: {
          apiKey: cfg.apiKey,
          baseURL: Flag.MIO_BASE_URL ?? resolveBaseURL(cfg),
          billing: cfg.billing,
          region: cfg.region,
          protocol: cfg.protocol,
          model: cfg.model,
          contextWindow: cfg.contextWindow,
          voice: cfg.voice,
          currency: currencyFor(cfg.billing, cfg.region),
        },
        models,
      }
    }

    let info: Info = buildInfo({ apiKey: undefined, ...DEFAULT_CONFIG })

    // Resolve config from auth.json on every list/getProvider call so
    // Settings-UI saves are picked up without a restart.
    const refresh = Effect.gen(function* () {
      if (!warnedEnvKey && process.env["MIO_API_KEY"]) {
        warnedEnvKey = true
        console.warn(
          "MIO_API_KEY environment variable is no longer used. Configure MiMo via Settings → Providers → MiMo.",
        )
      }
      const stored = yield* auth.get(mimoID as unknown as string).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (stored?.type === "api") {
        info = buildInfo({ apiKey: stored.key, ...parseMetadata(stored.metadata) })
        return
      }
      info = buildInfo({ apiKey: undefined, ...DEFAULT_CONFIG })
    })

    const list = () =>
      Effect.gen(function* () {
        yield* refresh
        return { [mimoID]: info } as Record<ProviderID, Info>
      })

    const getProvider = (_providerID: ProviderID) =>
      Effect.gen(function* () {
        yield* refresh
        return info
      })

    const getModel = (providerID: ProviderID, modelID: ModelID) => {
      const model = info.models[modelID as string]
      if (!model)
        return Effect.fail(
          new ModelNotFoundError({
            providerID,
            modelID,
            suggestions: Object.keys(info.models),
          }),
        )
      return Effect.succeed(model)
    }

    // The AI SDK runtime is disabled in mimo-desktop — native LLM client is the
    // only invocation path. But session/llm.ts unconditionally fetches
    // getLanguage as part of its precondition Effect.all, so this must succeed.
    // Return an opaque stub: nothing dereferences it in the native path, and
    // the `instanceof GitLabWorkflowLanguageModel` check in llm.ts harmlessly
    // returns false on any non-GitLab object.
    const getLanguage = (_model: Model) => Effect.succeed({} as unknown as LanguageModelV3)

    const closest = (_providerID: ProviderID, query: string[]) => {
      const needle = query.join(" ").toLowerCase()
      const found = Object.keys(info.models).find((id) => id.toLowerCase().includes(needle))
      if (!found) return Effect.succeed(undefined)
      return Effect.succeed({ providerID: mimoID, modelID: found })
    }

    const getSmallModel = (_providerID: ProviderID) => Effect.succeed(info.models["mimo-v2.5"])

    const defaultModel = () =>
      Effect.gen(function* () {
        yield* refresh
        const stored = (info.options.model as string | undefined) ?? "mimo-v2.5"
        const preferredID = Flag.MIO_MODEL ?? stored
        const modelID = ModelID.make(preferredID)
        if (!info.models[preferredID]) {
          return yield* Effect.fail(new ModelNotFoundError({ providerID: mimoID, modelID }))
        }
        return { providerID: mimoID, modelID }
      })

    return Service.of({ list, getProvider, getModel, getLanguage, closest, getSmallModel, defaultModel })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Auth.defaultLayer))

export function toPublicInfo(provider: Info): Info {
  return JSON.parse(
    JSON.stringify(provider, (_, value) => {
      if (typeof value === "function" || typeof value === "symbol" || value === undefined) return undefined
      if (typeof value === "bigint") return value.toString()
      return value
    }),
  )
}

export function parseModel(model: string): { providerID: ProviderID; modelID: ModelID } {
  const parts = model.split("/")
  if (parts.length === 2) {
    return { providerID: ProviderID.make(parts[0]), modelID: ModelID.make(parts[1]) }
  }
  return { providerID: ProviderID.make("mimo"), modelID: ModelID.make(model) }
}

export * as Provider from "./provider"
