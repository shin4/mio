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

/** The dsh profile Mio composes; `mio.patch.yml` is layered over it. */
const PROFILE = "web"

/**
 * Where app-owned files live, and where the two layouts differ.
 *
 * A packaged build reads them from `app.asar.unpacked`: the runtime is a real
 * child process and the plugin copy uses plain `fs`, so neither can see inside
 * an asar archive. `electron-builder.config.ts` unpacks exactly that subtree,
 * where the plugin sits under its package name. In development the same plugin
 * is the workspace directory, whose path has no scope in it.
 */
function resources() {
  if (!app.isPackaged) {
    const workspace = path.join(PACKAGE_ROOT, "..")
    return {
      plugins: [{ name: "@mio/llm-mimo", source: path.join(workspace, "llm-mimo") }],
      patch: path.join(workspace, "runtime", "mio.patch.yml"),
    }
  }
  const modules = path.join(process.resourcesPath, "app.asar.unpacked", "node_modules")
  return {
    plugins: [{ name: "@mio/llm-mimo", source: path.join(modules, "@mio", "llm-mimo") }],
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
  const installed = await installBundledPlugins(home, PROFILE, plugins)
  if (installed.length > 0) console.log(`[shell] installed into the ${PROFILE} profile: ${installed.join(", ")}`)

  runtime = await startRuntime({
    dshHome: home,
    // The runtime's cwd is only a resolution base; every path it is given is
    // absolute. $DSH_HOME is a directory that always exists and is writable.
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

function showStartupFailure(cause: unknown) {
  const detail = cause instanceof Error ? cause.message : String(cause)
  console.error(detail)
  dialog.showErrorBox("Mio could not start", detail)
  app.exit(1)
}
