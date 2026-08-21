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
import { cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"

const RUNTIME = path.resolve(import.meta.dir, "..")
const PLUGIN = path.resolve(RUNTIME, "..", "llm-mimo")
const DSH_HOME = process.env.DSH_HOME ?? path.join(RUNTIME, ".dsh")
const PROFILE = path.join(DSH_HOME, "profiles", "web")

await $`bun run --cwd ${PLUGIN} build`

// Always replace, never compare versions: the workspace version never moves during
// development, so a version check would copy once and then silently serve stale
// plugin code for every edit afterwards — exactly what this script exists to prevent.
// Replacing wholesale also drops files an older build left behind, and copying only
// the published surface keeps the checkout's tests and scripts out of the profile.
const target = path.join(PROFILE, "node_modules", "@mio", "llm-mimo")
await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(path.join(PLUGIN, "package.json"), path.join(target, "package.json"))
await cp(path.join(PLUGIN, "lib"), path.join(target, "lib"), { recursive: true, dereference: true })
console.log(`setup-profile: @mio/llm-mimo installed into ${PROFILE}`)
