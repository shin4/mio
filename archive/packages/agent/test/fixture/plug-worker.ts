import path from "path"

import { patchPluginConfig, type Target } from "../../src/plugin/install"
import { Filesystem } from "@/util/filesystem"

type Msg = {
  dir: string
  target: string
  mod: string
  global?: boolean
  force?: boolean
  globalDir?: string
  vcs?: string
  worktree?: string
  directory?: string
  holdMs?: number
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function input() {
  const raw = process.argv[2]
  if (!raw) {
    throw new Error("Missing plug worker input")
  }

  const msg = JSON.parse(raw) as Partial<Msg>
  if (!msg.dir || !msg.target || !msg.mod) {
    throw new Error("Invalid plug worker input")
  }

  return msg as Msg
}

function deps(msg: Msg) {
  return {
    readText: (file) => Filesystem.readText(file),
    write: async (file, text) => {
      if (msg.holdMs && msg.holdMs > 0) {
        await sleep(msg.holdMs)
      }
      await Filesystem.write(file, text)
    },
    exists: (file) => Filesystem.exists(file),
    files: (dir, name) => [path.join(dir, `${name}.jsonc`), path.join(dir, `${name}.json`)],
  }
}

async function targets(msg: Msg): Promise<Target[]> {
  const pkg = await Filesystem.readJson<{
    main?: unknown
    exports?: Record<string, unknown>
  }>(path.join(msg.target, "package.json"))
  return [
    ...(pkg.main || pkg.exports?.["./server"] ? [{ kind: "server" as const }] : []),
    ...(pkg.exports?.["./tui"] ? [{ kind: "tui" as const }] : []),
  ]
}

async function main() {
  const msg = input()
  const result = await patchPluginConfig(
    {
      spec: msg.mod,
      targets: await targets(msg),
      force: msg.force,
      global: msg.global,
      vcs: msg.vcs ?? "git",
      worktree: msg.worktree ?? msg.dir,
      directory: msg.directory ?? msg.dir,
      config: msg.globalDir,
    },
    deps(msg),
  )
  if (!result.ok) throw new Error(`Plug task failed: ${result.code}`)
}

await main().catch((err) => {
  const text = err instanceof Error ? (err.stack ?? err.message) : String(err)
  process.stderr.write(text)
  process.exit(1)
})
