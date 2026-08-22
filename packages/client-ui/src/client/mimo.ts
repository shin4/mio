/**
 * The MiMo connection facts Mio's onboarding needs, and nothing more.
 *
 * MiMo sells two billing tracks on separate endpoints, and the key itself says
 * which one it belongs to: `tp-` for a token plan, `sk-` for pay-as-you-go.
 * Onboarding therefore asks for the key first and derives the track, instead of
 * asking the user to pick a track and then paste a key that may not match it —
 * which is the order the archived Solid form used
 * (`archive/packages/app/src/components/mimo-connect-form.tsx`) and the one
 * mismatch it could not prevent.
 *
 * Region is still a question, but only for a token plan: pay-as-you-go serves
 * one endpoint worldwide.
 */

/** The credential reference the composition records for the MiMo route. */
export const KEY_REF = "MIO_API_KEY"

/** The settings namespace and path `mio.patch.yml` configures MiMo under. */
export const SETTINGS_NS = "llm-pi-ai"
export const BASE_URL_PATH = ["providers", "mimo", "baseURL"]

/** The wire protocol the route speaks; `discoverModels` needs it named. */
export const PROTOCOL = "openai-completions"

/** Where a key is issued. */
export const PLATFORM_URL = "https://platform.xiaomimimo.com"

/** Token-plan regions, in the order the picker offers them. */
export const REGIONS = ["cn", "sgp", "ams"] as const
export type Region = (typeof REGIONS)[number]

/** Pay-as-you-go serves one endpoint regardless of region. */
const PAY_AS_YOU_GO = "https://api.xiaomimimo.com/v1"

/**
 * True when a key belongs to a token plan, which is the only case that needs a
 * region. The prefix is the platform's own convention, and it is used as a
 * *hint*, never a gate: an unrecognized prefix falls through to pay-as-you-go
 * and the endpoint is proven by the live check before anything is stored, so a
 * key shape this does not know about still connects rather than being refused.
 */
export function isTokenPlan(key: string): boolean {
  return key.startsWith("tp-")
}

/**
 * The endpoint a key should talk to.
 * @param key - the API key as typed, already trimmed.
 * @param region - the token-plan region; ignored for pay-as-you-go.
 */
export function endpointFor(key: string, region: Region): string {
  return isTokenPlan(key) ? `https://token-plan-${region}.xiaomimimo.com/v1` : PAY_AS_YOU_GO
}
