#!/usr/bin/env bun
/**
 * Provision the repo-local dsh profile that `bun run dev:runtime` boots.
 *
 * Builds `@mio/llm-mimo` and copies it into the profile, mirroring exactly what
 * the desktop shell does at startup (`packages/shell/src/profile.ts`) so a
 * problem shows up in whichever one you run first. No package manager is
 * involved: dsh resolves plugin entries relative to the profile directory, and a
 * plain directory copy under `profiles/<name>/node_modules` resolves its peer
 * dependencies through the symlink farm dsh scaffolds in `profiles/node_modules`.
 *
 * Re-run after changing packages/llm-mimo. Idempotent.
 */
import { $ } from "bun"
import { cp, mkdir, readFile, rm } from "node:fs/promises"
import path from "node:path"

const RUNTIME = path.resolve(import.meta.dir, "..")
const PLUGIN = path.resolve(RUNTIME, "..", "llm-mimo")
const DSH_HOME = process.env.DSH_HOME ?? path.join(RUNTIME, ".dsh")
const PROFILE = path.join(DSH_HOME, "profiles", "web")

await $`bun run --cwd ${PLUGIN} build`

const version = async (dir: string) =>
  readFile(path.join(dir, "package.json"), "utf8")
    .then((raw) => (JSON.parse(raw) as { version?: string }).version)
    .catch(() => undefined)

const target = path.join(PROFILE, "node_modules", "@mio", "llm-mimo")
if ((await version(PLUGIN)) === (await version(target))) {
  console.log(`setup-profile: @mio/llm-mimo already current in ${PROFILE}`)
} else {
  // Replace wholesale (a merge would keep stale files from an older build), and
  // copy only what the package publishes — the checkout's tests, scripts, and
  // node_modules have no business in the profile.
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  await cp(path.join(PLUGIN, "package.json"), path.join(target, "package.json"))
  await cp(path.join(PLUGIN, "lib"), path.join(target, "lib"), { recursive: true, dereference: true })
  console.log(`setup-profile: @mio/llm-mimo installed into ${PROFILE}`)
}
