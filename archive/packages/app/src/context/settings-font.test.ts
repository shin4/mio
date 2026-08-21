import { describe, expect, test } from "bun:test"
import { monoFontFamily, sansDefault, sansFontFamily, terminalFontFamily } from "./settings"

describe("font defaults", () => {
  test("uses MiSans as the default UI sans font", () => {
    expect(sansDefault).toBe("MiSans")
    expect(sansFontFamily(undefined).startsWith('"MiSans", ')).toBe(true)
    expect(sansFontFamily("").startsWith('"MiSans", ')).toBe(true)
  })

  test("keeps code and terminal font stacks monospace-oriented", () => {
    expect(monoFontFamily(undefined)).not.toContain("MiSans")
    expect(terminalFontFamily(undefined)).toContain("JetBrainsMono Nerd Font Mono")
  })
})
