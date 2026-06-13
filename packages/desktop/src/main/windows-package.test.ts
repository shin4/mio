import { describe, expect, test } from "bun:test"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../..")

describe("windows package target", () => {
  test("node-pty native package selection uses the explicit build target", async () => {
    const config = await Bun.file(join(root, "electron.vite.config.ts")).text()

    expect(config).toContain("MIO_TARGET_PLATFORM")
    expect(config).toContain("MIO_TARGET_ARCH")
    expect(config).not.toContain("`@lydell/node-pty-${process.platform}-${process.arch}`")
  })

  test("windows package script builds with target env before packaging", async () => {
    const pkg = await Bun.file(join(root, "package.json")).json()
    const script = await Bun.file(join(root, "scripts/package-win.ts")).text()

    expect(pkg.scripts["package:win"]).toContain("scripts/package-win.ts")
    expect(script).toContain("bun install")
    expect(script).toContain("--os=win32")
    expect(script).toContain("MIO_TARGET_PLATFORM")
    expect(script).toContain("MIO_TARGET_ARCH")
    expect(script).toContain("bun run build")
    expect(script).toContain("electron-builder")
    expect(script).toContain("pruneNativeOptionalPackages")
    expect(script).toContain("node-pty-")
    expect(script).toContain("watcher-")
    expect(script).toContain("msgpackr-extract-")
    expect(script).toContain("nativeOptionalPackageRoots")
    expect(script).toContain(".bun")
    expect(script.indexOf("bun run build")).toBeLessThan(script.indexOf("bun install"))
    expect(script.indexOf("bun install")).toBeLessThan(script.indexOf("pruneNativeOptionalPackages"))
    expect(script.indexOf("pruneNativeOptionalPackages")).toBeLessThan(script.indexOf("electron-builder"))
  })
})
