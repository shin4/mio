import { beforeAll, describe, expect, mock, test } from "bun:test"
import { createRoot, getOwner, type Owner } from "solid-js"
import { createStore } from "solid-js/store"
import type { NormalizedProviderListResponse } from "@opencode-ai/ui/context"
import type { State } from "./types"
import { directoryKey } from "./utils"
import type { QueryOptionsApi } from "../server-sync"

let createChildStoreManager: typeof import("./child-store").createChildStoreManager

const child = () => createStore({} as State)
const provider = { all: new Map(), connected: [], default: {} } satisfies NormalizedProviderListResponse

const queryOptionsApi = {
  globalConfig: () => ({ queryKey: ["globalConfig"], queryFn: async () => ({}) }),
  projects: () => ({ queryKey: ["projects"], queryFn: async () => [] }),
  providers: (directory: string | null) => ({ queryKey: [directory, "providers"], queryFn: async () => provider }),
  path: (directory: string | null) => ({
    queryKey: [directory, "path"],
    queryFn: async () => ({
      state: "",
      config: "",
      worktree: "",
      directory: directory ?? "",
      home: "",
    }),
  }),
  agents: (directory: string) => ({ queryKey: [directory, "agents"], queryFn: async () => [] }),
  mcp: (directory: string) => ({ queryKey: [directory, "mcp"], queryFn: async () => ({}) }),
  lsp: (directory: string) => ({ queryKey: [directory, "lsp"], queryFn: async () => [] }),
  sessions: (directory: string) => ({ queryKey: [directory, "loadSessions"] as const }),
} as unknown as QueryOptionsApi

function createOwner(callback: (owner: Owner) => void) {
  return createRoot((dispose) => {
    const owner = getOwner()
    if (!owner) throw new Error("owner required")
    callback(owner)

    return dispose
  })
}

beforeAll(async () => {
  mock.module("@/utils/persist", () => ({
    Persist: {
      workspace: (...parts: string[]) => parts.join(":"),
    },
    persisted: (_target: string, store: unknown[]) => [store[0], store[1], null, () => true],
  }))
  mock.module("@tanstack/solid-query", () => ({
    useQueries: () => [
      { isLoading: false, data: { state: "", config: "", worktree: "", directory: "", home: "" } },
      { isLoading: false, data: {} },
      { isLoading: false, data: [] },
      { isLoading: false, data: provider },
    ],
  }))

  createChildStoreManager = (await import("./child-store")).createChildStoreManager
})

describe("createChildStoreManager", () => {
  test("does not evict the active directory during mark", () => {
    const owner = createRoot((dispose) => {
      const current = getOwner()
      dispose()
      return current
    })
    if (!owner) throw new Error("owner required")

    const manager = createChildStoreManager({
      owner,
      isBooting: () => false,
      isLoadingSessions: () => false,
      onBootstrap() {},
      onDispose() {},
      translate: (key) => key,
      queryOptions: queryOptionsApi,
      global: { provider },
    })

    Array.from({ length: 30 }, (_, index) => `/pinned-${index}`).forEach((directory) => {
      manager.children[directory] = child()
      manager.pin(directory)
    })

    const directory = "/active"
    manager.children[directory] = child()
    manager.mark(directory)

    expect(manager.children[directory]).toBeDefined()
  })

  test("starts new child stores as loading and bootstraps them on first access", () => {
    const bootstraps: string[] = []
    let manager: ReturnType<typeof createChildStoreManager> | undefined

    const dispose = createOwner((owner) => {
      manager = createChildStoreManager({
        owner,
        isBooting: () => false,
        isLoadingSessions: () => false,
        onBootstrap(directory) {
          bootstraps.push(directory)
        },
        onDispose() {},
        translate: (key) => key,
        queryOptions: queryOptionsApi,
        global: { provider },
      })
    })

    try {
      if (!manager) throw new Error("manager required")

      const [store] = manager.child("/project")

      expect(store.status).toBe("loading")
      expect(bootstraps).toEqual(["/project"])
    } finally {
      dispose()
    }
  })

  // server-sync.tsx now calls ensureChild() when a live event arrives for a
  // directory with no store (e.g. a session running in the user's home dir that
  // was never bootstrapped as a project). That recovery path depends on
  // ensureChild creating the store *synchronously* and *without* triggering a
  // bootstrap of its own (server-sync queues the refetch separately).
  test("ensureChild synchronously creates a store + vcs cache for an untracked directory without bootstrapping", () => {
    const bootstraps: string[] = []
    let manager: ReturnType<typeof createChildStoreManager> | undefined

    const dispose = createOwner((owner) => {
      manager = createChildStoreManager({
        owner,
        isBooting: () => false,
        isLoadingSessions: () => false,
        onBootstrap(directory) {
          bootstraps.push(directory)
        },
        onDispose() {},
        translate: (key) => key,
        queryOptions: queryOptionsApi,
        global: { provider },
      })
    })

    try {
      if (!manager) throw new Error("manager required")

      const key = directoryKey("/Users/shin")
      const [store, setStore] = manager.ensureChild("/Users/shin")

      expect(store).toBeDefined()
      expect(typeof setStore).toBe("function")
      expect(manager.children[key]).toBeDefined()
      expect(manager.vcsCache.get(key)).toBeDefined()
      // ensureChild must not bootstrap (that is child()'s job) — otherwise the
      // hot event path would fire redundant loads.
      expect(bootstraps).toEqual([])
      // Idempotent: a second call returns the same store instance.
      expect(manager.ensureChild("/Users/shin")[0]).toBe(store)
    } finally {
      dispose()
    }
  })
})
