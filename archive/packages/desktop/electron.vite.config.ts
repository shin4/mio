import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "electron-vite"
import appPlugin from "@opencode-ai/app/vite"
import { readFileSync } from "node:fs"

const channel = (() => {
  const raw = process.env.MIO_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.MIO_CHANNEL === "latest") return "prod"
  return "dev"
})()

// Displayed app version. MIO_VERSION (set by CI's set-version.ts in releases, or
// exported manually in dev) takes precedence; otherwise fall back to the version
// in package.json. This lets `MIO_VERSION=1.2.3 bun run dev:desktop` show 1.2.3
// without ever writing to package.json. Injected into both the main and renderer
// bundles as `import.meta.env.MIO_VERSION`.
const pkgVersion: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version
const version = (process.env.MIO_VERSION ?? pkgVersion).replace(/^v/, "")

const targetPlatform = process.env.MIO_TARGET_PLATFORM ?? process.platform
const targetArch = process.env.MIO_TARGET_ARCH ?? process.arch
const nodePtyPkg = `@lydell/node-pty-${targetPlatform}-${targetArch}`

const sentry =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        release: {
          name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE,
        },
        sourcemaps: {
          assets: "./out/renderer/**",
          filesToDeleteAfterUpload: "./out/renderer/**/*.map",
        },
      })
    : false

export default defineConfig({
  main: {
    define: {
      "import.meta.env.MIO_CHANNEL": JSON.stringify(channel),
      "import.meta.env.MIO_VERSION": JSON.stringify(version),
    },
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts", sidecar: "src/main/sidecar.ts" },
      },
      externalizeDeps: { include: [nodePtyPkg] },
    },
    plugins: [
      {
        name: "mio:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg
        },
      },
      {
        name: "mio:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          // Interim: the OpenCode agent bundle is archived; the stub throws with
          // a pointer to MIGRATION.md until the dsh runtime lands (Phase 2).
          if (id === "virtual:opencode-server") return this.resolve("./src/main/server-stub.ts")
        },
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    define: {
      "import.meta.env.MIO_VERSION": JSON.stringify(version),
    },
    plugins: [appPlugin, sentry],
    publicDir: "../../../app/public",
    root: "src/renderer",
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
          loading: "src/renderer/loading.html",
          pet: "src/renderer/pet.html",
        },
      },
    },
  },
})
