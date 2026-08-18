#!/usr/bin/env bun

import { readdir, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const workspaceRoot = resolve(desktopRoot, "../..")
const targetPlatform = "win32"
const targetArch = process.argv.includes("--arm64") ? "arm64" : "x64"
const hostPlatform = process.platform
const hostArch = process.arch
const targetEnv = {
  MIO_TARGET_PLATFORM: targetPlatform,
  MIO_TARGET_ARCH: targetArch,
}
const builderArgs = process.argv.slice(2).filter((arg) => arg !== "--x64" && arg !== "--arm64")

await run("bun run build", ["bun", "run", "build"], targetEnv)

try {
  await run("bun install", ["bun", "install", "--os=win32", `--cpu=${targetArch}`, "--frozen-lockfile"])
  await pruneNativeOptionalPackages()
  await run(
    "electron-builder",
    ["bunx", "electron-builder", "--win", `--${targetArch}`, "--config", "electron-builder.config.ts", ...builderArgs],
    targetEnv,
  )
} finally {
  if (hostPlatform !== targetPlatform || hostArch !== targetArch) {
    await run("bun install", ["bun", "install", `--os=${hostPlatform}`, `--cpu=${hostArch}`, "--frozen-lockfile"])
  }
}

async function run(label: string, command: string[], env?: Record<string, string>) {
  console.log(`$ ${label}`)
  const proc = Bun.spawn(command, {
    cwd: desktopRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      ...env,
    },
  })
  const code = await proc.exited
  if (code === 0) return
  throw new Error(`${label} failed with exit code ${code}`)
}

async function pruneNativeOptionalPackages() {
  await Promise.all(
    [
      { scope: "@lydell", prefix: "node-pty-", keep: `node-pty-${targetPlatform}-${targetArch}` },
      { scope: "@parcel", prefix: "watcher-", keep: `watcher-${targetPlatform}-${targetArch}` },
      { scope: "@msgpackr-extract", prefix: "msgpackr-extract-", keep: `msgpackr-extract-${targetPlatform}-${targetArch}` },
    ].map(async (pkg) => {
      const dirs = await nativeOptionalPackageRoots(pkg.scope)
      await Promise.all(
        dirs.map(async (dir) => {
          const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
          await Promise.all(
            entries
              .filter((entry) => entry.name.startsWith(pkg.prefix) && entry.name !== pkg.keep)
              .map((entry) => rm(join(dir, entry.name), { recursive: true, force: true })),
          )
        }),
      )
    }),
  )
}

async function nativeOptionalPackageRoots(scope: string) {
  const bunStore = join(workspaceRoot, "node_modules", ".bun")
  const storeEntries = await readdir(bunStore, { withFileTypes: true }).catch(() => [])
  return [
    join(desktopRoot, "node_modules", scope),
    join(bunStore, "node_modules", scope),
    ...storeEntries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => ["node-pty", "watcher", "msgpackr-extract"].some((name) => entry.name.includes(name)))
      .map((entry) => join(bunStore, entry.name, "node_modules", scope)),
  ]
}
