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
    if (moved) {
      window.api.petDragEnd()
      return
    }
    window.api.petActivate()
  }

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    window.api.petContextMenu()
  }

  onMount(() => {
    const unsubscribe = window.api.onPetState((next) => setState(next))
    window.api.petReady()
    onCleanup(unsubscribe)
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
