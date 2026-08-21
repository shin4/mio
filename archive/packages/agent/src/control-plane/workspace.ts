import { Context, Effect, Layer } from "effect"

// Stub for legacy Workspace service. mimo-desktop is single-machine so
// this collapses to a no-op. Round 2 will remove this entirely.

export interface Interface {
  readonly noop: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@mimo/Workspace") {}

export const layer = Layer.effect(
  Service,
  Effect.sync(() => Service.of({ noop: () => Effect.void })),
)

export const defaultLayer = layer

export * as Workspace from "./workspace"
