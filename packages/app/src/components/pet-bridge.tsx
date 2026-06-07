import { createEffect, createMemo, onCleanup, onMount } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { useSync } from "@/context/sync"
import { derivePetActivity, PET_IDLE_STATE, petSessionHref, petStateEquals, type PetState } from "@/pet"

// PetHost — mounted once at the app shell. Owns the pet window's lifecycle:
// reflects the showPet setting into the desktop window, jumps to a session when
// the pet is clicked, and keeps the toggle in sync when the pet is hidden from
// its own menu. No-ops on platforms without pet support (e.g. web).
export function PetHost() {
  const platform = usePlatform()
  const settings = useSettings()
  const navigate = useNavigate()

  createEffect(() => {
    const enabled = settings.general.showPet()
    void platform.setPetEnabled?.(enabled)
  })

  onMount(() => {
    const offNavigate = platform.onPetNavigate?.((href) => navigate(href))
    const offEnabled = platform.onPetEnabledChanged?.((enabled) => settings.general.setShowPet(enabled))
    onCleanup(() => {
      offNavigate?.()
      offEnabled?.()
    })
  })

  return null
}

// PetBridge — mounted inside the session view, where the directory-scoped sync
// store and route params are live. Derives a compact PetState for the active
// session and relays it to the pet window. On unmount (e.g. navigating home) it
// resets the pet to its idle "no session" form.
export function PetBridge() {
  const platform = usePlatform()
  const params = useParams()
  const sync = useSync()

  // Derive the pet state reactively, but only notify downstream when a displayed
  // field actually changes. The body re-runs on every streamed part delta (it
  // reads sync.data.part), so the value-equality guard is what stops an IPC
  // round-trip per token.
  const state = createMemo<PetState>(
    () => {
      const id = params.id
      if (!id) return PET_IDLE_STATE

      const status = sync.data.session_status[id]?.type ?? "idle"
      const title = sync.session.get(id)?.title ?? null
      const messages = sync.data.message[id]
      const last = messages?.at(-1)
      const activity = derivePetActivity(last ? sync.data.part[last.id] : undefined)

      return { hasSession: true, status, title, activity, href: petSessionHref(params.dir, id) }
    },
    PET_IDLE_STATE,
    { equals: petStateEquals },
  )

  createEffect(() => {
    // On platforms without pet support this never subscribes to `state`, so the
    // memo stays inert (no overhead on web).
    if (!platform.updatePet) return
    platform.updatePet(state())
  })

  onCleanup(() => {
    platform.updatePet?.(PET_IDLE_STATE)
  })

  return null
}
