#!/usr/bin/env bun
/**
 * Provision the repo-local dsh profile that `bun run dev:runtime` boots.
 *
 * The plugin is installed as a PACKED TARBALL, not a `link:`. A symlinked
 * workspace package resolves its `@deepseek-ai/*` imports from the repo's own
 * node_modules, giving the runtime two copies of `dsh-llm` — the adapter class
 * it extends would then differ from the one the profile's `ctx.llm` knows, and
 * `instanceof`-shaped behavior (error classification, retry policy) would
 * silently diverge. Installing the tarball lets the plugin's peerDependencies
 * resolve to the profile's copies, exactly as a published install would.
 *
 * Re-run after changing packages/llm-mimo. Idempotent.
 */
import { $ } from "bun"
import { mkdir, readdir, rm } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const RUNTIME = path.resolve(import.meta.dir, "..")
const PLUGIN = path.resolve(RUNTIME, "..", "llm-mimo")
const DSH_HOME = process.env.DSH_HOME ?? path.join(RUNTIME, ".dsh")
const PROFILE = path.join(DSH_HOME, "profiles", "web")

await $`bun run --cwd ${PLUGIN} build`

// Boot once with --dump-default-config so dsh scaffolds the profile if absent.
if (!(await Bun.file(path.join(PROFILE, "package.json")).exists())) {
  await $`bunx dsh --profile web --dump-default-config`.cwd(RUNTIME).env({ ...process.env, DSH_HOME }).quiet()
}

const staging = path.join(DSH_HOME, ".staging")
await rm(staging, { recursive: true, force: true })
await mkdir(staging, { recursive: true })
await $`bun pm pack --destination ${staging}`.cwd(PLUGIN).quiet()

const tarball = (await readdir(staging)).find((entry) => entry.endsWith(".tgz"))
if (!tarball) throw new Error("setup-profile: bun pm pack produced no tarball")

await $`bunx dsh plugin --profile web add ${path.join(staging, tarball)}`
  .cwd(RUNTIME)
  .env({ ...process.env, DSH_HOME, HOME: process.env.HOME ?? homedir() })

await rm(staging, { recursive: true, force: true })
console.log(`setup-profile: @mio/llm-mimo installed into ${PROFILE}`)
