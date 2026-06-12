import { createSimpleContext } from "@opencode-ai/ui/context"
import { useParams } from "@solidjs/router"
import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js"
import { useLocal } from "@/context/local"

export type MimoProCelebrationVariant = "full" | "short"

type ModelEffectInput =
  | {
      id: string
      provider: {
        id: string
      }
    }
  | undefined

export function modelEffectKey(model: ModelEffectInput) {
  if (!model) return
  return `${model.provider.id}:${model.id}`
}

export function isMimoProModelKey(key: string | undefined) {
  if (!key) return false
  return key.startsWith("mimo:") && key.endsWith("-pro")
}

export function shouldTriggerMimoProCelebration(previous: string | undefined, current: string | undefined) {
  return !!previous && previous !== current && isMimoProModelKey(current)
}

export type MimoProCelebrationSnapshot = readonly [session: string, modelKey: string | undefined]

export type MimoProCelebrationAction =
  | { type: "none" }
  | { type: "stop" }
  | { type: "play"; variant: MimoProCelebrationVariant }

// Pure decision step. Session and model are compared as one tuple: a
// same-flush session navigation must cancel, never celebrate, even when it
// lands on a Pro session.
export function nextMimoProCelebration(input: {
  previous: MimoProCelebrationSnapshot | undefined
  current: MimoProCelebrationSnapshot
  played: ReadonlySet<string>
}): MimoProCelebrationAction {
  if (!input.previous) return { type: "none" }
  const [session, key] = input.current
  const [previousSession, previousKey] = input.previous
  if (session !== previousSession) return { type: "stop" }
  if (shouldTriggerMimoProCelebration(previousKey, key)) {
    return { type: "play", variant: input.played.has(session) ? "short" : "full" }
  }
  if (!isMimoProModelKey(key)) return { type: "stop" }
  return { type: "none" }
}

export function createMimoProCelebrationPlayback() {
  const [celebration, setCelebration] = createSignal<MimoProCelebrationVariant | undefined>(undefined)
  let restartFrame: number | undefined

  const stop = () => {
    if (restartFrame !== undefined) {
      cancelAnimationFrame(restartFrame)
      restartFrame = undefined
    }
    setCelebration(undefined)
  }

  // rAF defers the data attribute so a re-trigger mid-play restarts the CSS
  // animation instead of continuing it.
  const play = (variant: MimoProCelebrationVariant) => {
    stop()
    restartFrame = requestAnimationFrame(() => {
      restartFrame = undefined
      setCelebration(variant)
    })
  }

  return { celebration, play, stop }
}

export function createMimoProCelebrationState(input: {
  modelKey: Accessor<string | undefined>
  sessionKey: Accessor<string>
}) {
  const playback = createMimoProCelebrationPlayback()
  const played = new Set<string>()

  createEffect(
    on(
      () => [input.sessionKey(), input.modelKey()] as const,
      (current, previous) => {
        const action = nextMimoProCelebration({ previous, current, played })
        if (action.type === "stop") playback.stop()
        if (action.type !== "play") return
        played.add(current[0])
        playback.play(action.variant)
      },
    ),
  )

  onCleanup(playback.stop)

  return { celebration: playback.celebration, done: playback.stop }
}

export const { use: useMimoProCelebration, provider: MimoProCelebrationProvider } = createSimpleContext({
  name: "MimoProCelebration",
  init: () => {
    const local = useLocal()
    const params = useParams()
    return createMimoProCelebrationState({
      modelKey: () => modelEffectKey(local.model.current()),
      sessionKey: () => params.id || "draft",
    })
  },
})
