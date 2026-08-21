import { Context, Effect, Layer, Schema } from "effect"
import { BusEvent } from "@/bus/bus-event"

// Stub for the legacy in-app auto-updater.
// mimo-desktop uses Electron's built-in auto-update flow, so this service
// becomes a no-op. Public methods preserve the legacy signatures so the
// global HTTP API handlers keep compiling.

export const isLocal = () => true

export type InstallationMethod = "unknown" | "manual" | "homebrew" | "npm" | "binary"

export interface Interface {
  readonly method: () => Effect.Effect<InstallationMethod>
  readonly latest: (method?: InstallationMethod) => Effect.Effect<string>
  readonly upgrade: (method: InstallationMethod, target?: string) => Effect.Effect<void, Error>
  readonly check: () => Effect.Effect<{ version: string | undefined }>
  readonly update: (target: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@mimo/Installation") {}

export const Event = {
  Updated: BusEvent.define(
    "installation.updated",
    Schema.Struct({
      type: Schema.Literal("installation.updated"),
      properties: Schema.Struct({ version: Schema.String }),
    }),
  ),
}

export const layer = Layer.effect(
  Service,
  Effect.sync(() =>
    Service.of({
      method: () => Effect.succeed("unknown" as const),
      latest: () => Effect.succeed(""),
      upgrade: () => Effect.fail(new Error("Installation upgrade disabled in mimo-desktop")),
      check: () => Effect.succeed({ version: undefined }),
      update: () => Effect.void,
    }),
  ),
)

export const defaultLayer = layer

export * as Installation from "./index"
