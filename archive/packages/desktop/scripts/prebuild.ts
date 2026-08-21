#!/usr/bin/env bun
import { $ } from "bun"

import { resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

// The OpenCode agent sidecar build is archived; the dsh runtime replaces it in
// Phase 2 (see MIGRATION.md). The desktop shell builds against server-stub.ts.
console.warn("prebuild: agent sidecar archived — packaging without a server (MIGRATION.md, Phase 2)")
