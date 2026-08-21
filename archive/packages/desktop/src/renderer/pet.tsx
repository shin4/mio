import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { render } from "solid-js/web"
import { PET_IDLE_STATE, type PetState } from "@opencode-ai/app/pet"
import { Cat } from "./pet/cat"
import "./pet/pet.css"

const root = document.getElementById("pet-root")!
const zh = navigator.language?.toLowerCase().startsWith("zh") ?? false
const DRAG_THRESHOLD = 4

function statusLabel(state: PetState): string {
  if (state.status === "busy") return zh ? "思考中…" : "Working…"
  if (state.status === "retry") return zh ? "等待你的批准" : "Waiting for you"
  if (state.hasSession) return zh ? "空闲" : "Idle"
  return zh ? "暂无会话" : "No session"
}

render(() => {
  const [state, setState] = createSignal(PET_IDLE_STATE)
  let petEl!: HTMLDivElement

  // Drag vs click: track screen-space movement from pointerdown. Movement under
  // the threshold counts as a click (jump to session); above it repositions the
  // window. Pointer capture keeps move/up firing as the window follows.
  let origin: { x: number; y: number } | null = null
  let startX = 0
  let startY = 0
  let moved = false
  let dragging = false

  // Click-through everywhere except the cat body + bubble. The window starts
  // ignoring the mouse (forwarding only mousemove); we hit-test each move and
  // flip interactivity so the empty transparent regions pass clicks straight to
  // the desktop. `interactive` mirrors the window's current state to avoid
  // redundant IPC.
  let interactive = false
  const setInteractive = (next: boolean) => {
    if (next === interactive) return
    interactive = next
    window.api.petSetInteractive(next)
  }
  const hitTest = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY)
    return Boolean(el && (el.closest(".pet-cat") || el.closest(".pet-bubble")))
  }
  const onMouseMove = (e: MouseEvent) => {
    if (dragging) return
    setInteractive(hitTest(e.clientX, e.clientY))
  }
  const onMouseLeave = () => {
    if (dragging) return
    setInteractive(false)
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    dragging = true
    moved = false
    origin = null
    startX = e.screenX
    startY = e.screenY
    petEl.setPointerCapture(e.pointerId)
    window.api
      .petDragStart()
      .then((pos) => {
        origin = pos
      })
      .catch(() => {
        origin = null
      })
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return
    const dx = e.screenX - startX
    const dy = e.screenY - startY
    if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) moved = true
    if (moved && origin) window.api.petSetPosition(origin.x + dx, origin.y + dy)
  }

  const onPointerUp = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    petEl.releasePointerCapture?.(e.pointerId)
    if (moved) window.api.petDragEnd()
    else window.api.petActivate()
    // Re-evaluate at the release point: stay interactive if still over the pet,
    // otherwise return to click-through.
    setInteractive(hitTest(e.clientX, e.clientY))
  }

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    window.api.petContextMenu()
  }

  onMount(() => {
    const unsubscribe = window.api.onPetState((next) => setState(next))
    window.api.petReady()
    // Forwarded mousemove drives the click-through hit-test even while the
    // window is ignoring the mouse.
    window.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseleave", onMouseLeave)
    onCleanup(() => {
      unsubscribe()
      window.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseleave", onMouseLeave)
    })
  })

  return (
    <div
      ref={petEl}
      class="pet"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
      title={zh ? "点击打开当前会话 · 拖拽移动 · 右键菜单" : "Click to open · drag to move · right-click for menu"}
    >
      <div class="pet-bubble" data-visible="true">
        <div class="pet-bubble__status" data-status={state().status}>
          <span class="pet-bubble__dot" />
          <span>{statusLabel(state())}</span>
        </div>
        <Show when={state().hasSession && state().title}>
          <div class="pet-bubble__title">{state().title}</div>
        </Show>
        <Show when={state().activity}>
          <div class="pet-bubble__activity">{state().activity}</div>
        </Show>
      </div>
      <Cat status={state().status} />
    </div>
  )
}, root)
