import type { SessionContextBreakdownSegment } from "@/components/session/session-context-breakdown"

export type CapsuleSegmentKey = "messages" | "tool" | "system" | "other"

export type CapsuleSegment = {
  key: CapsuleSegmentKey
  tokens: number
  percent: number
}

const ORDER: CapsuleSegmentKey[] = ["messages", "tool", "system", "other"]

export function toCapsuleSegments(breakdown: SessionContextBreakdownSegment[]): CapsuleSegment[] {
  const bucket = (key: SessionContextBreakdownSegment["key"]): CapsuleSegmentKey =>
    key === "user" || key === "assistant" ? "messages" : key
  const tokens: Record<CapsuleSegmentKey, number> = { messages: 0, tool: 0, system: 0, other: 0 }
  for (const part of breakdown) tokens[bucket(part.key)] += part.tokens
  const total = ORDER.reduce((sum, key) => sum + tokens[key], 0)
  if (total <= 0) return []
  return ORDER.filter((key) => tokens[key] > 0).map((key) => ({
    key,
    tokens: tokens[key],
    percent: Math.round((tokens[key] / total) * 100),
  }))
}
