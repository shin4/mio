import { beforeAll, describe, expect, mock, test } from "bun:test"

let mod: typeof import("./mimo-pro-celebration")

beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useParams: () => ({}),
  }))
  mock.module("@opencode-ai/ui/context", () => ({
    createSimpleContext: () => ({
      use: () => undefined,
      provider: () => undefined,
    }),
  }))
  mod = await import("./mimo-pro-celebration")
})

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

describe("mimo pro model keys", () => {
  test("builds a stable model effect key only when a model is present", () => {
    expect(mod.modelEffectKey({ provider: { id: "mimo" }, id: "mimo-v2.5-pro" })).toBe("mimo:mimo-v2.5-pro")
    expect(mod.modelEffectKey(undefined)).toBeUndefined()
  })

  test("matches any mimo -pro model and nothing else", () => {
    expect(mod.isMimoProModelKey("mimo:mimo-v2.5-pro")).toBe(true)
    expect(mod.isMimoProModelKey("mimo:mimo-v2.6-pro")).toBe(true)
    expect(mod.isMimoProModelKey("mimo:mimo-v2.5")).toBe(false)
    expect(mod.isMimoProModelKey("anthropic:claude-pro")).toBe(false)
    expect(mod.isMimoProModelKey(undefined)).toBe(false)
  })

  test("triggers only on a change onto a mimo pro model", () => {
    expect(mod.shouldTriggerMimoProCelebration(undefined, "mimo:mimo-v2.5-pro")).toBe(false)
    expect(mod.shouldTriggerMimoProCelebration("mimo:mimo-v2.5-pro", "mimo:mimo-v2.5-pro")).toBe(false)
    expect(mod.shouldTriggerMimoProCelebration("mimo:mimo-v2.5", "mimo:mimo-v2.5-pro")).toBe(true)
    expect(mod.shouldTriggerMimoProCelebration("mimo:mimo-v2.5-pro", "mimo:mimo-v2.5")).toBe(false)
  })
})

describe("mimo pro celebration decisions", () => {
  const none = new Set<string>()

  test("does nothing on the first observation", () => {
    expect(
      mod.nextMimoProCelebration({ previous: undefined, current: ["s1", "mimo:mimo-v2.5-pro"], played: none }),
    ).toEqual({ type: "none" })
  })

  test("plays full on the first switch to pro in a session, short afterwards", () => {
    expect(
      mod.nextMimoProCelebration({
        previous: ["s1", "mimo:mimo-v2.5"],
        current: ["s1", "mimo:mimo-v2.5-pro"],
        played: none,
      }),
    ).toEqual({ type: "play", variant: "full" })
    expect(
      mod.nextMimoProCelebration({
        previous: ["s1", "mimo:mimo-v2.5"],
        current: ["s1", "mimo:mimo-v2.5-pro"],
        played: new Set(["s1"]),
      }),
    ).toEqual({ type: "play", variant: "short" })
  })

  test("gives each session its own full play", () => {
    expect(
      mod.nextMimoProCelebration({
        previous: ["s2", "mimo:mimo-v2.5"],
        current: ["s2", "mimo:mimo-v2.5-pro"],
        played: new Set(["s1"]),
      }),
    ).toEqual({ type: "play", variant: "full" })
  })

  test("stops when switching away from pro", () => {
    expect(
      mod.nextMimoProCelebration({
        previous: ["s1", "mimo:mimo-v2.5-pro"],
        current: ["s1", "mimo:mimo-v2.5"],
        played: new Set(["s1"]),
      }),
    ).toEqual({ type: "stop" })
  })

  test("stops on session navigation instead of celebrating the landing model", () => {
    expect(
      mod.nextMimoProCelebration({
        previous: ["s1", "mimo:mimo-v2.5"],
        current: ["s2", "mimo:mimo-v2.5-pro"],
        played: none,
      }),
    ).toEqual({ type: "stop" })
  })

  test("does nothing while pro stays selected", () => {
    expect(
      mod.nextMimoProCelebration({
        previous: ["s1", "mimo:mimo-v2.5-pro"],
        current: ["s1", "mimo:mimo-v2.5-pro"],
        played: new Set(["s1"]),
      }),
    ).toEqual({ type: "none" })
  })
})

describe("mimo pro celebration playback", () => {
  test("plays after a frame and clears on stop", async () => {
    const playback = mod.createMimoProCelebrationPlayback()
    expect(playback.celebration()).toBeUndefined()

    playback.play("full")
    expect(playback.celebration()).toBeUndefined()
    await frame()
    expect(playback.celebration()).toBe("full")

    playback.stop()
    expect(playback.celebration()).toBeUndefined()
  })

  test("restarts cleanly when play is called mid-play", async () => {
    const playback = mod.createMimoProCelebrationPlayback()
    playback.play("full")
    await frame()
    expect(playback.celebration()).toBe("full")

    playback.play("short")
    expect(playback.celebration()).toBeUndefined()
    await frame()
    expect(playback.celebration()).toBe("short")
  })

  test("a stop cancels a pending play frame", async () => {
    const playback = mod.createMimoProCelebrationPlayback()
    playback.play("full")
    playback.stop()
    await frame()
    expect(playback.celebration()).toBeUndefined()
  })
})
