// The desktop shell drives the app with an in-memory router (the renderer has
// no real URL bar). Without persistence a reload throws navigation state away
// and the app falls back to the home route, so refreshing while inside a
// session bounces the user to the entry page. The web build keeps its place
// because the history router stores the location in the URL — we reproduce that
// by persisting the last visited location and seeding the memory history with
// it on the next launch.

const ROUTE_STORE = "mio.global.dat"
const ROUTE_KEY = "route.last"
const PERSIST_DEBOUNCE_MS = 200

/**
 * The slice of `@solidjs/router`'s `MemoryHistory` this module needs. Declared
 * locally so the persistence logic stays free of the router import (and the
 * SSR-only client-API guard it trips when loaded outside a DOM).
 */
export type SeedableHistory = {
  get: () => string
  set: (change: { value: string; replace?: boolean }) => void
  listen: (listener: (value: string) => void) => () => void
}

/** Read the location the previous session ended on, if any. */
export async function loadPersistedRoute(): Promise<string | undefined> {
  try {
    const value = await window.api.storeGet(ROUTE_STORE, ROUTE_KEY)
    if (typeof value !== "string") return undefined
    // Stored verbatim as a router location ("/<slug>/session/<id>"); ignore
    // anything that doesn't look like one so a corrupt value can't wedge boot.
    if (!value.startsWith("/")) return undefined
    return value
  } catch {
    return undefined
  }
}

/**
 * Seed `history` with the restored `initial` location and persist every
 * subsequent change (debounced). Pass a `createMemoryHistory()` instance here
 * before handing it to `MemoryRouter` via its `history` prop.
 */
export function attachRoutePersistence<H extends SeedableHistory>(history: H, initial?: string): H {
  // `replace: true` swaps the lone "/" entry the history starts with, so the
  // router reads the restored location as its initial route.
  if (initial && initial !== "/") {
    history.set({ value: initial, replace: true })
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: string | undefined
  let saved = initial

  const flush = () => {
    timer = undefined
    const value = pending
    pending = undefined
    if (value === undefined || value === saved) return
    saved = value
    void window.api.storeSet(ROUTE_STORE, ROUTE_KEY, value).catch(() => undefined)
  }

  history.listen((value) => {
    pending = value
    if (timer !== undefined) return
    timer = setTimeout(flush, PERSIST_DEBOUNCE_MS)
  })

  return history
}
