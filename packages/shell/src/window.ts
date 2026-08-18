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

/** Remember window size and position across launches. */
async function readBounds(file: string): Promise<Bounds> {
  const raw = await readFile(file, "utf8").catch(() => undefined)
  if (raw === undefined) return DEFAULT_BOUNDS
  const parsed: unknown = JSON.parse(raw)
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

  // Anything that is not the local UI belongs in the user's own browser.
  const external = (target: string) => {
    if (!target.startsWith(url)) {
      void shell.openExternal(target)
      return true
    }
    return false
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
