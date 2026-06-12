import { beforeAll, describe, expect, mock, test } from "bun:test"

let mod: typeof import("./mimo-pro-celebration-overlay")

beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useParams: () => ({}),
  }))
  mod = await import("./mimo-pro-celebration-overlay")
})

describe("MiMo Pro celebration overlay particles", () => {
  test("stays within the spec budget of 5-8 particles", () => {
    expect(mod.MIMO_PRO_PARTICLES.length).toBeGreaterThanOrEqual(5)
    expect(mod.MIMO_PRO_PARTICLES.length).toBeLessThanOrEqual(8)
  })

  test("derives every particle color from the fx tokens", () => {
    for (const particle of mod.MIMO_PRO_PARTICLES) {
      expect(particle.color).toMatch(/^var\(--mimo-pro-fx-[123]\)$/)
    }
  })

  test("launches every particle inside the wave window of the full timeline", () => {
    for (const particle of mod.MIMO_PRO_PARTICLES) {
      expect(particle.delayMs).toBeGreaterThanOrEqual(600)
      expect(particle.delayMs + 1400).toBeLessThanOrEqual(2600)
    }
  })
})
