import { describe, expect, test } from "bun:test"

const keyframes = (css: string, name: string) => {
  const start = css.indexOf(`@keyframes ${name}`)
  if (start === -1) return ""
  const next = css.indexOf("\n  @keyframes ", start + 1)
  return css.slice(start, next === -1 ? undefined : next)
}

const rule = (css: string, selector: string) => {
  const start = css.indexOf(selector)
  if (start === -1) return ""
  return css.slice(start, css.indexOf("}", start))
}

const css = await Bun.file(new URL("./index.css", import.meta.url)).text()

describe("MiMo Pro celebration styles", () => {
  test("themes the effect with mimo pro tokens instead of Google colors", () => {
    expect(css.split("--mimo-pro-fx-1:").length).toBe(3)
    expect(css).toContain("--mimo-pro-fx-2:")
    expect(css).toContain("--mimo-pro-fx-3:")
    for (const hex of ["#4285f4", "#ea4335", "#fbbc04", "#34a853"]) expect(css.toLowerCase()).not.toContain(hex)
  })

  test("removes the legacy lift/ring/glow implementation", () => {
    expect(css).not.toContain("mimo-pro-composer-lift")
    expect(css).not.toContain("mimo-pro-composer-ring")
    expect(css).not.toContain("mimo-pro-composer-glow")
    expect(css).not.toContain("translateY(-14px)")
    expect(css).not.toContain("6525ms")
  })

  test("animates only compositor-friendly properties", () => {
    const rotate = keyframes(css, "mimo-pro-ring-rotate")
    expect(rotate).toContain("rotate:")
    expect(rotate).not.toContain("background-position")

    const life = keyframes(css, "mimo-pro-ring-life")
    expect(life).toContain("opacity")
    expect(life).not.toContain("transform")

    const wave = keyframes(css, "mimo-pro-wave-rise")
    expect(wave).toContain("transform: translateY")
    expect(wave).toContain("opacity")

    const particle = keyframes(css, "mimo-pro-particle-rise")
    expect(particle).toContain("transform: translateY")

    expect(rule(css, '[data-slot="mimo-pro-wave"]')).not.toContain("filter")
    expect(rule(css, '[data-component="mimo-pro-celebration-overlay"]')).toContain("pointer-events: none")
  })

  test("keeps the ring gradient seamless at the wrap point", () => {
    const spin = rule(css, '[data-slot="mimo-pro-ring-spin"]')
    const seam = "color-mix(in srgb, var(--mimo-pro-fx-2) 30%, transparent)"
    expect(spin).toContain(`${seam} 0%`)
    expect(spin).toContain(`${seam} 100%`)
    expect(spin).not.toContain("transparent 0 ")
    expect(spin).not.toContain("transparent 95%")
  })

  test("keeps ring durations in css and provides the reduced-motion fallback", () => {
    expect(rule(css, '[data-slot="mimo-pro-ring"] {')).toContain("2600ms")
    expect(css).toContain('[data-variant="short"] [data-slot="mimo-pro-ring"]')
    expect(css).toContain("prefers-reduced-motion")
  })
})
