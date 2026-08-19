/**
 * Mio desktop shell.
 *
 * The shell is deliberately thin: it starts the dsh runtime, shows its web UI
 * in a window, and manages the desktop lifecycle around those two things. It
 * holds no agent logic, no renderer of its own, and no IPC surface — product
 * behavior belongs in dsh plugins (MIGRATION.md).
 */
import { app, BrowserWindow, dialog } from "electron"
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

const runtimeDir = path.join(PACKAGE_ROOT, "..", "runtime")

/** The dsh profile Mio composes; `mio.patch.yml` is layered over it. */
const PROFILE = "web"

/**
 * Plugins shipped with the app and copied into the profile at startup. Packaged
 * builds resolve them from the unpacked resources next to dsh; in development
 * they come straight from the workspace's build output.
 */
function bundledPlugins() {
  const root = app.isPackaged ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules") : undefined
  return [
    {
      name: "@mio/llm-mimo",
      source: root ? path.join(root, "@mio", "llm-mimo") : path.join(PACKAGE_ROOT, "..", "llm-mimo"),
    },
  ]
}

// One shell per profile: a second instance would start a second runtime against
// the same session store.
if (!app.requestSingleInstanceLock()) app.quit()

let runtime: RuntimeHandle | undefined

async function start() {
  const home = dshHome()
  const installed = await installBundledPlugins(home, PROFILE, bundledPlugins())
  if (installed.length > 0) console.log(`[shell] installed into the ${PROFILE} profile: ${installed.join(", ")}`)

  runtime = await startRuntime({
    dshHome: home,
    cwd: runtimeDir,
    patch: path.join(runtimeDir, "mio.patch.yml"),
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

function showStartupFailure(cause: unknown) {
  const detail = cause instanceof Error ? cause.message : String(cause)
  console.error(detail)
  dialog.showErrorBox("Mio could not start", detail)
  app.exit(1)
}
