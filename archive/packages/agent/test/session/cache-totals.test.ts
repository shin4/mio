import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Session as SessionNs } from "@/session/session"
import * as Log from "@opencode-ai/core/util/log"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { testEffect } from "../lib/effect"
import { Bus } from "@/bus"
import { Storage } from "@/storage/storage"
import { SyncEvent } from "@/sync"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { BackgroundJob } from "@/background/job"

void Log.init({ print: false })

const it = testEffect(
  Layer.mergeAll(
    SessionNs.layer.pipe(
      Layer.provide(Bus.layer),
      Layer.provide(Storage.defaultLayer),
      Layer.provide(SyncEvent.defaultLayer),
      Layer.provide(RuntimeFlags.layer({ experimentalWorkspaces: false })),
      Layer.provide(BackgroundJob.defaultLayer),
    ),
    CrossSpawnSpawner.defaultLayer,
  ),
)

describe("session cache totals", () => {
  it.instance("accumulates cache tokens on the session row and exposes them as info.cache", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const info = yield* session.create({})

      const first = yield* session.addCacheTokens({ sessionID: info.id, readTokens: 80, missTokens: 20 })
      expect(first).toEqual({ hit: 80, miss: 20 })

      const second = yield* session.addCacheTokens({ sessionID: info.id, readTokens: 120, missTokens: 30 })
      expect(second).toEqual({ hit: 200, miss: 50 })

      const loaded = yield* session.get(info.id)
      expect(loaded.cache).toEqual({ hit: 200, miss: 50, drift: 0 })

      yield* session.remove(info.id)
    }),
  )

  it.instance("counts prefix drift on the session row and exposes it as info.cache.drift", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const info = yield* session.create({})

      expect(yield* session.addPrefixDrift(info.id)).toBe(1)
      expect(yield* session.addPrefixDrift(info.id)).toBe(2)

      const loaded = yield* session.get(info.id)
      expect(loaded.cache).toEqual({ hit: 0, miss: 0, drift: 2 })

      yield* session.remove(info.id)
    }),
  )
})
