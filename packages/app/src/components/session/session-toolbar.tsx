/**
 * Session status toolbar — surfaces MiMo prefix-cache health as a first-class
 * session capability. Three indicators along the bottom of the session page:
 *
 *  - PREFIX  : current-model prefix-cache hit rate (cached input tokens / total
 *              input tokens) — derived from synced messages and live cache events.
 *  - DRIFT   : how many times the immutable prefix (system prompt + tools)
 *              changed mid-session and reset the cache — counted live from
 *              `session.cache.prefix.drift` bus events for this session.
 *  - CONTEXT : context-window tokens used in the latest turn vs the model limit.
 *  - SPEED   : latest-turn output throughput (tok/s); TTFT lives in its tooltip.
 *              Both are derived from already-synced timestamps — the MiMo API
 *              returns no server-side timing — so they're local wall-clock
 *              measurements, not provider-reported values.
 */
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js"
import type { Message } from "@opencode-ai/sdk/v2/client"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import { useProviders } from "@/hooks/use-providers"
import { getSessionContextMetrics } from "./session-context-metrics"

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`

// TTFT: sub-second in ms, otherwise 2-decimal seconds. Generation span: 1 decimal.
const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`)
const fmtDur = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`)

// Latest-turn generation speed from synced timestamps.
// - numerator: model-generated tokens = output + reasoning
// - denominator (genMs): prefer the summed text/reasoning generation windows
//   (excludes tool execution + idle/inter-step gaps); fall back to the whole
//   span minus tool-execution time; finally to the whole span.
// - ttftMs: first text/reasoning token start − message created.
// Returns undefined until the turn has completed.
export function computeThroughput(input: {
  message: { time: { created: number; completed?: number } }
  parts: ReadonlyArray<{
    type: string
    // `created` is accepted (but unused) so RetryPart's `time: { created }` stays assignable.
    time?: { start?: number; end?: number; created?: number }
    state?: { status: string; time?: { start: number; end?: number } }
  }>
  output: number
  reasoning: number
}): { tps?: number; ttftMs?: number; genMs?: number; generated: number } | undefined {
  const completed = input.message.time.completed
  if (typeof completed !== "number") return undefined
  const created = input.message.time.created

  let firstTokenAt: number | undefined
  let segmentMs = 0
  let segments = 0
  let toolMs = 0
  for (const part of input.parts) {
    if (part.type === "text" || part.type === "reasoning") {
      const start = part.time?.start
      if (typeof start !== "number") continue
      if (firstTokenAt === undefined || start < firstTokenAt) firstTokenAt = start
      const end = part.time?.end
      if (typeof end === "number" && end > start) {
        segmentMs += end - start
        segments += 1
      }
      continue
    }
    if (part.type === "tool") {
      const status = part.state?.status
      const time = status === "completed" || status === "error" ? part.state?.time : undefined
      if (time && typeof time.end === "number" && time.end > time.start) toolMs += time.end - time.start
    }
  }

  const ttftMs = firstTokenAt !== undefined && firstTokenAt >= created ? firstTokenAt - created : undefined
  const genStart = firstTokenAt ?? created
  const whole = completed > genStart ? completed - genStart : undefined
  const genMs = segments > 0 ? segmentMs : whole !== undefined ? Math.max(1, whole - toolMs) : undefined

  const generated = input.output + input.reasoning
  const tps = genMs && generated > 0 ? (generated / genMs) * 1000 : undefined
  return { tps, ttftMs, genMs, generated }
}

type CacheModelRef = {
  providerID?: string
  id?: string
  modelID?: string
  variant?: string
}

type CacheLiveEvent = {
  turnId?: string
  modelKey?: string
  model?: CacheModelRef
  readTokens?: number
  missTokens?: number
}

type CacheStats = {
  read: number
  miss: number
  hitRate: number
}

type CacheModel = {
  providerID: string
  modelID: string
  variant?: string
}

type CacheModelStats = CacheStats & {
  modelKey: string
  model: CacheModel
}

type CacheModelIdentity = {
  modelKey: string
  model: CacheModel
}

type CacheStatsGroup = CacheModelIdentity & {
  read: number
  miss: number
  lastSeen: number
}

const safeToken = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : 0

function cacheModel(input: CacheModelRef | undefined): CacheModel | undefined {
  const modelID = input?.modelID ?? input?.id
  if (!input?.providerID || !modelID) return undefined
  return { providerID: input.providerID, modelID, variant: input.variant || undefined }
}

function cacheModelKeyFromModel(input: CacheModel) {
  return JSON.stringify([input.providerID, input.modelID, input.variant ?? ""])
}

export function cacheModelKey(input: CacheModelRef | undefined) {
  const model = cacheModel(input)
  if (!model) return undefined
  return cacheModelKeyFromModel(model)
}

function cacheStatsFromTokens(read: number, miss: number): CacheStats | undefined {
  const total = read + miss
  if (total <= 0) return undefined
  return { read, miss, hitRate: read / total }
}

function addCacheStats(
  groups: Map<string, CacheStatsGroup>,
  model: CacheModel,
  read: number,
  miss: number,
  lastSeen: number,
) {
  const modelKey = cacheModelKeyFromModel(model)
  const current = groups.get(modelKey)
  groups.set(modelKey, {
    read: (current?.read ?? 0) + read,
    miss: (current?.miss ?? 0) + miss,
    lastSeen: Math.max(current?.lastSeen ?? lastSeen, lastSeen),
    modelKey,
    model,
  })
  return groups
}

export function getSessionCacheOverview(input: {
  messages: readonly Message[]
  model?: CacheModelRef
  events?: readonly CacheLiveEvent[]
}): {
  active?: CacheModelIdentity
  current?: CacheModelStats
  display?: CacheModelStats
  total?: CacheStats
  models: CacheModelStats[]
} {
  const assistantMessages = input.messages.filter((message) => message.role === "assistant")
  const activeModel =
    cacheModel(input.model) ??
    cacheModel(
      assistantMessages
        .slice()
        .reverse()
        .find((message) => cacheModel(message) !== undefined),
    )
  const activeModelKey = activeModel ? cacheModelKeyFromModel(activeModel) : undefined
  const active = activeModel && activeModelKey ? { modelKey: activeModelKey, model: activeModel } : undefined
  const loadedTurnIds = new Set(assistantMessages.map((message) => message.id))
  const messageGroups = assistantMessages.reduce((groups, message, index) => {
    const model = cacheModel(message)
    if (!model) return groups
    return addCacheStats(
      groups,
      model,
      safeToken(message.tokens.cache.read),
      safeToken(message.tokens.input) + safeToken(message.tokens.cache.write),
      index,
    )
  }, new Map<string, CacheStatsGroup>())

  const eventTurnIds = new Set<string>()
  const groups = (input.events ?? []).reduce((next, event, index) => {
    if (!event.turnId || !event.modelKey) return next
    if (loadedTurnIds.has(event.turnId) || eventTurnIds.has(event.turnId)) return next
    const model =
      cacheModel(event.model) ??
      (event.modelKey === activeModelKey ? activeModel : undefined) ??
      next.get(event.modelKey)?.model
    if (!model || cacheModelKeyFromModel(model) !== event.modelKey) return next
    eventTurnIds.add(event.turnId)
    return addCacheStats(
      next,
      model,
      safeToken(event.readTokens),
      safeToken(event.missTokens),
      assistantMessages.length + index,
    )
  }, messageGroups)

  const modelsWithSeen = [...groups.values()].flatMap((item) => {
    const stats = cacheStatsFromTokens(item.read, item.miss)
    return stats ? [{ ...stats, modelKey: item.modelKey, model: item.model, lastSeen: item.lastSeen }] : []
  })
  const latestMeasuredModel = modelsWithSeen.slice().sort((a, b) => b.lastSeen - a.lastSeen)[0]
  const models = modelsWithSeen
    .map((item) => ({
      read: item.read,
      miss: item.miss,
      hitRate: item.hitRate,
      modelKey: item.modelKey,
      model: item.model,
    }))
    .sort((a, b) => {
      if (a.modelKey === activeModelKey && b.modelKey !== activeModelKey) return -1
      if (b.modelKey === activeModelKey && a.modelKey !== activeModelKey) return 1
      return b.read + b.miss - (a.read + a.miss)
    })
  const total = cacheStatsFromTokens(
    models.reduce((sum, item) => sum + item.read, 0),
    models.reduce((sum, item) => sum + item.miss, 0),
  )
  const current = activeModelKey ? models.find((item) => item.modelKey === activeModelKey) : undefined
  const display =
    current ?? (latestMeasuredModel ? models.find((item) => item.modelKey === latestMeasuredModel.modelKey) : undefined)
  return { active, current, display, total, models }
}

export function getModelScopedCacheStats(input: {
  messages: readonly Message[]
  model?: CacheModelRef
  events?: readonly CacheLiveEvent[]
}): CacheModelStats | undefined {
  return getSessionCacheOverview(input).current
}

function cacheModelLabel(input: { model: CacheModel } | undefined) {
  if (!input) return "—"
  return `${input.model.providerID}/${input.model.modelID}${input.model.variant ? `:${input.model.variant}` : ""}`
}

export function cacheHitRateColor(rate: number) {
  const pct = Math.round(rate * 100)
  if (pct >= 91) return "var(--v2-green-600)"
  if (pct >= 81) return "var(--v2-yellow-700)"
  return "var(--v2-orange-600)"
}

export function contextUsageColor(usage: number | null) {
  if (usage === null) return undefined
  if (usage >= 90) return "var(--v2-red-600)"
  if (usage >= 51) return "var(--v2-yellow-700)"
  return "var(--v2-green-600)"
}

export function contextUsageLabel(usage: number | null) {
  if (usage === null) return undefined
  return `${usage}%`
}

function cacheRateLabel(input: CacheStats | undefined) {
  return input === undefined ? "—" : `${Math.round(input.hitRate * 100)}%`
}

export function SessionToolbar(props: { sessionID: string; centered?: boolean }) {
  const language = useLanguage()
  const sync = useSync()
  const serverSDK = useServerSDK()
  const providers = useProviders()
  const t = language.t

  const messages = createMemo(() => (sync.data.message[props.sessionID] ?? []) as Message[])
  const sessionInfo = createMemo(() => sync.session.get(props.sessionID))

  const [cacheEvents, setCacheEvents] = createSignal<CacheLiveEvent[]>([])
  const cacheOverview = createMemo(() =>
    getSessionCacheOverview({ messages: messages(), model: sessionInfo()?.model, events: cacheEvents() }),
  )
  const cacheStats = () => cacheOverview().display
  const currentCacheStats = () => cacheOverview().current
  const displayFallbackStats = () => {
    const overview = cacheOverview()
    if (!overview.display || overview.display.modelKey === overview.current?.modelKey) return undefined
    return overview.display
  }
  const hitRate = () => cacheStats()?.hitRate

  const metrics = createMemo(() => getSessionContextMetrics(messages(), [...providers.all().values()]))

  // Latest-turn generation speed. The metrics' "context" message is the last
  // assistant turn that reported tokens (so it's completed). See computeThroughput
  // for how tool-execution/idle time is excluded and tokens counted.
  const throughput = createMemo(() => {
    const ctx = metrics().context
    if (!ctx) return undefined
    return computeThroughput({
      message: ctx.message,
      parts: sync.data.part[ctx.message.id] ?? [],
      output: ctx.output,
      reasoning: ctx.reasoning,
    })
  })

  const ttftLabel = () => {
    const ms = throughput()?.ttftMs
    return ms === undefined ? "—" : fmtMs(ms)
  }

  // Live prefix-drift count for this session. Reset when the session changes;
  // the bus event isn't in the generated SDK union, so cast at the boundary.
  const [drift, setDrift] = createSignal(0)
  createEffect(
    on(
      () => props.sessionID,
      () => {
        setCacheEvents([])
        setDrift(0)
      },
    ),
  )
  onCleanup(
    serverSDK.event.listen((e) => {
      const detail = e.details as unknown as {
        type?: string
        properties?: {
          sessionID?: string
          turnId?: string
          readTokens?: number
          missTokens?: number
        }
      }
      if (detail.type === "session.cache.prefix.drift" && detail.properties?.sessionID === props.sessionID) {
        setDrift((value) => value + 1)
        return
      }
      if (detail.type === "session.cache.measured" && detail.properties?.sessionID === props.sessionID) {
        const turnId = detail.properties.turnId
        const turn = messages().find((message) => message.id === turnId)
        const model = turn?.role === "assistant" ? turn : sessionInfo()?.model
        const modelKey = cacheModelKey(model)
        setCacheEvents((events) =>
          turnId && modelKey && !events.some((event) => event.turnId === turnId)
            ? [
                ...events,
                {
                  turnId,
                  modelKey,
                  model,
                  readTokens: detail.properties?.readTokens,
                  missTokens: detail.properties?.missTokens,
                },
              ]
            : events,
        )
      }
    }),
  )

  // cache ring sweep (0–360°) from the cumulative hit rate
  const ringDeg = () => Math.round((hitRate() ?? 0) * 360)
  const hitRateColor = () => {
    const rate = hitRate()
    return rate === undefined ? "var(--v2-background-bg-deep)" : cacheHitRateColor(rate)
  }
  const cacheTokenLabel = (stats: CacheStats) =>
    t("session.toolbar.cache.tokens", { read: fmt(stats.read), total: fmt(stats.read + stats.miss) })
  const cacheRows = () => cacheOverview().models.slice(0, 4)
  const hiddenCacheRows = () => Math.max(0, cacheOverview().models.length - cacheRows().length)

  return (
    <div class="flex shrink-0 items-center justify-center pb-3 pt-1.5">
      <div
        classList={{
          "w-full px-3": true,
          "md:max-w-200 md:mx-auto 2xl:max-w-[1000px]": props.centered,
        }}
      >
        <div class="flex h-9 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-v2-border-border-muted bg-v2-background-bg-base px-3 text-11-regular text-v2-text-text-muted shadow-[var(--v2-elevation-floating)]">
          <Tooltip
            value={
              <div class="flex min-w-64 max-w-80 flex-col gap-1.5 tabular-nums">
                <div class="whitespace-normal opacity-70">{t("session.toolbar.cache.tip")}</div>
                <Show
                  when={currentCacheStats()}
                  fallback={
                    <Show when={cacheOverview().active}>
                      {(active) => (
                        <div class="flex items-start justify-between gap-4">
                          <span class="flex min-w-0 flex-col">
                            <span class="truncate">{t("session.toolbar.cache.currentModel")}</span>
                            <span class="truncate opacity-70">{cacheModelLabel(active())}</span>
                          </span>
                          <span class="flex shrink-0 flex-col items-end">
                            <span class="opacity-70">{cacheRateLabel(undefined)}</span>
                            <span class="opacity-70">—</span>
                          </span>
                        </div>
                      )}
                    </Show>
                  }
                >
                  {(stats) => (
                    <div class="flex items-start justify-between gap-4">
                      <span class="flex min-w-0 flex-col">
                        <span class="truncate">{t("session.toolbar.cache.currentModel")}</span>
                        <span class="truncate opacity-70">{cacheModelLabel(stats())}</span>
                      </span>
                      <span class="flex shrink-0 flex-col items-end">
                        <span class="[font-weight:600]" style={{ color: cacheHitRateColor(stats().hitRate) }}>
                          {cacheRateLabel(stats())}
                        </span>
                        <span class="opacity-70">{cacheTokenLabel(stats())}</span>
                      </span>
                    </div>
                  )}
                </Show>
                <Show when={displayFallbackStats()}>
                  {(stats) => (
                    <div class="flex items-start justify-between gap-4 border-t border-v2-border-border-muted pt-1">
                      <span class="flex min-w-0 flex-col">
                        <span class="truncate">{t("session.toolbar.cache.displayModel")}</span>
                        <span class="truncate opacity-70">{cacheModelLabel(stats())}</span>
                      </span>
                      <span class="flex shrink-0 flex-col items-end">
                        <span class="[font-weight:600]" style={{ color: cacheHitRateColor(stats().hitRate) }}>
                          {cacheRateLabel(stats())}
                        </span>
                        <span class="opacity-70">{cacheTokenLabel(stats())}</span>
                      </span>
                    </div>
                  )}
                </Show>
                <Show when={cacheOverview().total}>
                  {(total) => (
                    <div class="flex items-start justify-between gap-4 border-t border-v2-border-border-muted pt-1">
                      <span>{t("session.toolbar.cache.allModels")}</span>
                      <span class="flex shrink-0 flex-col items-end">
                        <span class="[font-weight:600]" style={{ color: cacheHitRateColor(total().hitRate) }}>
                          {cacheRateLabel(total())}
                        </span>
                        <span class="opacity-70">{cacheTokenLabel(total())}</span>
                      </span>
                    </div>
                  )}
                </Show>
                <Show when={cacheOverview().models.length > 1}>
                  <div class="flex flex-col gap-0.5 border-t border-v2-border-border-muted pt-1">
                    <div class="opacity-70">{t("session.toolbar.cache.modelBreakdown")}</div>
                    <For each={cacheRows()}>
                      {(item) => (
                        <div
                          class={`flex items-center justify-between gap-3 ${
                            item.modelKey === currentCacheStats()?.modelKey ? "text-v2-text-text-base" : ""
                          }`}
                        >
                          <span class="min-w-0 truncate">{cacheModelLabel(item)}</span>
                          <span class="shrink-0" style={{ color: cacheHitRateColor(item.hitRate) }}>
                            {cacheRateLabel(item)}
                          </span>
                        </div>
                      )}
                    </For>
                    <Show when={hiddenCacheRows() > 0}>
                      <div class="opacity-70">
                        {t("session.toolbar.cache.moreModels", { count: hiddenCacheRows() })}
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            }
            placement="top"
          >
            <span class="flex items-center gap-1.5 tabular-nums">
              <span
                class="relative size-4 shrink-0 rounded-full"
                style={{
                  background: `conic-gradient(${hitRateColor()} ${ringDeg()}deg, var(--v2-background-bg-deep) 0)`,
                }}
              >
                <span class="absolute inset-[3px] rounded-full bg-v2-background-bg-base" />
              </span>
              <span class="opacity-70">{t("session.toolbar.cache.label")}</span>
              <span style={{ color: hitRate() === undefined ? undefined : hitRateColor() }}>
                {hitRate() === undefined ? "—" : `${Math.round(hitRate()! * 100)}%`}
              </span>
            </span>
          </Tooltip>

          <span class="h-4 w-px shrink-0 bg-v2-border-border-muted" />

          <Tooltip value={t("session.toolbar.drift.tip")} placement="top">
            <span class={`flex items-center gap-1.5 ${drift() > 0 ? "text-v2-text-text-accent" : ""}`}>
              <span
                class="size-1.5 shrink-0 rounded-full"
                style={
                  drift() > 0
                    ? { background: "var(--mimo-accent)" }
                    : { background: "var(--v2-green-600)", animation: "mimo-pulse 2.4s infinite" }
                }
              />
              {drift() > 0 ? t("session.toolbar.drift.count", { count: drift() }) : t("session.toolbar.drift.stable")}
            </span>
          </Tooltip>

          <span class="h-4 w-px shrink-0 bg-v2-border-border-muted" />

          <Tooltip
            value={
              <div class="flex flex-col gap-0.5">
                <div>{t("session.toolbar.context.tip")}</div>
                <Show when={contextUsageLabel(metrics().context?.usage ?? null)}>
                  {(usage) => (
                    <div class="tabular-nums" style={{ color: contextUsageColor(metrics().context?.usage ?? null) }}>
                      {usage()}
                    </div>
                  )}
                </Show>
              </div>
            }
            placement="top"
          >
            <span class="flex items-center gap-1.5 tabular-nums">
              <span class="opacity-70">{t("session.toolbar.context.label")}</span>
              <Show when={metrics().context} fallback={<span>—</span>}>
                {(ctx) => (
                  <span class="flex items-center gap-1.5">
                    <span style={{ color: contextUsageColor(ctx().usage) }}>
                      {fmt(ctx().total)}
                      {ctx().limit ? ` / ${fmt(ctx().limit!)}` : ""}
                    </span>
                    <Show when={ctx().usage !== null}>
                      <span class="h-1 w-14 overflow-hidden rounded-full bg-v2-background-bg-deep">
                        <span
                          class="block h-full rounded-full"
                          style={{ width: `${Math.max(2, ctx().usage!)}%`, background: contextUsageColor(ctx().usage) }}
                        />
                      </span>
                    </Show>
                  </span>
                )}
              </Show>
            </span>
          </Tooltip>

          <span class="h-4 w-px shrink-0 bg-v2-border-border-muted" />

          <Tooltip
            placement="top"
            value={
              <div class="flex flex-col gap-0.5 tabular-nums">
                <div>{t("session.toolbar.usage.tip")}</div>
                <div class="opacity-80">
                  {t("session.toolbar.usage.input")}: {fmt(metrics().sessionUsage.input)}
                </div>
                <div class="opacity-80">
                  {t("session.toolbar.usage.output")}: {fmt(metrics().sessionUsage.output)}
                </div>
                <div class="opacity-80">
                  {t("session.toolbar.usage.reasoning")}: {fmt(metrics().sessionUsage.reasoning)}
                </div>
                <div class="opacity-80">
                  {t("session.toolbar.usage.cache")}:{" "}
                  {fmt(metrics().sessionUsage.cacheRead + metrics().sessionUsage.cacheWrite)}
                </div>
              </div>
            }
          >
            <span class="flex items-center gap-1.5 tabular-nums">
              <span class="opacity-70">{t("session.toolbar.usage.label")}</span>
              <Show when={metrics().sessionUsage.total > 0} fallback={<span>—</span>}>
                <span class="text-v2-text-text-base">{fmt(metrics().sessionUsage.total)}</span>
              </Show>
            </span>
          </Tooltip>

          <span class="h-4 w-px shrink-0 bg-v2-border-border-muted" />

          <Tooltip
            placement="top"
            value={
              <div class="flex flex-col gap-0.5 tabular-nums">
                <div>
                  {t("session.toolbar.ttft.label")}: {ttftLabel()}
                </div>
                <div class="opacity-70">{t("session.toolbar.throughput.tip")}</div>
                <Show when={throughput()}>
                  {(tp) => (
                    <div class="opacity-80">
                      {tp().generated} tokens · {tp().genMs !== undefined ? fmtDur(tp().genMs!) : "—"}
                    </div>
                  )}
                </Show>
              </div>
            }
          >
            <span class="flex w-16 shrink-0 items-center justify-end gap-1.5 tabular-nums">
              <Show when={throughput()?.tps} fallback={<span>—</span>}>
                {(tps) => (
                  <>
                    <b class="[font-weight:600] text-v2-text-text-base">{Math.round(tps())}</b>
                    <span class="opacity-70">tok/s</span>
                  </>
                )}
              </Show>
            </span>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
