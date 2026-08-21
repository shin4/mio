/**
 * Mio desktop shell.
 *
 * The shell is deliberately thin: it starts the dsh runtime, shows its web UI
 * in a window, and manages the desktop lifecycle around those two things. It
 * holds no agent logic, no renderer of its own, and no IPC surface — product
 * behavior belongs in dsh plugins (MIGRATION.md).
 */
import { app, BrowserWindow, dialog } from "electron"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { installBundledPlugins } from "./profile.ts"
import { startRuntime, type RuntimeHandle } from "./runtime.ts"
import { createWindow } from "./window.ts"

const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/**
 * Where the runtime keeps profiles, sessions, and settings.
 *
 * Packaged builds use the app's own data directory. In development the default
 * is the repo-local profile `packages/runtime/.dsh`, so the shell boots the same
 * composition `bun run dev:runtime` provisions instead of a second, empty one.
 */
function dshHome(): string {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  if (app.isPackaged) return path.join(app.getPath("userData"), "dsh")
  return path.join(PACKAGE_ROOT, "..", "runtime", ".dsh")
}

/** The dsh profile Mio composes; `mio.patch.yml` is layered over it. */
const PROFILE = "web"

/**
 * Where app-owned files live, and where the two layouts differ.
 *
 * A packaged build reads them from `app.asar.unpacked`: the runtime is a real
 * child process and the plugin copy uses plain `fs`, so neither can see inside
 * an asar archive. `electron-builder.config.ts` unpacks exactly that subtree,
 * where a plugin would sit under its package name. In development the same
 * plugin is a workspace directory, whose path has no scope in it.
 *
 * The plugin list is empty today: MiMo is served by dsh's own `llm-pi-ai`
 * adapter through configuration alone (`mio.patch.yml`), so Mio ships no
 * runtime plugin. `installBundledPlugins` stays because the next Mio surface —
 * the client UI plugin carrying onboarding and branding — needs exactly this
 * placement (MIGRATION.md, Phase 3 Stage 2).
 */
function resources() {
  if (!app.isPackaged) {
    const workspace = path.join(PACKAGE_ROOT, "..")
    return { plugins: [], patch: path.join(workspace, "runtime", "mio.patch.yml") }
  }
  return {
    plugins: [],
    // Data, shipped as an extra resource rather than as part of the app bundle.
    patch: path.join(process.resourcesPath, "mio.patch.yml"),
  }
}

// One shell per profile: a second instance would start a second runtime against
// the same session store.
if (!app.requestSingleInstanceLock()) app.quit()

let runtime: RuntimeHandle | undefined

async function start() {
  const home = dshHome()
  const { plugins, patch } = resources()
  // Before anything reads or spawns against it. On a first launch nothing has
  // created this yet, and it is the runtime child's cwd — a missing cwd makes
  // `spawn` fail with a bare ENOENT that reads as "the binary is missing".
  // Placing a bundled plugin used to create it as a side effect; with no Mio
  // runtime plugin left to place, that no longer happens.
  await mkdir(home, { recursive: true })
  const installed = await installBundledPlugins(home, PROFILE, plugins)
  if (installed.length > 0) console.log(`[shell] installed into the ${PROFILE} profile: ${installed.join(", ")}`)

  runtime = await startRuntime({
    onUnexpectedExit: (exit) => {
      // The window is already showing a server that no longer exists. Say so
      // rather than leaving a blank frame, and take the app down with it.
      runtime = undefined
      const how = exit.signal ? `signal ${exit.signal}` : `code ${exit.code ?? "unknown"}`
      showStartupFailure(new Error(`The Mio runtime stopped unexpectedly (${how}).\n\n${exit.output}`))
    },
    dshHome: home,
    // The runtime's cwd is only a resolution base; every path it is given is
    // absolute. $DSH_HOME is writable and is created above if it did not exist.
    cwd: home,
    patch,
    onLog: (line) => console.log(`[runtime] ${line}`),
  })
  await createWindow(runtime.url, app.getPath("userData"))
}

app.whenReady().then(
  () => start().catch(showStartupFailure),
  (cause: unknown) => showStartupFailure(cause),
)

app.on("second-instance", () => {
  const [window] = BrowserWindow.getAllWindows()
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && runtime) void createWindow(runtime.url, app.getPath("userData"))
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

// The runtime is the shell's child: it must not outlive the app.
app.on("before-quit", (event) => {
  if (!runtime) return
  event.preventDefault()
  const stopping = runtime
  runtime = undefined
  void stopping.stop().finally(() => app.quit())
})

/**
 * Report a failure the app cannot continue past, and leave nothing behind.
 *
 * `app.exit` skips `before-quit`, which is where the runtime is normally stopped,
 * so the child has to be stopped here. `start()` publishes the runtime before it
 * opens a window: a window that fails to build or load lands in this function
 * with the runtime already running, and without this the dsh process would
 * outlive the app that spawned it.
 */
function showStartupFailure(cause: unknown) {
  const detail = cause instanceof Error ? cause.message : String(cause)
  console.error(detail)
  const stopping = runtime?.stop() ?? Promise.resolve()
  runtime = undefined
  dialog.showErrorBox("Mio could not start", detail)
  void stopping.finally(() => app.exit(1))
}
