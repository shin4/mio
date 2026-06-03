import { beforeAll, describe, expect, mock, test } from "bun:test"

const assistant = (input: {
  id: string
  providerID: string
  modelID: string
  variant?: string
  tokens: { input: number; read: number; write: number }
}) => ({
  id: input.id,
  sessionID: "ses_1",
  role: "assistant" as const,
  providerID: input.providerID,
  modelID: input.modelID,
  variant: input.variant,
  tokens: {
    input: input.tokens.input,
    output: 0,
    reasoning: 0,
    cache: {
      read: input.tokens.read,
      write: input.tokens.write,
    },
  },
  time: { created: 1 },
})

const stats = async () => {
  const toolbar = await import("./session-toolbar")
  const fn = (
    toolbar as unknown as {
      getModelScopedCacheStats?: (input: {
        messages: readonly ReturnType<typeof assistant>[]
        model?: { providerID: string; id: string; variant?: string }
        events?: readonly {
          turnId: string
          modelKey: string | undefined
          readTokens: number
          missTokens: number
        }[]
      }) => { read: number; miss: number; hitRate: number; modelKey: string } | undefined
      cacheModelKey?: (input: { providerID: string; id?: string; modelID?: string; variant?: string }) => string | undefined
    }
  ).getModelScopedCacheStats

  expect(fn).toBeDefined()
  return fn!
}

const overview = async () => {
  const toolbar = await import("./session-toolbar")
  const fn = (
    toolbar as unknown as {
      getSessionCacheOverview?: (input: {
        messages: readonly ReturnType<typeof assistant>[]
        model?: { providerID: string; id: string; variant?: string }
        events?: readonly {
          turnId: string
          modelKey: string | undefined
          readTokens: number
          missTokens: number
        }[]
      }) => {
        active?: { modelKey: string; model: { providerID: string; modelID: string; variant?: string } }
        current?: { read: number; miss: number; hitRate: number; modelKey: string }
        display?: { read: number; miss: number; hitRate: number; modelKey: string }
        total?: { read: number; miss: number; hitRate: number }
        models: { read: number; miss: number; hitRate: number; modelKey: string }[]
      }
    }
  ).getSessionCacheOverview

  expect(fn).toBeDefined()
  return fn!
}

const key = async (input: { providerID: string; id?: string; modelID?: string; variant?: string }) => {
  const toolbar = await import("./session-toolbar")
  const fn = (
    toolbar as unknown as {
      cacheModelKey?: (value: { providerID: string; id?: string; modelID?: string; variant?: string }) => string
    }
  ).cacheModelKey

  expect(fn).toBeDefined()
  return fn!(input)
}

beforeAll(() => {
  mock.module("@opencode-ai/ui/tooltip", () => ({
    Tooltip: (props: { children?: unknown }) => props.children,
  }))
  mock.module("@/context/language", () => ({
    useLanguage: () => ({ t: (key: string) => key }),
  }))
  mock.module("@/context/server-sdk", () => ({
    useServerSDK: () => ({ event: { listen: () => () => {} } }),
  }))
  mock.module("@/context/sync", () => ({
    useSync: () => ({ data: { message: {}, part: {} } }),
  }))
  mock.module("@/hooks/use-providers", () => ({
    useProviders: () => ({ all: () => new Map() }),
  }))
  mock.module("./session-context-metrics", () => ({
    getSessionContextMetrics: () => ({ context: undefined }),
  }))
})

describe("SessionToolbar cache hit rate color", () => {
  test("counts cache writes as misses in the hit rate denominator", async () => {
    const getModelScopedCacheStats = await stats()
    const result = getModelScopedCacheStats({
      messages: [
        assistant({
          id: "msg_1",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          tokens: { input: 500, read: 200, write: 300 },
        }),
      ],
      model: { providerID: "mimo", id: "mimo-v2.5" },
    })

    expect(result?.read).toBe(200)
    expect(result?.miss).toBe(800)
    expect(Math.round((result?.hitRate ?? 0) * 100)).toBe(20)
  })

  test("uses only the active session model when multiple models appear in one session", async () => {
    const getModelScopedCacheStats = await stats()
    const result = getModelScopedCacheStats({
      messages: [
        assistant({
          id: "msg_a",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          tokens: { input: 100, read: 900, write: 0 },
        }),
        assistant({
          id: "msg_b",
          providerID: "mimo",
          modelID: "mimo-v2.5-pro",
          tokens: { input: 80, read: 20, write: 0 },
        }),
      ],
      model: { providerID: "mimo", id: "mimo-v2.5-pro" },
    })

    expect(result?.read).toBe(20)
    expect(result?.miss).toBe(80)
    expect(Math.round((result?.hitRate ?? 0) * 100)).toBe(20)
  })

  test("keeps provider and variant separated even when model IDs match", async () => {
    const getModelScopedCacheStats = await stats()
    const result = getModelScopedCacheStats({
      messages: [
        assistant({
          id: "msg_provider",
          providerID: "openai",
          modelID: "mimo-v2.5",
          tokens: { input: 10, read: 90, write: 0 },
        }),
        assistant({
          id: "msg_fast",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          variant: "fast",
          tokens: { input: 90, read: 10, write: 0 },
        }),
        assistant({
          id: "msg_max",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          variant: "max",
          tokens: { input: 25, read: 75, write: 0 },
        }),
      ],
      model: { providerID: "mimo", id: "mimo-v2.5", variant: "max" },
    })

    expect(result?.read).toBe(75)
    expect(result?.miss).toBe(25)
    expect(Math.round((result?.hitRate ?? 0) * 100)).toBe(75)
  })

  test("deduplicates live cache events by turn ID", async () => {
    const getModelScopedCacheStats = await stats()
    const modelKey = await key({ providerID: "mimo", id: "mimo-v2.5" })
    const result = getModelScopedCacheStats({
      messages: [],
      model: { providerID: "mimo", id: "mimo-v2.5" },
      events: [
        { turnId: "turn_1", modelKey, readTokens: 40, missTokens: 60 },
        { turnId: "turn_1", modelKey, readTokens: 40, missTokens: 60 },
      ],
    })

    expect(result?.read).toBe(40)
    expect(result?.miss).toBe(60)
    expect(Math.round((result?.hitRate ?? 0) * 100)).toBe(40)
  })

  test("aggregates all models for the tooltip overview while preserving the current model", async () => {
    const getSessionCacheOverview = await overview()
    const result = getSessionCacheOverview({
      messages: [
        assistant({
          id: "msg_a",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          tokens: { input: 10, read: 90, write: 0 },
        }),
        assistant({
          id: "msg_b",
          providerID: "mimo",
          modelID: "mimo-v2.5-pro",
          tokens: { input: 80, read: 20, write: 0 },
        }),
      ],
      model: { providerID: "mimo", id: "mimo-v2.5-pro" },
    })

    expect(result.current?.read).toBe(20)
    expect(result.current?.miss).toBe(80)
    expect(Math.round((result.current?.hitRate ?? 0) * 100)).toBe(20)
    expect(result.total?.read).toBe(110)
    expect(result.total?.miss).toBe(90)
    expect(Math.round((result.total?.hitRate ?? 0) * 100)).toBe(55)
  })

  test("keeps provider and variant separated in the tooltip model breakdown", async () => {
    const getSessionCacheOverview = await overview()
    const result = getSessionCacheOverview({
      messages: [
        assistant({
          id: "msg_provider",
          providerID: "openai",
          modelID: "mimo-v2.5",
          tokens: { input: 10, read: 90, write: 0 },
        }),
        assistant({
          id: "msg_fast",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          variant: "fast",
          tokens: { input: 90, read: 10, write: 0 },
        }),
        assistant({
          id: "msg_max",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          variant: "max",
          tokens: { input: 25, read: 75, write: 0 },
        }),
      ],
      model: { providerID: "mimo", id: "mimo-v2.5", variant: "max" },
    })

    expect(result.models).toHaveLength(3)
    expect(result.models.map((item) => item.modelKey).sort()).toEqual(
      [
        await key({ providerID: "mimo", id: "mimo-v2.5", variant: "fast" }),
        await key({ providerID: "mimo", id: "mimo-v2.5", variant: "max" }),
        await key({ providerID: "openai", id: "mimo-v2.5" }),
      ].sort(),
    )
  })

  test("deduplicates live cache events in the all-model overview", async () => {
    const getSessionCacheOverview = await overview()
    const modelKey = await key({ providerID: "mimo", id: "mimo-v2.5" })
    const result = getSessionCacheOverview({
      messages: [],
      model: { providerID: "mimo", id: "mimo-v2.5" },
      events: [
        { turnId: "turn_1", modelKey, readTokens: 40, missTokens: 60 },
        { turnId: "turn_1", modelKey, readTokens: 40, missTokens: 60 },
      ],
    })

    expect(result.total?.read).toBe(40)
    expect(result.total?.miss).toBe(60)
    expect(Math.round((result.total?.hitRate ?? 0) * 100)).toBe(40)
  })

  test("keeps active model metadata when the current model has no cache tokens", async () => {
    const getSessionCacheOverview = await overview()
    const result = getSessionCacheOverview({
      messages: [
        assistant({
          id: "msg_a",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          tokens: { input: 10, read: 90, write: 0 },
        }),
      ],
      model: { providerID: "mimo", id: "mimo-v2.5-pro" },
    })

    expect(result.active?.modelKey).toBe(await key({ providerID: "mimo", id: "mimo-v2.5-pro" }))
    expect(result.current).toBeUndefined()
    expect(result.display?.modelKey).toBe(await key({ providerID: "mimo", id: "mimo-v2.5" }))
    expect(result.display?.read).toBe(90)
    expect(result.display?.miss).toBe(10)
    expect(result.total?.read).toBe(90)
    expect(result.total?.miss).toBe(10)
  })

  test("uses the latest measured model for display when the current model has no cache tokens", async () => {
    const getSessionCacheOverview = await overview()
    const result = getSessionCacheOverview({
      messages: [
        assistant({
          id: "msg_big",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          tokens: { input: 100, read: 900, write: 0 },
        }),
        assistant({
          id: "msg_latest",
          providerID: "mimo",
          modelID: "mimo-v2.5-lite",
          tokens: { input: 80, read: 20, write: 0 },
        }),
      ],
      model: { providerID: "mimo", id: "mimo-v2.5-pro" },
    })

    expect(result.current).toBeUndefined()
    expect(result.display?.modelKey).toBe(await key({ providerID: "mimo", id: "mimo-v2.5-lite" }))
    expect(result.display?.read).toBe(20)
    expect(result.display?.miss).toBe(80)
  })

  test("keeps strict current stats separate from display fallback", async () => {
    const getModelScopedCacheStats = await stats()
    const result = getModelScopedCacheStats({
      messages: [
        assistant({
          id: "msg_a",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          tokens: { input: 10, read: 90, write: 0 },
        }),
      ],
      model: { providerID: "mimo", id: "mimo-v2.5-pro" },
    })

    expect(result).toBeUndefined()
  })

  test("does not count a live cache event after the synced turn arrives", async () => {
    const getSessionCacheOverview = await overview()
    const modelKey = await key({ providerID: "mimo", id: "mimo-v2.5" })
    const result = getSessionCacheOverview({
      messages: [
        assistant({
          id: "turn_1",
          providerID: "mimo",
          modelID: "mimo-v2.5",
          tokens: { input: 80, read: 20, write: 0 },
        }),
      ],
      model: { providerID: "mimo", id: "mimo-v2.5" },
      events: [{ turnId: "turn_1", modelKey, readTokens: 900, missTokens: 100 }],
    })

    expect(result.total?.read).toBe(20)
    expect(result.total?.miss).toBe(80)
  })

  test("renders structured cache tooltip labels for the session overview", async () => {
    const source = await Bun.file(new URL("./session-toolbar.tsx", import.meta.url)).text()

    expect(source).toContain("session.toolbar.cache.currentModel")
    expect(source).toContain("session.toolbar.cache.displayModel")
    expect(source).toContain("session.toolbar.cache.allModels")
    expect(source).toContain("session.toolbar.cache.modelBreakdown")
    expect(source).toContain("session.toolbar.cache.moreModels")
  })

  test("uses displayed percent thresholds for cache CSS variable colors", async () => {
    const toolbar = await import("./session-toolbar")
    const color = (toolbar as unknown as { cacheHitRateColor?: (rate: number) => string }).cacheHitRateColor

    expect(color?.(0.799)).toBe("var(--v2-orange-600)")
    expect(color?.(0.81)).toBe("var(--v2-yellow-700)")
    expect(color?.(0.9)).toBe("var(--v2-yellow-700)")
    expect(color?.(0.91)).toBe("var(--v2-green-600)")
  })

  test("uses cache hit rate color for the ring instead of the app accent", async () => {
    const source = await Bun.file(new URL("./session-toolbar.tsx", import.meta.url)).text()

    expect(source).toContain("const cacheStats = () => cacheOverview().display")
    expect(source).toContain("conic-gradient(${hitRateColor()}")
    expect(source).toContain("color: hitRate() === undefined ? undefined : hitRateColor()")
    expect(source).not.toContain("conic-gradient(var(--mimo-accent)")
  })
})

describe("SessionToolbar context usage color", () => {
  test("uses requested context usage thresholds", async () => {
    const toolbar = await import("./session-toolbar")
    const color = (toolbar as unknown as { contextUsageColor?: (usage: number | null) => string | undefined })
      .contextUsageColor

    expect(color?.(49)).toBe("var(--v2-green-600)")
    expect(color?.(50)).toBe("var(--v2-green-600)")
    expect(color?.(51)).toBe("var(--v2-yellow-700)")
    expect(color?.(89)).toBe("var(--v2-yellow-700)")
    expect(color?.(90)).toBe("var(--v2-red-600)")
    expect(color?.(null)).toBeUndefined()
  })

  test("formats context usage percent for the tooltip", async () => {
    const toolbar = await import("./session-toolbar")
    const label = (toolbar as unknown as { contextUsageLabel?: (usage: number | null) => string | undefined })
      .contextUsageLabel

    expect(label?.(51)).toBe("51%")
    expect(label?.(90)).toBe("90%")
    expect(label?.(null)).toBeUndefined()
  })

  test("uses context usage color for the context progress bar", async () => {
    const source = await Bun.file(new URL("./session-toolbar.tsx", import.meta.url)).text()

    expect(source).toContain("background: contextUsageColor(ctx().usage)")
    expect(source).not.toContain('class="block h-full rounded-full bg-v2-background-bg-accent"')
  })

  test("moves context usage percent out of the visible pill and into the tooltip", async () => {
    const source = await Bun.file(new URL("./session-toolbar.tsx", import.meta.url)).text()

    expect(source).toContain("contextUsageLabel(metrics().context?.usage ?? null)")
    expect(source).not.toContain("{ctx().usage}%</span>")
  })
})

describe("SessionToolbar speed tooltip", () => {
  test("always explains that TTFT and tok/s only measure the latest turn", async () => {
    const source = await Bun.file(new URL("./session-toolbar.tsx", import.meta.url)).text()
    const zh = await Bun.file(new URL("../../i18n/zh.ts", import.meta.url)).text()
    const en = await Bun.file(new URL("../../i18n/en.ts", import.meta.url)).text()

    expect(source).toContain('<div class="opacity-70">{t("session.toolbar.throughput.tip")}</div>')
    expect(source).not.toContain('fallback={<div class="opacity-70">{t("session.toolbar.throughput.tip")}</div>}')
    expect(zh).toContain("首字延迟和 tok/s 仅统计最近一轮")
    expect(en).toContain("TTFT and tok/s only measure the latest turn")
  })
})

describe("SessionToolbar layout", () => {
  test("uses the composer width container so the capsule does not resize with content", async () => {
    const source = await Bun.file(new URL("./session-toolbar.tsx", import.meta.url)).text()

    expect(source).toContain("centered?: boolean")
    expect(source).toContain('"w-full px-3": true')
    expect(source).toContain('"md:max-w-200 md:mx-auto 2xl:max-w-[1000px]": props.centered')
    expect(source).toContain("flex h-9 w-full min-w-0 items-center justify-between gap-3")
    expect(source).not.toContain("inline-flex h-9")
  })

  test("keeps the tok/s slot width stable when throughput is unavailable", async () => {
    const source = await Bun.file(new URL("./session-toolbar.tsx", import.meta.url)).text()
    const throughputShow = '<Show when={throughput()?.tps} fallback={<span>—</span>}>'
    const speedMarker = source.indexOf(throughputShow)

    expect(speedMarker).not.toBe(-1)
    expect(source).toContain(throughputShow)

    const speedTriggerStart = source.lastIndexOf("<span class=", speedMarker)
    const speedTriggerEnd = source.indexOf(">", speedTriggerStart)
    const speedTrigger = source.slice(speedTriggerStart, speedTriggerEnd + 1)

    expect(speedTrigger).toContain('class="flex w-16 shrink-0 items-center justify-end gap-1.5 tabular-nums"')
    expect(speedTrigger).not.toContain('class="flex items-center gap-1.5 tabular-nums"')
  })

  test("passes the session centered state into the status toolbar", async () => {
    const source = await Bun.file(new URL("../../pages/session.tsx", import.meta.url)).text()

    expect(source).toContain("<SessionToolbar sessionID={id()} centered={centered()} />")
  })
})

describe("computeThroughput", () => {
  const compute = async () => {
    const toolbar = await import("./session-toolbar")
    const fn = (
      toolbar as unknown as {
        computeThroughput?: (input: {
          message: { time: { created: number; completed?: number } }
          parts: ReadonlyArray<{
            type: string
            time?: { start?: number; end?: number }
            state?: { status: string; time?: { start: number; end?: number } }
          }>
          output: number
          reasoning: number
        }) => { tps?: number; ttftMs?: number; genMs?: number; generated: number } | undefined
      }
    ).computeThroughput

    expect(fn).toBeDefined()
    return fn!
  }

  test("returns undefined before the turn completes", async () => {
    const fn = await compute()
    expect(fn({ message: { time: { created: 1000 } }, parts: [], output: 0, reasoning: 0 })).toBeUndefined()
  })

  test("excludes tool-execution time from the generation window", async () => {
    const fn = await compute()
    const result = fn({
      message: { time: { created: 1000, completed: 11000 } },
      parts: [
        { type: "text", time: { start: 2000 } },
        { type: "tool", state: { status: "completed", time: { start: 3000, end: 9000 } } },
      ],
      output: 600,
      reasoning: 0,
    })

    // whole span 9000ms − 6000ms tool = 3000ms; 600 tokens → 200 tok/s
    expect(result?.genMs).toBe(3000)
    expect(Math.round(result?.tps ?? 0)).toBe(200)
  })

  test("sums text/reasoning windows and counts reasoning tokens", async () => {
    const fn = await compute()
    const result = fn({
      message: { time: { created: 1000, completed: 8000 } },
      parts: [
        { type: "reasoning", time: { start: 1500, end: 2000 } },
        { type: "text", time: { start: 2000, end: 5000 } },
        { type: "tool", state: { status: "completed", time: { start: 5000, end: 8000 } } },
      ],
      output: 300,
      reasoning: 50,
    })

    // gen windows 500ms + 3000ms = 3500ms (tool ignored); 350 tokens → 100 tok/s
    expect(result?.genMs).toBe(3500)
    expect(result?.generated).toBe(350)
    expect(result?.ttftMs).toBe(500)
    expect(Math.round(result?.tps ?? 0)).toBe(100)
  })

  test("falls back to the whole span when no segment ends or tools exist", async () => {
    const fn = await compute()
    const result = fn({
      message: { time: { created: 1000, completed: 6000 } },
      parts: [{ type: "text", time: { start: 2000 } }],
      output: 400,
      reasoning: 0,
    })

    expect(result?.genMs).toBe(4000)
    expect(Math.round(result?.tps ?? 0)).toBe(100)
  })
})
