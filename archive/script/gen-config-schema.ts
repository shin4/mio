#!/usr/bin/env bun
/**
 * Generate schema/config.json from the agent's Config.Info Effect Schema.
 *
 * The generated file is committed to the repo so that the URL referenced in
 * packages/core/src/app-info.ts (configSchema) resolves once the branch is
 * pushed to GitHub:
 *   https://raw.githubusercontent.com/shin4/mio/main/schema/config.json
 *
 * Run from the repo root:
 *   bun script/gen-config-schema.ts
 *
 * The script is idempotent — re-running it produces identical output.
 */

import { $ } from "bun"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")
const OUT = path.join(ROOT, "schema", "config.json")

// The Effect Schema for Config.Info lives in packages/agent, which is where
// the `effect` package is installed. Run from that package's directory so
// its tsconfig path aliases (@/* → src/*) and node_modules resolve correctly.
await $`bun --cwd ${path.join(ROOT, "packages", "agent")} script/gen-config-schema.ts ${OUT}`
console.log(`wrote ${OUT}`)
