/**
 * Immutable-region hashing for MiMo prefix-cache drift detection.
 *
 * MiMo's cloud API (OpenAI-compatible) uses automatic prefix caching: a cache
 * hit requires the exact byte prefix of a request to match an earlier one. The
 * "immutable" prefix of a session is the system prompt + tool list — if it
 * changes mid-session, every cached prefix after it is invalidated.
 *
 * We hash that prefix on the first request and compare it on every later
 * request (see session/llm.ts), publishing a `Session.Event.PrefixDrift` event
 * when it changes so the regression can be surfaced and diagnosed.
 */

import { createHash } from "crypto"
import type { Tool } from "ai"

/**
 * Deterministic sha256 of the immutable region: system segments + sorted tool
 * names. Tool names are sorted so ordering never causes spurious drift; only
 * names are hashed (not full schemas) because the tool definitions come after
 * the system block in the request body and may evolve without breaking the
 * prefix.
 */
export function computeImmutableHash(systemSegments: readonly string[], tools: Record<string, Tool>): string {
  const toolNames = Object.keys(tools).sort()
  const canonical = JSON.stringify({ system: systemSegments, tools: toolNames })
  return createHash("sha256").update(canonical).digest("hex")
}

export * as ContextRegions from "./context"
