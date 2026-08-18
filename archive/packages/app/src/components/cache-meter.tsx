/**
 * Cache hit rate indicator for MiMo sessions.
 * Subscribes to session.cache.measured events and renders a small inline
 * gauge next to each assistant message, plus a session total in the titlebar.
 */
import { Component, createSignal, onCleanup } from "solid-js"

interface CacheStats {
  readTokens: number
  missTokens: number
  hitRate: number
}

interface CacheMeterProps {
  stats: CacheStats | undefined
  compact?: boolean
}

function hitRateColor(rate: number): string {
  if (rate >= 0.9) return "text-green-400"
  if (rate >= 0.7) return "text-yellow-400"
  if (rate >= 0.4) return "text-orange-400"
  return "text-text-weak"
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** Inline per-message cache stat pill. */
export const CacheRatePill: Component<CacheMeterProps> = (props) => {
  if (!props.stats) return null
  const rate = props.stats.hitRate
  const pct = Math.round(rate * 100)
  return (
    <span
      class={`text-10-regular ${hitRateColor(rate)} tabular-nums`}
      title={`Cache: ${formatTokens(props.stats.readTokens)} hit / ${formatTokens(props.stats.missTokens)} miss`}
    >
      {pct}% cache
    </span>
  )
}

/** Session-level totals for the titlebar. */
export const CacheSessionStats: Component<{
  totalRead: number
  totalMiss: number
}> = (props) => {
  const total = () => props.totalRead + props.totalMiss
  const hitRate = () => (total() > 0 ? props.totalRead / total() : 0)
  const pct = () => Math.round(hitRate() * 100)

  return (
    <span
      class={`text-10-regular ${hitRateColor(hitRate())} tabular-nums`}
      title={`Session cache: ${formatTokens(props.totalRead)} hit / ${formatTokens(props.totalMiss)} miss`}
    >
      {pct()}% cache hit
    </span>
  )
}

/** Bar visualization (0–100%) — used in session detail panels. */
export const CacheMeterBar: Component<{ hitRate: number }> = (props) => {
  const pct = () => Math.round(props.hitRate * 100)
  return (
    <div class="flex items-center gap-2">
      <div class="flex-1 h-1.5 rounded-full bg-surface-raised-stronger-non-alpha overflow-hidden">
        <div
          class={`h-full rounded-full transition-all ${
            props.hitRate >= 0.9 ? "bg-green-400" : props.hitRate >= 0.7 ? "bg-yellow-400" : "bg-orange-400"
          }`}
          style={{ width: `${pct()}%` }}
        />
      </div>
      <span class="text-10-regular text-text-weak tabular-nums w-8">{pct()}%</span>
    </div>
  )
}
