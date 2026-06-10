import { describe, expect, test } from "bun:test"
import type { Message, Part, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { createStore, type SetStoreFunction, type Store } from "solid-js/store"
import { applyLiveDirectoryEvent } from "./server-sync"
import { canDisposeDirectory, pickDirectoriesToEvict } from "./global-sync/eviction"
import { estimateRootSessionTotal, loadRootSessionsWithFallback } from "./global-sync/session-load"
import type { State, VcsCache } from "./global-sync/types"
import { directoryKey } from "./global-sync/utils"

describe("pickDirectoriesToEvict", () => {
  test("keeps pinned stores and evicts idle stores", () => {
    const now = 5_000
    const picks = pickDirectoriesToEvict({
      stores: ["a", "b", "c", "d"],
      state: new Map([
        ["a", { lastAccessAt: 1_000 }],
        ["b", { lastAccessAt: 4_900 }],
        ["c", { lastAccessAt: 4_800 }],
        ["d", { lastAccessAt: 3_000 }],
      ]),
      pins: new Set(["a"]),
      max: 2,
      ttl: 1_500,
      now,
    })

    expect(picks).toEqual(["d", "c"])
  })
})

describe("loadRootSessionsWithFallback", () => {
  test("uses limited roots query when supported", async () => {
    const calls: Array<{ directory: string; roots: true; limit?: number }> = []

    const result = await loadRootSessionsWithFallback({
      directory: "dir",
      limit: 10,
      list: async (query) => {
        calls.push(query)
        return { data: [] }
      },
    })

    expect(result.data).toEqual([])
    expect(result.limited).toBe(true)
    expect(calls).toEqual([{ directory: "dir", roots: true, limit: 10 }])
  })

  test("falls back to full roots query on limited-query failure", async () => {
    const calls: Array<{ directory: string; roots: true; limit?: number }> = []

    const result = await loadRootSessionsWithFallback({
      directory: "dir",
      limit: 25,
      list: async (query) => {
        calls.push(query)
        if (query.limit) throw new Error("unsupported")
        return { data: [] }
      },
    })

    expect(result.data).toEqual([])
    expect(result.limited).toBe(false)
    expect(calls).toEqual([
      { directory: "dir", roots: true, limit: 25 },
      { directory: "dir", roots: true },
    ])
  })
})

describe("estimateRootSessionTotal", () => {
  test("keeps exact total for full fetches", () => {
    expect(estimateRootSessionTotal({ count: 42, limit: 10, limited: false })).toBe(42)
  })

  test("marks has-more for full-limit limited fetches", () => {
    expect(estimateRootSessionTotal({ count: 10, limit: 10, limited: true })).toBe(11)
  })

  test("keeps exact total when limited fetch is under limit", () => {
    expect(estimateRootSessionTotal({ count: 9, limit: 10, limited: true })).toBe(9)
  })
})

describe("canDisposeDirectory", () => {
  test("rejects pinned or inflight directories", () => {
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: true,
        booting: false,
        loadingSessions: false,
      }),
    ).toBe(false)
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: false,
        booting: true,
        loadingSessions: false,
      }),
    ).toBe(false)
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: false,
        booting: false,
        loadingSessions: true,
      }),
    ).toBe(false)
  })

  test("accepts idle unpinned directory store", () => {
    expect(
      canDisposeDirectory({
        directory: "dir",
        hasStore: true,
        pinned: false,
        booting: false,
        loadingSessions: false,
      }),
    ).toBe(true)
  })
})

describe("applyLiveDirectoryEvent", () => {
  test("creates a child store for unknown message updates and queues a refresh", () => {
    const directory = "/tmp/opencode-untracked"
    const children = createFakeChildren()
    const pushed: string[] = []

    applyLiveDirectoryEvent({
      directory,
      event: {
        type: "message.updated",
        properties: {
          info: completedAssistantMessage("msg_1", "ses_1"),
        },
      },
      children: children.manager,
      push: (directory) => pushed.push(directory),
      setSessionTodo() {},
      loadLsp() {},
    })

    const child = children.manager.children[directoryKey(directory)]
    expect(child).toBeDefined()
    expect(children.ensured).toEqual([directory])
    expect(children.marked).toEqual([directory])
    expect(child?.[0].message.ses_1?.map((message) => message.id)).toEqual(["msg_1"])
    expect(pushed).toEqual([directory])
  })

  test("applies part and status events to a fresh child store", () => {
    const directory = "/tmp/opencode-home"
    const children = createFakeChildren()
    const pushed: string[] = []

    applyLiveDirectoryEvent({
      directory,
      event: {
        type: "message.part.updated",
        properties: {
          part: textPart("part_1", "ses_1", "msg_1"),
        },
      },
      children: children.manager,
      push: (directory) => pushed.push(directory),
      setSessionTodo() {},
      loadLsp() {},
    })
    applyLiveDirectoryEvent({
      directory,
      event: {
        type: "session.status",
        properties: {
          sessionID: "ses_1",
          status: idleStatus(),
        },
      },
      children: children.manager,
      push: (directory) => pushed.push(directory),
      setSessionTodo() {},
      loadLsp() {},
    })

    const child = children.manager.children[directoryKey(directory)]
    expect(child?.[0].part.msg_1?.map((part) => part.id)).toEqual(["part_1"])
    expect(child?.[0].session_status.ses_1).toEqual({ type: "idle" })
    expect(children.ensured).toEqual([directory])
    expect(children.marked).toEqual([directory, directory])
    expect(pushed).toEqual([directory])
  })

  test("applies message updates to existing child stores without queuing a refresh", () => {
    const directory = "/tmp/opencode-existing"
    const child = createStore(baseState())
    const children = createFakeChildren({
      [directoryKey(directory)]: child,
    })
    const pushed: string[] = []

    applyLiveDirectoryEvent({
      directory,
      event: {
        type: "message.updated",
        properties: {
          info: completedAssistantMessage("msg_1", "ses_1"),
        },
      },
      children: children.manager,
      push: (directory) => pushed.push(directory),
      setSessionTodo() {},
      loadLsp() {},
    })

    expect(children.ensured).toEqual([])
    expect(children.marked).toEqual([directory])
    expect(child[0].message.ses_1?.map((message) => message.id)).toEqual(["msg_1"])
    expect(pushed).toEqual([])
  })
})

function createFakeChildren(initial: Record<string, ChildStore> = {}) {
  const children = { ...initial }
  const ensured: string[] = []
  const marked: string[] = []
  const manager = {
    children,
    vcsCache: new Map<string, VcsCache>(),
    ensureChild(directory: string) {
      ensured.push(directory)
      const key = directoryKey(directory)
      if (!children[key]) children[key] = createStore(baseState())
      const child = children[key]
      if (!child) throw new Error("child store was not created")
      return child
    },
    mark(directory: string) {
      marked.push(directory)
    },
  }

  return { manager, ensured, marked }
}

function baseState(): State {
  return {
    status: "loading",
    agent: [],
    command: [],
    project: "",
    projectMeta: undefined,
    icon: undefined,
    provider_ready: true,
    provider: {
      all: new Map(),
      connected: [],
      default: {},
    },
    config: {},
    path: {
      state: "",
      config: "",
      worktree: "",
      directory: "",
      home: "",
    },
    session: [],
    sessionTotal: 0,
    session_status: {},
    session_working(_id: string) {
      return false
    },
    session_diff: {},
    todo: {},
    permission: {},
    question: {},
    mcp_ready: true,
    mcp: {},
    lsp_ready: true,
    lsp: [],
    vcs: undefined,
    limit: 5,
    message: {},
    part: {},
    message_meta: {},
    part_text_accum_delta: {},
  }
}

function completedAssistantMessage(id: string, sessionID: string) {
  return {
    id,
    sessionID,
    role: "assistant",
    time: {
      created: 1,
      completed: 2,
    },
  } as unknown as Message
}

function textPart(id: string, sessionID: string, messageID: string) {
  return {
    id,
    sessionID,
    messageID,
    type: "text",
    text: "hello",
  } as unknown as Part
}

function idleStatus() {
  return { type: "idle" } as unknown as SessionStatus
}

type ChildStore = [Store<State>, SetStoreFunction<State>]
