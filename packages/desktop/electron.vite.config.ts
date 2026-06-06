import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "electron-vite"
import appPlugin from "@opencode-ai/app/vite"
import * as fs from "node:fs/promises"

const MIMO_SERVER_DIST = "../agent/dist/node"

const channel = (() => {
  const raw = process.env.MIMO_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.MIMO_CHANNEL === "latest") return "prod"
  return "dev"
})()

const targetPlatform = process.env.MIMO_TARGET_PLATFORM ?? process.platform
const targetArch = process.env.MIMO_TARGET_ARCH ?? process.arch
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
      "import.meta.env.MIMO_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts", sidecar: "src/main/sidecar.ts" },
        external: ["opencode-web-ui.gen.ts"],
      },
      externalizeDeps: { include: [nodePtyPkg] },
    },
    plugins: [
      {
        name: "mimo:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg
        },
      },
      {
        name: "mimo:embedded-ui-stub",
        enforce: "pre",
        resolveId(id) {
          // The bundled agent server tries to dynamic-import this file. It's
          // never produced in dev (embedded UI is upstream-fetched). Tell
          // Rollup it's external so the build doesn't fail; the runtime
          // import catches the failure and falls through to fetch.
          if (id === "opencode-web-ui.gen.ts") return { id, external: true }
        },
      },
      {
        name: "mimo:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:opencode-server") return this.resolve(`${MIMO_SERVER_DIST}/node.js`)
        },
      },
      {
        name: "mimo:copy-server-assets",
        async writeBundle() {
          for (const l of await fs.readdir(MIMO_SERVER_DIST)) {
            if (!l.endsWith(".wasm")) continue
            await fs.writeFile(`./out/main/chunks/${l}`, await fs.readFile(`${MIMO_SERVER_DIST}/${l}`))
          }
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
