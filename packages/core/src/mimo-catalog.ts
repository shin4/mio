import { ModelV2 } from "./model"
import { ProviderV2 } from "./provider"
import { DateTime } from "effect"

const MIO_PROVIDER = ProviderV2.ID.make("mimo")

const MIO_MULTIMODAL_INPUT = ["text", "image/*", "audio/*", "video/*"]
const MIO_TEXT_INPUT = ["text"]

function mimoModel(params: {
  id: string
  name: string
  contextTokens: number
  input: string[]
  inputCostPerM: number
  outputCostPerM: number
  cacheReadCostPerM: number
  cacheWriteCostPerM: number
  protocol: "openai" | "anthropic"
}): ModelV2.Info {
  const endpointType = params.protocol === "anthropic" ? "anthropic/messages" : "openai/completions"
  const endpointUrl =
    params.protocol === "anthropic"
      ? "https://platform.xiaomimimo.com/anthropic/v1"
      : "https://platform.xiaomimimo.com/v1"

  return new ModelV2.Info({
    id: ModelV2.ID.make(params.id),
    apiID: ModelV2.ID.make(params.id),
    providerID: MIO_PROVIDER,
    family: ModelV2.Family.make("mimo"),
    name: params.name,
    endpoint: {
      type: endpointType,
      url: endpointUrl,
    } as ProviderV2.Endpoint,
    capabilities: {
      tools: true,
      input: [...params.input],
      output: ["text"],
    },
    options: {
      headers: {},
      body: {},
      aisdk: { provider: {}, request: {} },
    },
    variants: [],
    time: {
      released: DateTime.makeUnsafe(new Date("2026-04-22").getTime()),
    },
    cost: [
      {
        input: params.inputCostPerM / 1_000_000,
        output: params.outputCostPerM / 1_000_000,
        cache: {
          read: params.cacheReadCostPerM / 1_000_000,
          write: params.cacheWriteCostPerM / 1_000_000,
        },
      },
    ],
    status: "active",
    enabled: true,
    limit: {
      context: params.contextTokens,
      output: 128_000,
    },
  })
}

export const MODELS = {
  "mimo-v2.5": mimoModel({
    id: "mimo-v2.5",
    name: "MiMo V2.5",
    contextTokens: 1_048_576,
    input: MIO_MULTIMODAL_INPUT,
    inputCostPerM: 2.0,
    outputCostPerM: 6.0,
    cacheReadCostPerM: 0.2,
    cacheWriteCostPerM: 2.5,
    protocol: "openai",
  }),
  "mimo-v2.5-pro": mimoModel({
    id: "mimo-v2.5-pro",
    name: "MiMo V2.5 Pro",
    contextTokens: 1_048_576,
    input: MIO_TEXT_INPUT,
    inputCostPerM: 4.0,
    outputCostPerM: 12.0,
    cacheReadCostPerM: 0.4,
    cacheWriteCostPerM: 5.0,
    protocol: "openai",
  }),
} as const

export type ModelID = keyof typeof MODELS

export const ALL_MODELS = Object.values(MODELS)

export const DEFAULT_MODEL_ID: ModelID = "mimo-v2.5"

export * as MimoCatalog from "./mimo-catalog"
