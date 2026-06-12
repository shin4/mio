import { afterEach, expect } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Cause, Effect, Exit, Fiber, Layer } from "effect"
import { bootstrap as cliBootstrap } from "../../src/cli/bootstrap"
import { InstanceLayer } from "../../src/project/instance-layer"
import { InstanceStore } from "../../src/project/instance-store"
import { disposeAllInstances, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { waitGlobalBusEvent } from "../server/global-bus"

const it = testEffect(Layer.mergeAll(InstanceLayer.layer, CrossSpawnSpawner.defaultLayer))

// InstanceBootstrap must run before any code touches the instance —
// originally tracked by PRs #25389 and #25449, now a permanent
// invariant. The plugin config hook writes a marker file; the test
// bodies deliberately avoid Plugin/config directly. The marker only
// appears if InstanceBootstrap ran at the instance boundary.
//
// The boundaries below are transport-agnostic and stay.

afterEach(async () => {
  await disposeAllInstances()
})

const bootstrapFixture = Effect.gen(function* () {
  const dir = yield* tmpdirScoped({ git: true })
  const marker = path.join(dir, "config-hook-fired")
  const pluginFile = path.join(dir, "plugin.ts")
  yield* Effect.promise(() =>
    Bun.write(
      pluginFile,
      [
        `const MARKER = ${JSON.stringify(marker)}`,
        "export default async () => ({",
        "  config: async () => {",
        '    await Bun.write(MARKER, "ran")',
        "  },",
        "})",
        "",
      ].join("\n"),
    ),
  )
  yield* Effect.promise(() =>
    Bun.write(
      path.join(dir, "mimo.json"),
      JSON.stringify({
        $schema: "https://platform.xiaomimimo.com/mimo-code/config.json",
        plugin: [pathToFileURL(pluginFile).href],
      }),
    ),
  )
  return { directory: dir, marker }
})

function withTrustedProjectPlugins<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.MIMO_TRUST_PROJECT_PLUGINS
      process.env.MIMO_TRUST_PROJECT_PLUGINS = "1"
      return previous
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env.MIMO_TRUST_PROJECT_PLUGINS
        else process.env.MIMO_TRUST_PROJECT_PLUGINS = previous
      }),
  )
}

function waitDisposed(directory: string) {
  return waitGlobalBusEvent({
    message: "timed out waiting for CLI bootstrap instance disposal",
    predicate: (event) => event.payload.type === "server.instance.disposed" && event.directory === directory,
  })
}

it.live("InstanceStore.provide runs InstanceBootstrap before effect", () =>
  withTrustedProjectPlugins(
    Effect.gen(function* () {
      const tmp = yield* bootstrapFixture
      const store = yield* InstanceStore.Service

      yield* store.provide({ directory: tmp.directory }, Effect.succeed("ok"))

      expect(existsSync(tmp.marker)).toBe(true)
    }),
  ),
)

it.live("CLI bootstrap runs InstanceBootstrap before callback", () =>
  withTrustedProjectPlugins(
    Effect.gen(function* () {
      const tmp = yield* bootstrapFixture

      yield* Effect.promise(() => cliBootstrap(tmp.directory, async () => "ok"))

      expect(existsSync(tmp.marker)).toBe(true)
    }),
  ),
)

it.live("CLI bootstrap disposes the instance when the callback rejects", () =>
  withTrustedProjectPlugins(
    Effect.gen(function* () {
      const tmp = yield* bootstrapFixture
      const disposed = yield* waitDisposed(tmp.directory).pipe(Effect.forkScoped)

      const exit = yield* Effect.promise(() =>
        cliBootstrap(tmp.directory, async () => Promise.reject(new Error("boom"))),
      ).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toMatchObject({ message: "boom" })
      yield* Fiber.join(disposed)
    }),
  ),
)

it.live("InstanceStore.reload runs InstanceBootstrap", () =>
  withTrustedProjectPlugins(
    Effect.gen(function* () {
      const tmp = yield* bootstrapFixture
      const store = yield* InstanceStore.Service

      yield* store.reload({ directory: tmp.directory })

      expect(existsSync(tmp.marker)).toBe(true)
    }),
  ),
)
