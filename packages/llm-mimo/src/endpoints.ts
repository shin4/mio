/**
 * MiMo endpoint + credential facts, ported from the archived Effect runtime
 * (archive/packages/llm/src/providers/mimo.ts).
 *
 * MiMo offers two independent billing tracks with separate keys + endpoints:
 *   - "pay-as-you-go" — USD per-token billing, key prefix `sk-`
 *   - "token-plan"    — subscription-based, key prefix `tp-`, region-aware
 *
 * Endpoints derived from official docs (platform.xiaomimimo.com/docs):
 *   pay-as-you-go: api.xiaomimimo.com/{v1,anthropic}
 *   token-plan:    token-plan-{cn|sgp|ams}.xiaomimimo.com/{v1,anthropic}
 *
 * MiMo authenticates with an `api-key` header, NOT `Authorization: Bearer`.
 * See platform.xiaomimimo.com/docs/zh-CN/quick-start/first-api-call.
 */

export type MimoProtocol = "openai" | "anthropic"
export type MimoBilling = "pay-as-you-go" | "token-plan"
export type MimoRegion = "cn" | "sgp" | "ams"

export const DEFAULT_API_KEY_ENV = "MIO_API_KEY"

const PAY_AS_YOU_GO_URLS: Record<MimoProtocol, string> = {
  openai: "https://api.xiaomimimo.com/v1",
  anthropic: "https://api.xiaomimimo.com/anthropic",
}

const TOKEN_PLAN_URLS: Record<MimoRegion, Record<MimoProtocol, string>> = {
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
}

export function resolveBaseURL(input: {
  billing?: MimoBilling
  region?: MimoRegion
  protocol?: MimoProtocol
}): string {
  const protocol = input.protocol ?? "openai"
  if ((input.billing ?? "pay-as-you-go") === "token-plan") {
    const region = input.region ?? "sgp"
    return TOKEN_PLAN_URLS[region][protocol]
  }
  return PAY_AS_YOU_GO_URLS[protocol]
}
