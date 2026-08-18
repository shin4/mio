import { For, Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"

/** Pixel-faithful sparkle from the MiMo interaction prototype (icons.jsx). */
function Sparkle(props: { size?: number; class?: string }) {
  return (
    <svg
      width={props.size ?? 30}
      height={props.size ?? 30}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
    >
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
      <path d="M18.5 4.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
    </svg>
  )
}

export function NewSessionDesignView(props: { children: JSX.Element; onSuggestion?: (text: string) => void }) {
  const language = useLanguage()
  const suggestions = () =>
    [1, 2, 3, 4].map((n) => language.t(`session.welcome.suggestion.${n}` as Parameters<typeof language.t>[0]))

  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-v2-background-bg-deep">
      <div class="absolute inset-x-0 top-[13%] flex justify-center px-6">
        <div class="flex w-full max-w-[720px] flex-col items-center text-center">
          <div
            class="flex size-16 items-center justify-center rounded-[22px] text-white shadow-[var(--v2-elevation-floating)]"
            style={{ background: "linear-gradient(140deg, var(--mimo-accent), var(--mimo-accent-press))" }}
          >
            <Sparkle size={30} />
          </div>

          <h2 class="mt-5 text-[22px] [font-weight:700] tracking-[-0.02em] text-v2-text-text-base">
            {language.t("session.welcome.title")}
          </h2>
          <p class="mt-1.5 text-[14px] text-v2-text-text-faint">{language.t("session.welcome.subtitle")}</p>

          <div class="mt-7 w-full text-left">{props.children}</div>

          <Show when={props.onSuggestion}>
            <div class="mt-5 flex flex-wrap justify-center gap-2.5">
              <For each={suggestions()}>
                {(suggestion) => (
                  <button
                    type="button"
                    data-action="session-welcome-suggestion"
                    class="flex items-center gap-2 rounded-full border border-v2-border-border-muted bg-v2-background-bg-base px-3.5 py-2 text-[13.5px] text-v2-text-text-muted shadow-[var(--v2-elevation-raised)] transition-[transform,border-color,color] duration-[120ms] ease-in-out hover:-translate-y-px hover:border-v2-border-border-focus hover:text-v2-text-text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-border-border-focus)]"
                    onClick={() => props.onSuggestion?.(suggestion)}
                  >
                    <span class="flex text-v2-icon-icon-accent">
                      <Sparkle size={14} />
                    </span>
                    {suggestion}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
