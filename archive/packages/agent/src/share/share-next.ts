import { Context, Effect, Layer } from "effect"

// Stub for the legacy share-next service. mimo-desktop has no share-link
// support, but the bootstrap loop iterates `.init()` over many services so
// the method is preserved as a no-op.

export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly noop: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@mimo/ShareNext") {}

export const layer = Layer.effect(
  Service,
  Effect.sync(() =>
    Service.of({
      init: () => Effect.void,
      noop: () => Effect.void,
    }),
  ),
)

export const defaultLayer = layer

export * as ShareNext from "./share-next"
