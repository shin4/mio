import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2/client"
import { derivePetActivity, PET_IDLE_STATE, petSessionHref, petStateEquals, type PetState } from "./pet"

const textPart = (text: string): Part =>
  ({ id: "p", sessionID: "s", messageID: "m", type: "text", text }) as Part
const reasoningPart = (text: string): Part =>
  ({ id: "p", sessionID: "s", messageID: "m", type: "reasoning", text }) as Part
const toolPart = (tool: string): Part =>
  ({ id: "p", sessionID: "s", messageID: "m", type: "tool", callID: "c", tool, state: { status: "running" } }) as Part
const stepStartPart = (): Part => ({ id: "p", sessionID: "s", messageID: "m", type: "step-start" }) as Part

describe("derivePetActivity", () => {
  test("returns null for empty or undefined parts", () => {
    expect(derivePetActivity(undefined)).toBeNull()
    expect(derivePetActivity([])).toBeNull()
  })

  test("returns trimmed text from the latest text part", () => {
    expect(derivePetActivity([textPart("  hello world  ")])).toBe("hello world")
  })

  test("prefers the most recent displayable part", () => {
    const parts = [textPart("first"), toolPart("bash"), textPart("latest")]
    expect(derivePetActivity(parts)).toBe("latest")
  })

  test("falls back to tool name when the last meaningful part is a tool call", () => {
    const parts = [textPart("thinking"), toolPart("edit")]
    expect(derivePetActivity(parts)).toBe("edit")
  })

  test("uses reasoning text when present", () => {
    expect(derivePetActivity([reasoningPart("considering options")])).toBe("considering options")
  })

  test("ignores structural parts like step-start", () => {
    const parts = [textPart("real activity"), stepStartPart()]
    expect(derivePetActivity(parts)).toBe("real activity")
  })

  test("ignores empty text parts", () => {
    const parts = [textPart("kept"), textPart("   ")]
    expect(derivePetActivity(parts)).toBe("kept")
  })

  test("collapses whitespace and truncates long text", () => {
    const long = "word ".repeat(40)
    const result = derivePetActivity([textPart(long)])
    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(80)
    expect(result!.endsWith("…")).toBe(true)
  })
})

describe("petSessionHref", () => {
  test("builds a session route from dir64 + id", () => {
    expect(petSessionHref("ZGly", "ses_123")).toBe("/ZGly/session/ses_123")
  })

  test("returns null when either part is missing", () => {
    expect(petSessionHref(undefined, "ses_123")).toBeNull()
    expect(petSessionHref("ZGly", undefined)).toBeNull()
    expect(petSessionHref("", "ses_123")).toBeNull()
  })
})

describe("petStateEquals", () => {
  const base: PetState = { hasSession: true, status: "busy", title: "T", activity: "a", href: "/h" }

  test("same reference and idle constant", () => {
    expect(petStateEquals(PET_IDLE_STATE, PET_IDLE_STATE)).toBe(true)
    expect(petStateEquals(base, { ...base })).toBe(true)
  })

  test("null handling", () => {
    expect(petStateEquals(null, null)).toBe(true)
    expect(petStateEquals(null, base)).toBe(false)
    expect(petStateEquals(base, null)).toBe(false)
  })

  test("detects changes in each field", () => {
    expect(petStateEquals(base, { ...base, status: "idle" })).toBe(false)
    expect(petStateEquals(base, { ...base, title: "X" })).toBe(false)
    expect(petStateEquals(base, { ...base, activity: null })).toBe(false)
    expect(petStateEquals(base, { ...base, href: null })).toBe(false)
    expect(petStateEquals(base, { ...base, hasSession: false })).toBe(false)
  })
})
