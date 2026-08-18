import { describe, expect, test } from "bun:test"
import { toCapsuleSegments } from "./status-popover-context-data"
import type { SessionContextBreakdownSegment } from "@/components/session/session-context-breakdown"

const seg = (key: SessionContextBreakdownSegment["key"], tokens: number): SessionContextBreakdownSegment => ({
  key,
  tokens,
  width: 0,
  percent: 0,
})

describe("toCapsuleSegments", () => {
  test("merges user + assistant into a single messages segment", () => {
    const out = toCapsuleSegments([seg("user", 30), seg("assistant", 20), seg("tool", 50)])
    expect(out.map((s) => s.key)).toEqual(["messages", "tool"])
    expect(out.find((s) => s.key === "messages")?.tokens).toBe(50)
  })

  test("keeps system / tool / other and orders messages,tool,system,other", () => {
    const out = toCapsuleSegments([seg("other", 10), seg("system", 20), seg("tool", 30), seg("user", 40)])
    expect(out.map((s) => s.key)).toEqual(["messages", "tool", "system", "other"])
  })

  test("percent is share of total; messages is half, sum is within rounding of 100", () => {
    const out = toCapsuleSegments([seg("user", 25), seg("assistant", 25), seg("tool", 50)])
    expect(out.find((s) => s.key === "messages")?.percent).toBe(50)
    const sum = out.reduce((s, x) => s + x.percent, 0)
    expect(sum).toBeGreaterThanOrEqual(99)
    expect(sum).toBeLessThanOrEqual(101)
  })

  test("drops zero segments and returns [] for empty input", () => {
    expect(toCapsuleSegments([])).toEqual([])
    expect(toCapsuleSegments([seg("tool", 0)])).toEqual([])
  })
})
