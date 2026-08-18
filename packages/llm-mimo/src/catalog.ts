/**
 * The MiMo model catalog, mirroring packages/core/src/mimo-catalog.ts (the v2
 * ModelV2 catalog that drives the app UI). Keep the two in sync until the UI
 * reads models through the dsh runtime instead (MIGRATION.md, Phase 2).
 */
import type { LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, ModelModality } from "@deepseek-ai/dsh-llm"

export const PROVIDER = "mimo"
export const CONTEXT_WINDOW = 1_048_576
export const DEFAULT_MAX_TOKENS = 128_000

export const providerInfo: LlmProviderInfo = { id: PROVIDER, name: "MiMo" }

// dsh's modality vocabulary is text|image today; MiMo v2.5 also takes
// audio/video input, which needs a ModelModalityMap extension (Phase 1).
const MODELS: readonly { id: string; name: string; description: string; inputModalities: ModelModality[] }[] = [
  {
    id: "mimo-v2.5",
    name: "MiMo V2.5",
    description: "Multimodal flagship",
    inputModalities: ["text", "image"],
  },
  {
    id: "mimo-v2.5-pro",
    name: "MiMo V2.5 Pro",
    description: "Text-only, deeper reasoning",
    inputModalities: ["text"],
  },
]

export const DEFAULT_MODEL_ID = "mimo-v2.5"

export function listModels(provider: string): LlmModelInfo[] {
  return MODELS.map((model) => ({ provider, ...model }))
}

export function resolveModel(provider: string, model: string): LlmResolvedModelInfo {
  const known = MODELS.find((candidate) => candidate.id === model)
  // Catalog membership is advisory: unlisted ids still resolve to a minimal
  // identity instead of rejecting the request (dsh adapter contract).
  if (!known) return { provider, id: model, name: model }
  return {
    provider,
    ...known,
    context: { contextWindow: CONTEXT_WINDOW },
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
  }
}
