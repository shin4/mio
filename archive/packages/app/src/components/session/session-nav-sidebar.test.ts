import { describe, expect, test } from "bun:test"

describe("SessionNavSidebar", () => {
  test("does not render a duplicate local sidebar toggle", async () => {
    const source = await Bun.file(new URL("./session-nav-sidebar.tsx", import.meta.url)).text()
    const header = source.slice(
      source.indexOf('<div class="flex h-11'),
      source.indexOf('<div class="min-h-0 flex-1'),
    )

    expect(header).toContain('language.t("sidebar.nav.title")')
    expect(header).not.toContain("sidebar.toggle.ariaLabel")
    expect(header).not.toContain("layout.sidebar.close")
  })
})
