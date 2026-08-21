/**
 * Register a {@link MimoAdapter} for the `mimo` provider route on `ctx.llm`,
 * with connection facts resolved per request instead of frozen at load: the
 * plugin layers its `cordis.yml` entry config under the optional `llm-mimo`
 * user-settings section (`ctx.settings`) and resolves the API key through the
 * optional credential seam (`ctx.credentials`), so a changed billing track,
 * region, or key reaches the very next request without restarting anything.
 * Registering the route as a configurable provider is what puts MiMo on the
 * web Models page.
 *
 * Follow-ups (MIGRATION.md, Phase 1): multimodal parts, the tool-call repair
 * waterfall, prefix-cache observability, and the Anthropic-messages protocol.
 *
 * @module @mio/llm-mimo
 */
import type { Context } from "@deepseek-ai/cordis"
import z from "@deepseek-ai/schemastery"
import { assertUsableApiKey, LlmError } from "@deepseek-ai/dsh-llm"
import { credentialRef } from "@deepseek-ai/dsh-credentials"
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment"
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings"
import { MimoAdapter, type MimoConnection } from "./adapter.ts"
import { PROVIDER } from "./catalog.ts"
import { DEFAULT_API_KEY_ENV, resolveBaseURL, type MimoBilling, type MimoRegion } from "./endpoints.ts"

export { MimoAdapter } from "./adapter.ts"
export type { MimoAdapterOptions, MimoConnection } from "./adapter.ts"
export * from "./endpoints.ts"
export { DEFAULT_MODEL_ID, PROVIDER } from "./catalog.ts"

export const name = "llm-mimo"
export const inject = ["llm"]

const NS = settingsNamespace("llm-mimo")

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
  // `credential-ref` is what makes the web Models page render the API-key input
  // and write the secret through the credentials service.
  apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
  billing: z.union(["pay-as-you-go", "token-plan"]).default("pay-as-you-go"),
  region: z.union(["cn", "sgp", "ams"]),
  baseURL: z.string(),
})

/**
 * The one explicit resolve step from raw config to validated connection facts.
 * Programmatic construction may bypass Schemastery normalization, so defaults
 * are re-judged here — at load (fail loud) and per settings snapshot.
 */
export function resolveConnection(config: Config): MimoConnection {
  const billing = config.billing ?? "pay-as-you-go"
  if (billing === "token-plan" && config.region === undefined)
    throw new Error("llm-mimo: region is required for the token-plan billing track")
  return {
    baseURL: config.baseURL ?? resolveBaseURL({ billing, region: config.region, protocol: "openai" }),
    apiKeyRef: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV),
  }
}

export function apply(ctx: Context, config: Config): void {
  let current = () => config
  let lastRaw: Config | undefined
  let lastGood: MimoConnection | undefined

  const connection = () => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    const next = resolveConnection(raw)
    lastRaw = raw
    lastGood = next
    return next
  }
  // Fail loud at load if the composition entry itself is invalid.
  connection()

  const resolveApiKey = async (ref: string) => {
    const credentials = ctx.get("credentials")
    if (credentials !== undefined) {
      const hit = await credentials.resolve(credentialRef(ref))
      if (hit !== undefined) return assertUsableApiKey(hit.value, "llm-mimo", ref)
    }
    const ambient = launchEnvironmentOf(ctx).get(ref)
    if (ambient !== undefined && ambient.value.length > 0) return assertUsableApiKey(ambient.value, "llm-mimo", ref)
    throw new LlmError(
      `llm-mimo: no API key for provider route "${PROVIDER}"; store ${ref} through the credentials service (the web Models page writes it), or export ${ref} in the launching environment`,
      "MISSING_CREDENTIAL",
    )
  }

  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: "MiMo", settingsNs: NS, settingsPath: [] },
  ])
  ctx.llm.registerAdapter([PROVIDER], new MimoAdapter({ connection, resolveApiKey }))

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {},
  })
}
