import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.MIO_CHANNEL ?? "dev"}`

// The OpenCode agent sidecar build is archived; the dsh runtime replaces it in
// Phase 2 (see MIGRATION.md). The desktop shell builds against server-stub.ts.
console.warn("predev: agent sidecar archived — desktop runs without a server (MIGRATION.md, Phase 2)")
