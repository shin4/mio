import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const shellDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(shellDir, "..", "..")

/**
 * codesign receives `mac.entitlements` verbatim — electron-builder does not
 * resolve it against the project directory (`macPackager.getOptionsForFile`),
 * and this config is loaded with `--projectDir .package` anyway. Absolute.
 */
const entitlements = path.join(shellDir, "resources", "entitlements.mac.plist")

/**
 * Windows signing through Azure Trusted Signing. The script exits 0 when the
 * AZURE_TRUSTED_SIGNING_* variables are absent, so an unconfigured or local
 * build produces an unsigned installer instead of failing.
 */
async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(rootDir, "script", "sign-windows.ps1"), configuration.path],
    { cwd: rootDir },
  )
}

// Signing and notarization are gated on credentials, so unsigned local and PR
// builds never fail. CSC_LINK (+ CSC_KEY_PASSWORD) signs; APPLE_TEAM_ID
// (+ APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD) additionally notarizes. A team id
// without a certificate degrades to an unsigned build rather than erroring,
// because notarization requires a signed app.
//
// Locally, neither is set and electron-builder's identity auto-discovery finds
// whatever Developer ID lives in the keychain — a signed but *unnotarized*
// build, which Gatekeeper still refuses. Set CSC_IDENTITY_AUTO_DISCOVERY=false
// to skip signing entirely, as build-check.yml does.
const macSign = Boolean(process.env.CSC_LINK)
const macNotarize = macSign && Boolean(process.env.APPLE_TEAM_ID)

/**
 * Packaging for the Mio desktop shell.
 *
 * Two things must survive packaging intact, and both are why so much is
 * unpacked from the asar archive:
 *
 * - The dsh runtime is spawned as a real child process. It reads its own
 *   modules with plain `fs`, which cannot see inside an asar archive.
 * - The shell copies `@mio/llm-mimo` into the user's dsh profile at startup,
 *   also with plain `fs`.
 *
 * `mio.patch.yml` — Mio's composition over the dsh `web` profile — ships as an
 * extra resource: it is product data the runtime reads, not app code.
 */
const config: Configuration = {
  appId: "io.github.shin4.mio.desktop",
  // The staged tree carries only production dependencies, so electron itself is
  // not installed there for electron-builder to infer a version from. Keep this
  // in step with the `electron` devDependency in package.json.
  electronVersion: "41.2.1",
  productName: "Mio",
  artifactName: "mio-${os}-${arch}.${ext}",
  copyright: `Copyright © ${new Date().getFullYear()} Mio contributors`,

  // The app tree is staged by `scripts/stage.ts`, never read from the Bun
  // workspace: electron-builder cannot extract a dependency tree from Bun's
  // layout and would ship an incomplete dsh. See that script for the detail.
  // Paths are relative to `--projectDir .package`, which is how this config is
  // invoked: `directories.app` alone is not honored, and electron-builder would
  // silently package the Bun workspace instead.
  directories: { output: "../dist", buildResources: "../resources" },

  files: ["lib/**/*", "package.json", "!**/*.map", "!**/*.tsbuildinfo"],

  // The whole dependency tree, not just the scoped parts of it. The runtime
  // child resolves imports from inside `app.asar.unpacked`, so a package left
  // in the archive is simply absent from its search path — `js-yaml` was the
  // first to prove it. Only the shell's own `lib/` stays archived.
  asarUnpack: ["node_modules/**"],

  extraResources: [{ from: "../../runtime/mio.patch.yml", to: "mio.patch.yml" }],

  // No `arch` anywhere: each target builds for the machine it runs on. dsh's
  // native modules (ripgrep, koffi, sharp, node-addon-require-builtin) arrive
  // as platform packages that the staging step installs for the host, so a
  // cross-arch artifact built here would carry the wrong binaries. Other
  // architectures come from other runners — see .github/workflows/build-check.yml.
  mac: {
    category: "public.app-category.developer-tools",
    target: [{ target: "dmg" }],
    // On by default in electron-builder 26 for non-MAS targets; stated because
    // the entitlements below only exist to carve exceptions out of it.
    hardenedRuntime: true,
    entitlements,
    // The same file for nested binaries. Left unset, electron-builder signs
    // them with its own bundled template, so our exceptions would apply to the
    // app but not to the native modules that actually need them.
    entitlementsInherit: entitlements,
    // Skip the local Gatekeeper assessment after signing: it fails by design on
    // a build that has not been through the notary service yet.
    gatekeeperAssess: false,
    // electron-builder 26's schema takes a boolean here and reads APPLE_ID /
    // APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID from the environment.
    notarize: macNotarize,
    identity: process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false" ? null : undefined,
  },

  dmg: { sign: macSign },

  win: { target: [{ target: "nsis" }], signtoolOptions: { sign: signWindows } },

  linux: { target: [{ target: "AppImage" }], category: "Development" },

  // No publish provider: release.yml uploads the artifacts itself. Configuring
  // one would make electron-builder emit electron-updater metadata
  // (latest*.yml) that nothing consumes — the app-side updater is deferred
  // (MIGRATION.md, Phase 2). It comes back together with the updater, and needs
  // the per-arch metadata merge that job implies.
  publish: null,
}

export default config
