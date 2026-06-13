import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { HttpClient } from "effect/unstable/http"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import path from "path"
import { Config } from "@/config/config"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { EffectFlock } from "@opencode-ai/core/util/effect-flock"
import { Env } from "../../src/env"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"

const infra = CrossSpawnSpawner.defaultLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
)

const unexpectedHttp = HttpClient.make((request) =>
  Effect.die(`unexpected http request: ${request.method} ${request.url}`),
)

const layer = Config.layer.pipe(
  Layer.provide(EffectFlock.defaultLayer),
  Layer.provide(Env.defaultLayer),
  Layer.provide(AuthTest.empty),
  Layer.provide(AccountTest.empty),
  Layer.provideMerge(infra),
  Layer.provide(NpmTest.noop),
  Layer.provide(Layer.succeed(HttpClient.HttpClient, unexpectedHttp)),
  Layer.provideMerge(AppFileSystem.defaultLayer),
)

const it = testEffect(layer)

const write = (file: string, config: object) =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* AppFileSystem.use.writeWithDirs(path.join(test.directory, file), JSON.stringify(config))
  })

it.instance("reads legacy .mimo/mimo.json project config", () =>
  Effect.gen(function* () {
    yield* write(path.join(".mimo", "mimo.json"), { username: "legacyuser" })
    const config = yield* Config.use.get()
    expect(config.username).toBe("legacyuser")
  }),
)

it.instance("reads legacy root-level mimo.json", () =>
  Effect.gen(function* () {
    yield* write("mimo.json", { username: "legacyroot" })
    const config = yield* Config.use.get()
    expect(config.username).toBe("legacyroot")
  }),
)

it.instance("mio config wins over legacy mimo config", () =>
  Effect.gen(function* () {
    yield* write("mimo.json", { username: "legacyroot" })
    yield* write("mio.json", { username: "newuser" })
    const config = yield* Config.use.get()
    expect(config.username).toBe("newuser")
  }),
)

it.instance(".mio dir config wins over legacy .mimo dir config", () =>
  Effect.gen(function* () {
    yield* write(path.join(".mimo", "mimo.json"), { username: "legacyuser" })
    yield* write(path.join(".mio", "mio.json"), { username: "newuser" })
    const config = yield* Config.use.get()
    expect(config.username).toBe("newuser")
  }),
)
