import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import { setMessageMetaLoading } from "./directory-sync"
import type { MessageSyncMeta } from "./global-sync/types"

const metaStore = (message_meta: Record<string, MessageSyncMeta>) => createStore({ message_meta })

describe("setMessageMetaLoading", () => {
  test("creates the meta entry when the session has none yet", () => {
    // Regression: loadMessages on a session that was never seeded (cold open,
    // or re-open after LRU eviction) crashed with "Cannot read properties of
    // undefined (reading 'loading')" inside the solid store path setter.
    const [store, setStore] = metaStore({})

    setMessageMetaLoading(setStore as (...args: unknown[]) => void, "ses_1", true)

    expect(store.message_meta.ses_1?.loading).toBe(true)
  })

  test("preserves pagination fields when toggling loading on an existing entry", () => {
    const [store, setStore] = metaStore({
      ses_1: { limit: 3, cursor: "msg_1", complete: false, loading: true },
    })

    setMessageMetaLoading(setStore as (...args: unknown[]) => void, "ses_1", false)

    expect(store.message_meta.ses_1).toEqual({ limit: 3, cursor: "msg_1", complete: false, loading: false })
  })

  test("leaves other sessions untouched", () => {
    const [store, setStore] = metaStore({
      ses_2: { limit: 7, complete: true, loading: false },
    })

    setMessageMetaLoading(setStore as (...args: unknown[]) => void, "ses_1", true)

    expect(store.message_meta.ses_1?.loading).toBe(true)
    expect(store.message_meta.ses_2).toEqual({ limit: 7, complete: true, loading: false })
  })
})
