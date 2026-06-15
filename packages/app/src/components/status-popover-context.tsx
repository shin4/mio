import { For, Show, createMemo } from "solid-js"
import type { Part } from "@opencode-ai/sdk/v2/client"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { useProviders } from "@/hooks/use-providers"
import { getSessionContextMetrics } from "@/components/session/session-context-metrics"
import { estimateSessionContextBreakdown } from "@/components/session/session-context-breakdown"
import { toCapsuleSegments, type CapsuleSegmentKey } from "./status-popover-context-data"

const COLOR: Record<CapsuleSegmentKey, string> = {
  messages: "var(--syntax-property)",
  tool: "var(--syntax-warning)",
  system: "var(--syntax-info)",
  other: "var(--syntax-comment)",
}

export function StatusPopoverContext(props: { sessionID: string }) {
  const sync = useSync()
  const language = useLanguage()
  const providers = useProviders()

  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])
  const ctx = createMemo(() => getSessionContextMetrics(messages(), [...providers.all().values()]).context)

  const segments = createMemo(() => {
    const c = ctx()
    if (!c?.input) return []
    return toCapsuleSegments(
      estimateSessionContextBreakdown({
        messages: messages(),
        parts: sync.data.part as Record<string, Part[] | undefined>,
        input: c.input,
        // System prompt omitted in this condensed view: its tokens fold into "other".
        // Wiring the real prompt text (and finer buckets) is the precise-tokenizer upgrade.
        systemPrompt: undefined,
      }),
    )
  })

  const formatter = createMemo(() =>
    new Intl.NumberFormat(language.intl(), { notation: "compact", maximumFractionDigits: 1 }),
  )
  const compact = (n: number) => formatter().format(n)

  const label = (key: CapsuleSegmentKey) => language.t(`context.breakdown.${key}`)

  return (
    <div class="p-4">
      <Show
        when={ctx()}
        fallback={
          <div class="text-12-regular text-text-weak py-6 text-center">{language.t("context.capsule.empty")}</div>
        }
      >
        {(c) => (
          <>
            <div class="flex items-baseline justify-between mb-1">
              <span class="text-13-regular text-text-weak">{language.t("context.capsule.window")}</span>
              <span class="text-13-regular text-text-weak">
                <span class="text-16-medium text-text-strong">{compact(c().total)}</span>
                {" / "}
                {c().limit ? compact(c().limit!) : "—"}
                <Show when={c().usage != null}>
                  <span class="text-text-weakest"> ({c().usage}%)</span>
                </Show>
              </span>
            </div>
            <div class="text-11-regular text-text-weakest mb-2.5">
              {c().modelLabel} · {language.t("context.capsule.note")}
            </div>

            <div class="flex h-2 rounded-full overflow-hidden mb-3 bg-border-weak-base">
              <For each={segments()}>
                {(s) => <div style={{ width: `${s.percent}%`, "background-color": COLOR[s.key] }} />}
              </For>
            </div>

            <div class="flex flex-col gap-0.5">
              <For each={segments()}>
                {(s) => (
                  <div class="flex items-center gap-2 py-1">
                    <span class="size-2.5 rounded-[3px] shrink-0" style={{ "background-color": COLOR[s.key] }} />
                    <span class="flex-1 text-13-regular">{label(s.key)}</span>
                    <span class="text-10-regular text-text-weakest border border-border-weak-base rounded px-1">
                      {language.t("context.capsule.approx")}
                    </span>
                    <span class="text-13-regular text-text-weak min-w-[44px] text-right">{compact(s.tokens)}</span>
                    <span class="text-13-medium min-w-[36px] text-right">{s.percent}%</span>
                  </div>
                )}
              </For>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
