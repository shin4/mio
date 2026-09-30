/** Run the retained upstream compatibility tests from its Desktop package directory. */
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { upstream } from "./prepare.mjs"

const suites = [
  "apps/desktop/tests/development-app.spec.ts",
  "apps/desktop/tests/cli-launcher.spec.ts",
  "apps/desktop/tests/command-installation.spec.ts",
  "apps/desktop/tests/command-path.spec.ts",
  "apps/desktop/tests/command-management.spec.ts",
  "apps/desktop/tests/command-manager-flow.spec.ts",
  "packages/experimental/schedule-bundle/tests/patch.spec.ts",
  "packages/schedule/schedule/tests/update-restart.spec.ts",
  "packages/session/session-format-v3-to-v4/tests",
  "packages/client/ui-settings-general/tests",
]
const result = spawnSync(process.execPath, [
  join(upstream, "node_modules/vitest/vitest.mjs"), "run", "--root", upstream,
  "--config", join(upstream, "vitest.config.ts"), ...suites,
], { cwd: join(upstream, "apps/desktop"), stdio: "inherit",
  // Upstream browser test roster resolves manifests via require paths, including workspace self references.
  env: { ...process.env, NODE_PATH: join(upstream, "node_modules/.pnpm/node_modules") },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
