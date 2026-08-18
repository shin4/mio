/**
 * The MiMo model catalog, mirroring packages/core/src/mimo-catalog.ts (the v2
 * ModelV2 catalog that drives the app UI). Keep the two in sync until the UI
 * reads models through the dsh runtime instead (MIGRATION.md, Phase 2).
 */
import {
  ReasoningEffortId,
  type LlmModelInfo,
  type LlmModelReasoningInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type ModelModality,
} from "@deepseek-ai/dsh-llm"

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

/**
 * Reasoning tiers MiMo accepts on `reasoning_effort`, weakest to strongest.
 *
 * Established by probing the live API rather than from documentation: every
 * other value tried — `off`, `minimal`, `xhigh`, `max`, `default` — is refused
 * with HTTP 400 "Invalid request parameters", and both `mimo-v2.5` and
 * `mimo-v2.5-pro` accept the same four. Re-probe before widening this list.
 */
export const REASONING_EFFORTS = ["none", "low", "medium", "high"] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

const EFFORT_NAMES: Record<ReasoningEffort, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
}

/** True when `effort` is a tier MiMo will accept. */
export function isReasoningEffort(effort: string): effort is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(effort)
}

// No `defaultEffort`: omitting the field from a request preserves MiMo's own
// default, which is the dsh contract for an adapter that has no opinion.
const reasoning: LlmModelReasoningInfo = {
  efforts: REASONING_EFFORTS.map((effort) => ({
    id: ReasoningEffortId(effort),
    name: EFFORT_NAMES[effort],
  })),
}

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
    reasoning,
  }
}
