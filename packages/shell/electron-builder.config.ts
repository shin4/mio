import type { Configuration } from "electron-builder"

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
    // Signing and notarization are opt-in; an unsigned local build is the default.
    identity: process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false" ? null : undefined,
  },

  win: { target: [{ target: "nsis" }] },

  linux: { target: [{ target: "AppImage" }], category: "Development" },

  // Releases are not wired up yet (MIGRATION.md, Phase 2).
  publish: null,
}

export default config
