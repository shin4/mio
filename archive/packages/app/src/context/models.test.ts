import { beforeAll, describe, expect, mock, test } from "bun:test"

let resolveModelVisible: typeof import("./models").resolveModelVisible
let visibilityUpdate: typeof import("./models").visibilityUpdate

beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useParams: () => ({}),
  }))

  const mod = await import("./models")
  resolveModelVisible = mod.resolveModelVisible
  visibilityUpdate = mod.visibilityUpdate
})

describe("model visibility", () => {
  test("forces supported MiMo models visible even when hidden", () => {
    expect(
      resolveModelVisible({
        model: { providerID: "mimo", modelID: "mimo-v2.5" },
        latest: false,
        releaseValid: true,
        state: "hide",
      }),
    ).toBe(true)
    expect(
      resolveModelVisible({
        model: { providerID: "mimo", modelID: "mimo-v2.5-pro" },
        latest: false,
        releaseValid: true,
        state: "hide",
      }),
    ).toBe(true)
  })

  test("keeps normal hide behavior for other models", () => {
    expect(
      resolveModelVisible({
        model: { providerID: "mimo", modelID: "other" },
        latest: false,
        releaseValid: true,
        state: "hide",
      }),
    ).toBe(false)
  })

  test("does not persist hide changes for forced visible MiMo models", () => {
    expect(visibilityUpdate({ providerID: "mimo", modelID: "mimo-v2.5" }, false)).toBeUndefined()
    expect(visibilityUpdate({ providerID: "mimo", modelID: "mimo-v2.5-pro" }, false)).toBeUndefined()
    expect(visibilityUpdate({ providerID: "mimo", modelID: "other" }, false)).toBe("hide")
  })
})
