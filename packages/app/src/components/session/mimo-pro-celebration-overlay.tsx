import { For, Show } from "solid-js"
import { useMimoProCelebration } from "@/context/mimo-pro-celebration"

export const MIMO_PRO_PARTICLES = [
  { left: "14%", size: "4px", delayMs: 650, color: "var(--mimo-pro-fx-1)" },
  { left: "28%", size: "3px", delayMs: 1100, color: "var(--mimo-pro-fx-2)" },
  { left: "42%", size: "4px", delayMs: 800, color: "var(--mimo-pro-fx-3)" },
  { left: "58%", size: "3px", delayMs: 1000, color: "var(--mimo-pro-fx-1)" },
  { left: "74%", size: "4px", delayMs: 700, color: "var(--mimo-pro-fx-2)" },
  { left: "86%", size: "3px", delayMs: 1150, color: "var(--mimo-pro-fx-3)" },
]

// Renders only for the full celebration; the composer ring owns done(), this
// overlay simply unmounts when the shared state returns to idle.
export function MimoProCelebrationOverlay() {
  const mimoPro = useMimoProCelebration()
  return (
    <Show when={mimoPro.celebration() === "full"}>
      <div data-component="mimo-pro-celebration-overlay" aria-hidden="true">
        <div data-slot="mimo-pro-wave" />
        <For each={MIMO_PRO_PARTICLES}>
          {(particle) => (
            <span
              data-slot="mimo-pro-particle"
              style={{
                left: particle.left,
                width: particle.size,
                height: particle.size,
                background: particle.color,
                "animation-delay": `${particle.delayMs}ms`,
              }}
            />
          )}
        </For>
      </div>
    </Show>
  )
}
