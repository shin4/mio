import { afterEach, describe, expect, test } from "bun:test"

import { attachRoutePersistence, loadPersistedRoute, type SeedableHistory } from "./route-persistence"

const ROUTE_STORE = "mio.global.dat"
const ROUTE_KEY = "route.last"

type StoreCall = { name: string; key: string; value?: string }

function installApi(opts: { get?: (name: string, key: string) => unknown } = {}) {
  const sets: StoreCall[] = []
  const gets: StoreCall[] = []
  ;(globalThis as any).window = {
    api: {
      storeGet: async (name: string, key: string) => {
        gets.push({ name, key })
        return (opts.get?.(name, key) ?? null) as string | null
      },
      storeSet: async (name: string, key: string, value: string) => {
        sets.push({ name, key, value })
      },
    },
  }
  return { sets, gets }
}

afterEach(() => {
  delete (globalThis as any).window
})

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Minimal stand-in mirroring `createMemoryHistory()`'s replace/listen semantics. */
function fakeHistory(): SeedableHistory {
  const entries = ["/"]
  let index = 0
  const listeners: Array<(value: string) => void> = []
  return {
    get: () => entries[index],
    set: ({ value, replace }) => {
      if (replace) entries[index] = value
      else {
        entries.splice(index + 1, entries.length - index, value)
        index++
      }
      listeners.forEach((listener) => listener(value))
    },
    listen: (listener) => {
      listeners.push(listener)
      return () => listeners.splice(listeners.indexOf(listener), 1)
    },
  }
}

describe("loadPersistedRoute", () => {
  test("returns a stored router location", async () => {
    installApi({ get: () => "/abc/session/ses_123" })
    expect(await loadPersistedRoute()).toBe("/abc/session/ses_123")
  })

  test("ignores values that are not router locations", async () => {
    installApi({ get: () => "not-a-path" })
    expect(await loadPersistedRoute()).toBeUndefined()
  })

  test("returns undefined when nothing is stored", async () => {
    installApi({ get: () => null })
    expect(await loadPersistedRoute()).toBeUndefined()
  })

  test("swallows storage errors", async () => {
    installApi({
      get: () => {
        throw new Error("boom")
      },
    })
    expect(await loadPersistedRoute()).toBeUndefined()
  })
})

describe("attachRoutePersistence", () => {
  test("seeds the history with the restored location", () => {
    installApi()
    const history = attachRoutePersistence(fakeHistory(), "/abc/session/ses_123")
    expect(history.get()).toBe("/abc/session/ses_123")
  })

  test("leaves the history at root when there is no restored location", () => {
    installApi()
    expect(attachRoutePersistence(fakeHistory()).get()).toBe("/")
    expect(attachRoutePersistence(fakeHistory(), "/").get()).toBe("/")
  })

  test("persists location changes (debounced) without re-saving the seed", async () => {
    const { sets } = installApi()
    const history = attachRoutePersistence(fakeHistory(), "/abc/session/ses_1")

    history.set({ value: "/abc/session/ses_2" })
    history.set({ value: "/abc/session/ses_3" })
    await tick(220)

    const routeWrites = sets.filter((call) => call.key === ROUTE_KEY)
    expect(routeWrites).toHaveLength(1)
    expect(routeWrites[0]).toEqual({ name: ROUTE_STORE, key: ROUTE_KEY, value: "/abc/session/ses_3" })
  })

  test("does not persist when navigation stays on the seeded location", async () => {
    const { sets } = installApi()
    const history = attachRoutePersistence(fakeHistory(), "/abc/session/ses_1")

    // A self-correcting replace to the same location must not write.
    history.set({ value: "/abc/session/ses_1", replace: true })
    await tick(220)

    expect(sets.filter((call) => call.key === ROUTE_KEY)).toHaveLength(0)
  })
})
