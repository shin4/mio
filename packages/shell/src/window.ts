/**
 * The shell's single window: a frame around the dsh web UI.
 *
 * The window renders a remote-origin page, so it runs with the renderer fully
 * sandboxed — no Node integration, no preload bridge. The shell deliberately
 * exposes nothing to the page: everything the product does is a dsh plugin, and
 * a privileged channel here would be a way around that.
 */
import { BrowserWindow, shell } from "electron"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const DEFAULT_BOUNDS = { width: 1280, height: 860 }

interface Bounds {
  width: number
  height: number
  x?: number
  y?: number
}

/** Parse JSON, or `undefined` when the text is not valid JSON. */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** Remember window size and position across launches. */
async function readBounds(file: string): Promise<Bounds> {
  const raw = await readFile(file, "utf8").catch(() => undefined)
  if (raw === undefined) return DEFAULT_BOUNDS
  // A truncated write — quitting while the async save is in flight — leaves invalid
  // JSON. Treat that exactly like a missing file: a window position nobody can read
  // must never be the reason the app refuses to launch.
  const parsed = parseJson(raw)
  if (typeof parsed !== "object" || parsed === null) return DEFAULT_BOUNDS
  const bounds = parsed as Partial<Bounds>
  if (typeof bounds.width !== "number" || typeof bounds.height !== "number") return DEFAULT_BOUNDS
  return bounds as Bounds
}

export async function createWindow(url: string, stateDir: string): Promise<BrowserWindow> {
  const file = path.join(stateDir, "window.json")
  const bounds = await readBounds(file)

  const window = new BrowserWindow({
    ...bounds,
    minWidth: 640,
    minHeight: 480,
    // Shown on first paint so the user never sees an empty frame.
    show: false,
    backgroundColor: "#000000",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })

  window.once("ready-to-show", () => window.show())

  // Anything that is not the local UI belongs in the user's own browser. Compare
  // parsed origins, never string prefixes: `http://127.0.0.1:53124@evil.example`
  // starts with the runtime URL but its host is `evil.example`, so a prefix test
  // would load an attacker's page inside the Mio window.
  const origin = new URL(url).origin
  const external = (target: string) => {
    const parsed = URL.parse(target)
    if (parsed?.origin === origin) return false
    // An unparseable target is not the runtime; hand it to the OS, which will
    // refuse anything it does not recognize.
    void shell.openExternal(target)
    return true
  }
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    external(target)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event, target) => {
    if (external(target)) event.preventDefault()
  })

  const persist = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isMaximized()) return
    void writeFile(file, JSON.stringify(window.getBounds())).catch(() => {})
  }
  window.on("resized", persist)
  window.on("moved", persist)

  await window.loadURL(url)
  return window
}
