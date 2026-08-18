import type { RouteDefaultsInput } from "../route/client"
import { Auth } from "../route/auth"
import type { ProviderAuthOption } from "../route/auth-options"
import { ProviderID, type ModelID } from "../schema"
import * as OpenAIChat from "../protocols/openai-chat"
import * as AnthropicMessages from "../protocols/anthropic-messages"

export const id = ProviderID.make("mimo")

export const routes = [OpenAIChat.route, AnthropicMessages.route]

export type Protocol = "openai" | "anthropic"

/**
 * MiMo offers two independent billing tracks with separate keys + endpoints:
 *   - "pay-as-you-go" — USD per-token billing, key prefix `sk-`
 *   - "token-plan"    — subscription-based, key prefix `tp-`, region-aware
 *
 * Endpoints derived from official docs (platform.xiaomimimo.com/docs):
 *   pay-as-you-go: api.xiaomimimo.com/{v1,anthropic}
 *   token-plan:    token-plan-{cn|sgp|ams}.xiaomimimo.com/{v1,anthropic}
 */
export type Billing = "pay-as-you-go" | "token-plan"
export type Region = "cn" | "sgp" | "ams"

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

export function resolveBaseURL(input: { billing?: Billing; region?: Region; protocol?: Protocol }): string {
  const protocol = input.protocol ?? "openai"
  if ((input.billing ?? "pay-as-you-go") === "token-plan") {
    const region = input.region ?? "sgp"
    return TOKEN_PLAN_URLS[region][protocol]
  }
  return PAY_AS_YOU_GO_URLS[protocol]
}

export type Config = RouteDefaultsInput &
  ProviderAuthOption<"optional"> & {
    readonly baseURL?: string
    readonly protocol?: Protocol
    readonly billing?: Billing
    readonly region?: Region
  }

// MiMo uses an `api-key` header (lowercased), not Authorization: Bearer.
// See platform.xiaomimimo.com/docs/zh-CN/quick-start/first-api-call.
const auth = (options: ProviderAuthOption<"optional">) => {
  if ("auth" in options && options.auth) return options.auth
  return Auth.optional("apiKey" in options ? options.apiKey : undefined, "apiKey")
    .orElse(Auth.config("MIO_API_KEY"))
    .pipe(Auth.header("api-key"))
}

const configuredOpenAIRoute = (input: Config) => {
  const { apiKey: _, auth: _auth, baseURL, protocol: _p, billing: _b, region: _r, ...rest } = input
  const base = baseURL ?? resolveBaseURL({ ...input, protocol: "openai" })
  return OpenAIChat.route.with({ ...rest, endpoint: { baseURL: base }, auth: auth(input) })
}

const configuredAnthropicRoute = (input: Config) => {
  const { apiKey: _, auth: _auth, baseURL, protocol: _p, billing: _b, region: _r, ...rest } = input
  const base = baseURL ?? resolveBaseURL({ ...input, protocol: "anthropic" })
  return AnthropicMessages.route.with({ ...rest, endpoint: { baseURL: base }, auth: auth(input) })
}

export const configure = (input: Config = {}) => {
  const protocol = input.protocol ?? "openai"
  const route = protocol === "anthropic" ? configuredAnthropicRoute(input) : configuredOpenAIRoute(input)
  return {
    id,
    protocol,
    billing: input.billing ?? "pay-as-you-go",
    region: input.region,
    model: (modelID: string | ModelID) => route.model({ id: modelID }),
    configure,
  }
}

export const provider = configure()
export const model = provider.model
