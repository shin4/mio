/**
 * Tool-call repair pipeline for MiMo.
 *
 * Four repair stages (run in order at different injection points):
 *
 * 1. SCHEMA FLATTENING  — deep/wide schemas → dot-notation before request.
 *    Injection point: request.ts::prepare (before build)
 *
 * 2. REASONING SCAVENGER — extract tool calls from reasoning text when the
 *    model forgot to emit them properly.
 *    Injection point: openai-chat.ts / anthropic-messages.ts (stream close)
 *
 * 3. TRUNCATION REPAIR  — recover partial JSON when finish_reason === "length".
 *    Injection point: tool-stream.ts::finishAll
 *
 * 4. STORM SUPPRESSION  — synthetic user message when the same tool+args
 *    appear ≥ N times in one turn.
 *    Injection point: processor.ts (handled via existing doom-loop + message injection)
 *
 * Each stage emits a `session.tool.repaired` bus event for observability.
 */

import { Schema } from "effect"
import type { Tool } from "ai"

// ─── Bus event ───────────────────────────────────────────────────────────────

export const RepairStage = Schema.Literals([
  "schema-flatten",
  "reasoning-scavenge",
  "truncation",
  "storm-suppress",
])
export type RepairStage = typeof RepairStage.Type

// ─── Stage 1: Schema flattening ───────────────────────────────────────────────

type JsonSchema = Record<string, unknown>

function schemaDepth(schema: unknown, current = 0): number {
  if (!schema || typeof schema !== "object") return current
  const s = schema as JsonSchema
  if (s.properties && typeof s.properties === "object") {
    return Math.max(
      ...Object.values(s.properties as Record<string, unknown>).map((v) => schemaDepth(v, current + 1)),
    )
  }
  return current
}

function schemaParamCount(schema: JsonSchema): number {
  if (!schema.properties || typeof schema.properties !== "object") return 0
  return Object.keys(schema.properties as object).length
}

function flattenSchema(
  schema: JsonSchema,
  prefix = "",
  result: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!schema.properties || typeof schema.properties !== "object") {
    if (prefix) result[prefix] = schema
    return result
  }
  for (const [key, value] of Object.entries(schema.properties as Record<string, JsonSchema>)) {
    const dotKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === "object" && value.type === "object" && value.properties) {
      flattenSchema(value, dotKey, result)
    } else {
      result[dotKey] = value
    }
  }
  return result
}

/**
 * Flatten tool schemas that are too deep or too wide for reliable MiMo parsing.
 * Returns a new tool record with patched schemas where applicable.
 */
export function flattenToolSchemas(tools: Record<string, Tool>): {
  tools: Record<string, Tool>
  flattened: string[]
} {
  const flattened: string[] = []
  const result: Record<string, Tool> = {}

  for (const [name, tool] of Object.entries(tools)) {
    const schema = (tool as any).inputSchema ?? (tool as any).parameters
    if (!schema || typeof schema !== "object") {
      result[name] = tool
      continue
    }

    const jsonSchema = ("jsonSchema" in schema ? schema.jsonSchema : schema) as JsonSchema
    const depth = schemaDepth(jsonSchema)
    const count = schemaParamCount(jsonSchema)

    if (depth <= 2 && count <= 10) {
      result[name] = tool
      continue
    }

    // Flatten to dot-notation
    const flatProperties = flattenSchema(jsonSchema)
    const flatSchema: JsonSchema = {
      ...jsonSchema,
      properties: flatProperties,
      required: Object.keys(flatProperties),
    }
    delete flatSchema.additionalProperties

    result[name] = {
      ...tool,
      inputSchema: { ...schema, jsonSchema: flatSchema },
    } as Tool
    flattened.push(name)
  }

  return { tools: result, flattened }
}

/**
 * Re-nest dot-notation arguments back into the original deep structure.
 * Called before tool execution when a schema was flattened.
 */
export function unflattenArgs(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (!key.includes(".")) {
      result[key] = value
      continue
    }
    const parts = key.split(".")
    let current = result
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
        current[parts[i]] = {}
      }
      current = current[parts[i]] as Record<string, unknown>
    }
    current[parts[parts.length - 1]] = value
  }
  return result
}

// ─── Stage 2: Reasoning scavenger ────────────────────────────────────────────

interface ScavengedCall {
  name: string
  arguments: Record<string, unknown>
}

const TOOL_CALL_PATTERNS = [
  // <tool_call>{"name":"foo","arguments":{...}}</tool_call>
  /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g,
  // ```json\n{"name":"foo","arguments":{...}}\n```
  /```(?:json)?\n(\{[\s\S]*?"(?:name|function)"\s*:\s*"[^"]+"\s*,[\s\S]*?\})\n```/g,
]

/**
 * Scan reasoning/thinking text for tool calls the model may have "forgotten"
 * to emit in the structured tool-call channel.
 */
export function scavengeToolCallsFromReasoning(reasoning: string): ScavengedCall[] {
  const found: ScavengedCall[] = []
  const seen = new Set<string>()

  for (const pattern of TOOL_CALL_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of reasoning.matchAll(pattern)) {
      try {
        const parsed = JSON.parse(match[1]) as Record<string, unknown>
        const name = parsed.name ?? parsed.function
        const args = parsed.arguments ?? parsed.args ?? parsed.parameters ?? {}
        if (typeof name !== "string" || !name) continue
        const dedup = `${name}:${JSON.stringify(args)}`
        if (seen.has(dedup)) continue
        seen.add(dedup)
        found.push({
          name,
          arguments: typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {},
        })
      } catch {
        // Not valid JSON; skip
      }
    }
  }

  return found
}

// ─── Stage 3: Truncation repair ───────────────────────────────────────────────

/**
 * Attempt to recover partial JSON from a truncated tool-call arguments string.
 * Uses the `partial-json` library (already in package.json) for bracket-balancing.
 */
export function repairTruncatedJson(raw: string): { value: unknown; ok: boolean } {
  try {
    const parsed = JSON.parse(raw)
    return { value: parsed, ok: true }
  } catch {
    // Try partial-json recovery
    try {
      // Dynamic import to keep this tree-shakeable
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { parse } = require("partial-json") as { parse: (s: string) => unknown }
      const value = parse(raw)
      return { value, ok: value !== undefined }
    } catch {
      return { value: {}, ok: false }
    }
  }
}

// ─── Stage 4: Storm suppression ───────────────────────────────────────────────

export const STORM_THRESHOLD = 3

/**
 * Maintain a per-turn call counter to detect storm patterns.
 * Returns the suppression message to inject if the threshold is crossed,
 * or undefined if the call should proceed normally.
 */
export class StormDetector {
  private counts = new Map<string, number>()

  check(toolName: string, args: unknown): string | undefined {
    const key = `${toolName}:${JSON.stringify(args)}`
    const count = (this.counts.get(key) ?? 0) + 1
    this.counts.set(key, count)

    if (count >= STORM_THRESHOLD) {
      return (
        `You called "${toolName}" with identical arguments ${count} times in this turn. ` +
        `Stop and try a fundamentally different approach to solve the problem.`
      )
    }
    return undefined
  }

  reset() {
    this.counts.clear()
  }
}

export * as ToolRepair from "./tool-repair"
