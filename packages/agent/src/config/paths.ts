export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { AppInfo } from "@opencode-ai/core/app-info"

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  name: string,
  directory: string,
  worktree?: string,
) {
  const afs = yield* AppFileSystem.Service
  return (yield* afs.up({
    targets: [`${name}.jsonc`, `${name}.json`],
    start: directory,
    stop: worktree,
  })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* AppFileSystem.Service
  return unique([
    Global.Path.config,
    ...(!Flag.MIO_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          // legacy first: later config merges win, so the renamed dir overrides the legacy one
          targets: [AppInfo.legacyProjectConfigDir, AppInfo.projectConfigDir],
          start: directory,
          stop: worktree,
        })
      : []),
    ...(yield* afs.up({
      targets: [AppInfo.legacyProjectConfigDir, AppInfo.projectConfigDir],
      start: Global.Path.home,
      stop: Global.Path.home,
    })),
    ...(Flag.MIO_CONFIG_DIR ? [Flag.MIO_CONFIG_DIR] : []),
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.jsonc`), path.join(dir, `${name}.json`)]
}
