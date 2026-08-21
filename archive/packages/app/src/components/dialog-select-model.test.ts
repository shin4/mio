import { describe, expect, test } from "bun:test"

describe("DialogSelectModel row layout", () => {
  test("aligns capability tags in a stable column inside list item buttons", async () => {
    const source = await Bun.file(new URL("./dialog-select-model.tsx", import.meta.url)).text()

    expect(source).toContain("grid-cols-[120px_minmax(0,1fr)]")
    expect(source).toContain("min-w-0 truncate text-left")
    expect(source).not.toContain("min-w-0 flex-1 truncate text-left")
  })
})
