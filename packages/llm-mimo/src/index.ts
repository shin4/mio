/**
 * Register a {@link MimoAdapter} for the `mimo` provider route on `ctx.llm`.
 *
 * Scaffold status (MIGRATION.md, Phase 1): connection facts are frozen at load
 * from cordis.yml config. Follow-ups port the rest of the archived MiMo stack —
 * settings/credentials seams (live key + billing switches like llm-deepseek),
 * multimodal parts, the tool-call repair waterfall, prefix-cache observability,
 * and the Anthropic-messages protocol option.
 *
 * @module @mio/llm-mimo
 */
import type { Context } from "@deepseek-ai/cordis"
import z from "@deepseek-ai/schemastery"
import { MimoAdapter } from "./adapter.ts"
import { PROVIDER } from "./catalog.ts"
import { DEFAULT_API_KEY_ENV, resolveBaseURL, type MimoBilling, type MimoRegion } from "./endpoints.ts"

export { MimoAdapter } from "./adapter.ts"
export type { MimoAdapterOptions } from "./adapter.ts"
export * from "./endpoints.ts"
export { DEFAULT_MODEL_ID, PROVIDER } from "./catalog.ts"

export const name = "llm-mimo"
export const inject = ["llm"]

export interface Config {
  /** MiMo billing track; selects the endpoint family. */
  billing?: MimoBilling
  /** token-plan region; ignored for pay-as-you-go. */
  region?: MimoRegion
  /** Endpoint override; wins over billing/region resolution. */
  baseURL?: string
  /** Credential reference (environment-variable name) holding the MiMo key. */
  apiKeyEnv?: string
}

export const Config: z<Config> = z.object({
  billing: z.union(["pay-as-you-go", "token-plan"]).default("pay-as-you-go"),
  region: z.union(["cn", "sgp", "ams"]),
  baseURL: z.string(),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV),
})

export function apply(ctx: Context, config: Config): void {
  ctx.llm.registerAdapter(
    [PROVIDER],
    new MimoAdapter({
      baseURL: config.baseURL ?? resolveBaseURL({ billing: config.billing, region: config.region, protocol: "openai" }),
      apiKeyEnv: config.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    }),
  )
}
