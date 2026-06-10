import { describe, expect, test } from "bun:test"
import type {
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  SessionStatus,
  SnapshotFileDiff,
  Todo,
} from "@opencode-ai/sdk/v2/client"
import { dropSessionCaches, pickSessionCacheEvictions, sessionMessagesCached } from "./session-cache"

const msg = (id: string, sessionID: string) =>
  ({
    id,
    sessionID,
    role: "user",
    time: { created: 1 },
    agent: "assistant",
    model: { providerID: "openai", modelID: "gpt" },
  }) as Message

const part = (id: string, sessionID: string, messageID: string) =>
  ({
    id,
    sessionID,
    messageID,
    type: "text",
    text: id,
  }) as Part

describe("app session cache", () => {
  test("dropSessionCaches clears orphaned parts without message rows", () => {
    const store: {
      session_status: Record<string, SessionStatus | undefined>
      session_diff: Record<string, SnapshotFileDiff[] | undefined>
      todo: Record<string, Todo[] | undefined>
      message: Record<string, Message[] | undefined>
      message_meta: Record<string, { limit?: number; complete?: boolean } | undefined>
      part: Record<string, Part[] | undefined>
      permission: Record<string, PermissionRequest[] | undefined>
      question: Record<string, QuestionRequest[] | undefined>
      part_text_accum_delta: Record<string, string | undefined>
    } = {
      session_status: { ses_1: { type: "busy" } as SessionStatus },
      session_diff: { ses_1: [] },
      todo: { ses_1: [] as Todo[] },
      message: {},
      message_meta: {},
      part: { msg_1: [part("prt_1", "ses_1", "msg_1")] },
      permission: { ses_1: [] as PermissionRequest[] },
      question: { ses_1: [] as QuestionRequest[] },
      part_text_accum_delta: { prt_1: "streamed text" },
    }

    dropSessionCaches(store, ["ses_1"])

    expect(store.message.ses_1).toBeUndefined()
    expect(store.part.msg_1).toBeUndefined()
    expect(store.part_text_accum_delta.prt_1).toBeUndefined()
    expect(store.todo.ses_1).toBeUndefined()
    expect(store.session_diff.ses_1).toBeUndefined()
    expect(store.session_status.ses_1).toBeUndefined()
    expect(store.permission.ses_1).toBeUndefined()
    expect(store.question.ses_1).toBeUndefined()
  })

  test("dropSessionCaches clears message-backed parts", () => {
    const m = msg("msg_1", "ses_1")
    const store: {
      session_status: Record<string, SessionStatus | undefined>
      session_diff: Record<string, SnapshotFileDiff[] | undefined>
      todo: Record<string, Todo[] | undefined>
      message: Record<string, Message[] | undefined>
      message_meta: Record<string, { limit?: number; complete?: boolean } | undefined>
      part: Record<string, Part[] | undefined>
      permission: Record<string, PermissionRequest[] | undefined>
      question: Record<string, QuestionRequest[] | undefined>
      part_text_accum_delta: Record<string, string | undefined>
    } = {
      session_status: {},
      session_diff: {},
      todo: {},
      message: { ses_1: [m] },
      message_meta: {},
      part: { [m.id]: [part("prt_1", "ses_1", m.id)] },
      permission: {},
      question: {},
      part_text_accum_delta: {},
    }

    dropSessionCaches(store, ["ses_1"])

    expect(store.message.ses_1).toBeUndefined()
    expect(store.part[m.id]).toBeUndefined()
  })

  test("dropSessionCaches clears the message sync meta together with the messages", () => {
    const store = {
      session_status: {},
      session_diff: {},
      todo: {},
      message: { ses_1: [msg("msg_1", "ses_1")] },
      message_meta: { ses_1: { limit: 1, complete: false } },
      part: {},
      permission: {},
      question: {},
      part_text_accum_delta: {},
    }

    dropSessionCaches(store, ["ses_1"])

    expect(store.message.ses_1).toBeUndefined()
    expect(store.message_meta.ses_1).toBeUndefined()
  })

  test("sessionMessagesCached requires messages and sync meta to agree", () => {
    const message = { ses_1: [msg("msg_1", "ses_1")] }

    expect(sessionMessagesCached({ message, message_meta: { ses_1: { limit: 1 } } }, "ses_1")).toBe(true)
    expect(sessionMessagesCached({ message, message_meta: {} }, "ses_1")).toBe(false)
    expect(sessionMessagesCached({ message, message_meta: { ses_1: { loading: false } } }, "ses_1")).toBe(false)
    expect(sessionMessagesCached({ message: {}, message_meta: { ses_1: { limit: 1 } } }, "ses_1")).toBe(false)
  })

  test("pickSessionCacheEvictions preserves requested sessions", () => {
    const seen = new Set(["ses_1", "ses_2", "ses_3"])

    const stale = pickSessionCacheEvictions({
      seen,
      keep: "ses_4",
      limit: 2,
      preserve: ["ses_1"],
    })

    expect(stale).toEqual(["ses_2", "ses_3"])
    expect([...seen]).toEqual(["ses_1", "ses_4"])
  })
})
