import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { colorForWorktree, createSessionKeyReader, ensureSessionKey, pruneSessionKeys } from "./layout"

const AVATAR_COLOR_KEYS = ["pink", "mint", "orange", "purple", "cyan", "lime"]

describe("colorForWorktree", () => {
  test("is deterministic for the same path", () => {
    const path = "/Users/me/Developer/project-a"
    expect(colorForWorktree(path)).toBe(colorForWorktree(path))
  })

  test("always returns a valid palette key", () => {
    for (const path of ["/a", "/Users/me/x", "C:\\\\repo", "", "/Users/me/Developer/Side2/opencode"]) {
      expect(AVATAR_COLOR_KEYS).toContain(colorForWorktree(path))
    }
  })

  test("spreads distinct paths across the palette (not all one color)", () => {
    const colors = new Set(
      Array.from({ length: 40 }, (_, i) => colorForWorktree(`/Users/me/Developer/project-${i}`)),
    )
    expect(colors.size).toBeGreaterThan(1)
  })
})

describe("layout session-key helpers", () => {
  test("couples touch and scroll seed in order", () => {
    const calls: string[] = []
    const result = ensureSessionKey(
      "dir/a",
      (key) => calls.push(`touch:${key}`),
      (key) => calls.push(`seed:${key}`),
    )

    expect(result).toBe("dir/a")
    expect(calls).toEqual(["touch:dir/a", "seed:dir/a"])
  })

  test("reads dynamic accessor keys lazily", () => {
    const seen: string[] = []

    createRoot((dispose) => {
      const [key, setKey] = createSignal("dir/one")
      const read = createSessionKeyReader(key, (value) => seen.push(value))

      expect(read()).toBe("dir/one")
      setKey("dir/two")
      expect(read()).toBe("dir/two")

      dispose()
    })

    expect(seen).toEqual(["dir/one", "dir/two"])
  })
})

describe("pruneSessionKeys", () => {
  test("keeps active key and drops lowest-used keys", () => {
    const drop = pruneSessionKeys({
      keep: "k4",
      max: 3,
      used: new Map([
        ["k1", 1],
        ["k2", 2],
        ["k3", 3],
        ["k4", 4],
      ]),
      view: ["k1", "k2", "k4"],
      tabs: ["k1", "k3", "k4"],
    })

    expect(drop).toEqual(["k1"])
    expect(drop.includes("k4")).toBe(false)
  })

  test("does not prune without keep key", () => {
    const drop = pruneSessionKeys({
      keep: undefined,
      max: 1,
      used: new Map([
        ["k1", 1],
        ["k2", 2],
      ]),
      view: ["k1"],
      tabs: ["k2"],
    })

    expect(drop).toEqual([])
  })
})
