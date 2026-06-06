import { app, BrowserWindow, Menu, screen } from "electron"
import type { WebContents } from "electron"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { PetState } from "../preload/types"
import { petStateEquals } from "@opencode-ai/app/pet"
import { getStore } from "./store"
import { allowRendererPermissions, loadWindow, wireWindowRecovery } from "./windows"

// The desktop pet (大橘猫) is an always-on-top, frameless, transparent window
// that mirrors the main window's current session and jumps to it on click. It
// holds no agent connection of its own — the main renderer relays PetState
// through the main process (see updatePetState).

const root = dirname(fileURLToPath(import.meta.url))
const PET_POSITION_KEY = "petPosition"
const PET_WIDTH = 240
const PET_HEIGHT = 240
const PET_MARGIN = 24
// Always keep at least this many pixels of the pet on a display's work area so a
// frameless, taskbar-less, always-on-top window can never become unrecoverable.
const PET_MIN_VISIBLE = 48

type PetDeps = {
  getMainWindow: () => BrowserWindow | null
  quit: () => void
}

// Module-level lifecycle singletons — reassigned as the single pet window and
// its deps are created/destroyed, so these must be `let`.
let petWindow: BrowserWindow | null = null
let lastPetState: PetState | null = null
let deps: PetDeps | null = null

export function configurePet(value: PetDeps) {
  deps = value
}

function locale(zh: string, en: string) {
  return app.getLocale().toLowerCase().startsWith("zh") ? zh : en
}

function readPosition(): { x: number; y: number } | null {
  const raw = getStore().get(PET_POSITION_KEY)
  if (!raw || typeof raw !== "object") return null
  const pos = raw as { x?: unknown; y?: unknown }
  if (typeof pos.x !== "number" || typeof pos.y !== "number") return null
  return { x: pos.x, y: pos.y }
}

function defaultPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + workArea.width - PET_WIDTH - PET_MARGIN),
    y: Math.round(workArea.y + workArea.height - PET_HEIGHT - PET_MARGIN),
  }
}

// Clamp a target position so the pet always keeps PET_MIN_VISIBLE pixels on the
// nearest display's work area. Used both when restoring a saved position (a
// disconnected monitor / resolution change pulls it back onto a live display)
// and on every drag move (can't be dragged off-screen).
function clampToVisibleBounds(x: number, y: number): { x: number; y: number } {
  const display = screen.getDisplayMatching({ x, y, width: PET_WIDTH, height: PET_HEIGHT })
  const a = display.workArea
  const clampedX = Math.min(Math.max(x, a.x - (PET_WIDTH - PET_MIN_VISIBLE)), a.x + a.width - PET_MIN_VISIBLE)
  const clampedY = Math.min(Math.max(y, a.y), a.y + a.height - PET_MIN_VISIBLE)
  return { x: Math.round(clampedX), y: Math.round(clampedY) }
}

export function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return petWindow

  const saved = readPosition()
  const pos = saved ? clampToVisibleBounds(saved.x, saved.y) : defaultPosition()
  const win = new BrowserWindow({
    width: PET_WIDTH,
    height: PET_HEIGHT,
    x: pos.x,
    y: pos.y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    title: "MiMo Pet",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(root, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // "screen-saver" floats the pet above ordinary windows; combined with
  // setVisibleOnAllWorkspaces it also shows over fullscreen Spaces on macOS.
  win.setAlwaysOnTop(true, "screen-saver")
  if (process.platform === "darwin") win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Start fully click-through: only the cat body + bubble should intercept the
  // mouse, the rest of the transparent window must pass clicks to the desktop.
  // `forward: true` still delivers mousemove to the renderer so it can hit-test
  // and toggle interactivity (see handlePetSetInteractive).
  win.setIgnoreMouseEvents(true, { forward: true })

  // Same permission filtering + crash/unresponsive diagnostics the main and
  // loading windows get.
  allowRendererPermissions(win)
  wireWindowRecovery(win, "pet")

  loadWindow(win, "pet.html")
  win.once("ready-to-show", () => win.show())
  win.on("closed", () => {
    if (petWindow === win) petWindow = null
  })

  petWindow = win
  return win
}

export function isPetWindowOpen() {
  return Boolean(petWindow && !petWindow.isDestroyed())
}

// Sender guards for the pet IPC channels: pet-driven actions must come from the
// pet window, and relay/toggle must come from the main window. The same preload
// is loaded by every window, so without these any renderer could drive the pet.
export function isPetSender(sender: WebContents) {
  return Boolean(petWindow && !petWindow.isDestroyed() && petWindow.webContents.id === sender.id)
}

export function isMainSender(sender: WebContents) {
  const main = deps?.getMainWindow()
  return Boolean(main && !main.isDestroyed() && main.webContents.id === sender.id)
}

function closePetWindow() {
  if (petWindow && !petWindow.isDestroyed()) petWindow.close()
  petWindow = null
  // Drop the cached state so a reopened pet starts clean instead of briefly
  // flashing the previous session via handlePetReady.
  lastPetState = null
}

export function setPetEnabled(enabled: boolean) {
  if (!enabled) {
    closePetWindow()
    return
  }
  createPetWindow()
}

export function updatePetState(state: PetState) {
  // Skip no-op relays (defense in depth behind the renderer-side dedupe).
  if (petStateEquals(lastPetState, state)) return
  lastPetState = state
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send("pet-state", state)
}

export function handlePetReady() {
  if (lastPetState && petWindow && !petWindow.isDestroyed()) petWindow.webContents.send("pet-state", lastPetState)
}

export function handlePetActivate() {
  const main = deps?.getMainWindow()
  if (!main || main.isDestroyed()) return
  if (!main.isVisible()) main.show()
  main.focus()
  const href = lastPetState?.href
  if (href) main.webContents.send("pet-navigate", href)
}

export function handlePetDragStart(): { x: number; y: number } {
  if (!petWindow || petWindow.isDestroyed()) return { x: 0, y: 0 }
  const [x, y] = petWindow.getPosition()
  return { x, y }
}

export function handlePetSetPosition(x: number, y: number) {
  if (!petWindow || petWindow.isDestroyed()) return
  const clamped = clampToVisibleBounds(x, y)
  petWindow.setPosition(clamped.x, clamped.y)
}

// Toggle whether the pet window intercepts the mouse. The renderer drives this
// from its hit-test: true while the cursor is over the cat/bubble, false (click
// through to the desktop) everywhere else.
export function handlePetSetInteractive(interactive: boolean) {
  if (!petWindow || petWindow.isDestroyed()) return
  petWindow.setIgnoreMouseEvents(!interactive, { forward: true })
}

export function handlePetDragEnd() {
  if (!petWindow || petWindow.isDestroyed()) return
  const [x, y] = petWindow.getPosition()
  getStore().set(PET_POSITION_KEY, { x, y })
}

export function showPetContextMenu() {
  if (!petWindow || petWindow.isDestroyed()) return
  const main = deps?.getMainWindow()
  const menu = Menu.buildFromTemplate([
    {
      label: locale("打开主窗口", "Open main window"),
      click: () => {
        if (!main || main.isDestroyed()) return
        if (!main.isVisible()) main.show()
        main.focus()
      },
    },
    {
      label: locale("隐藏宠物", "Hide pet"),
      click: () => {
        closePetWindow()
        if (main && !main.isDestroyed()) main.webContents.send("pet-enabled-changed", false)
      },
    },
    { type: "separator" },
    {
      label: locale("退出 MiMo", "Quit MiMo"),
      click: () => deps?.quit(),
    },
  ])
  menu.popup({ window: petWindow })
}
