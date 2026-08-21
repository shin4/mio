import type {
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  SessionStatus,
  SnapshotFileDiff,
  Todo,
} from "@opencode-ai/sdk/v2/client"
import type { MessageSyncMeta } from "./types"

export const SESSION_CACHE_LIMIT = 40

type SessionCache = {
  session_status: Record<string, SessionStatus | undefined>
  session_diff: Record<string, SnapshotFileDiff[] | undefined>
  todo: Record<string, Todo[] | undefined>
  message: Record<string, Message[] | undefined>
  message_meta: Record<string, MessageSyncMeta | undefined>
  part: Record<string, Part[] | undefined>
  permission: Record<string, PermissionRequest[] | undefined>
  question: Record<string, QuestionRequest[] | undefined>
  part_text_accum_delta: Record<string, string | undefined>
}

// A session's message cache only counts as loaded when the messages AND their
// pagination meta are both present — events re-seed `message` on their own, so
// a missing meta means the cache was dropped and session.sync() must refetch.
export function sessionMessagesCached(
  store: Pick<SessionCache, "message" | "message_meta">,
  sessionID: string,
) {
  return store.message[sessionID] !== undefined && store.message_meta[sessionID]?.limit !== undefined
}

export function dropSessionCaches(store: SessionCache, sessionIDs: Iterable<string>) {
  const stale = new Set(Array.from(sessionIDs).filter(Boolean))
  if (stale.size === 0) return

  for (const key of Object.keys(store.part)) {
    const parts = store.part[key]
    if (!parts?.some((part) => stale.has(part?.sessionID ?? ""))) continue
    for (const part of parts) {
      delete store.part_text_accum_delta[part.id]
    }
    delete store.part[key]
  }

  for (const sessionID of stale) {
    delete store.message[sessionID]
    delete store.message_meta[sessionID]
    delete store.todo[sessionID]
    delete store.session_diff[sessionID]
    delete store.session_status[sessionID]
    delete store.permission[sessionID]
    delete store.question[sessionID]
  }
}

export function pickSessionCacheEvictions(input: {
  seen: Set<string>
  keep: string
  limit: number
  preserve?: Iterable<string>
}) {
  const stale: string[] = []
  const keep = new Set([input.keep, ...Array.from(input.preserve ?? [])])
  if (input.seen.has(input.keep)) input.seen.delete(input.keep)
  input.seen.add(input.keep)
  for (const id of input.seen) {
    if (input.seen.size - stale.length <= input.limit) break
    if (keep.has(id)) continue
    stale.push(id)
  }
  for (const id of stale) {
    input.seen.delete(id)
  }
  return stale
}
