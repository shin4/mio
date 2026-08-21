import { Context, Effect, Layer } from "effect"
import { Session } from "@/session/session"

// Legacy session-share wrapper. In opencode, this layer wrapped Session.create
// to also publish a share-link entry. In mimo-desktop sharing is gone, so we
// pass through to Session.create directly. Share/unshare are no-ops.

export interface Interface {
  readonly create: (input?: any) => Effect.Effect<any, any>
  readonly share: (sessionID: string) => Effect.Effect<{ url: string }, Error>
  readonly unshare: (sessionID: string) => Effect.Effect<void>
  readonly init: () => Effect.Effect<void>
  readonly noop: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@mimo/SessionShare") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const session = yield* Session.Service
    return Service.of({
      create: (input?: any) =>
        // Delegate to the real Session.create.
        session.create(input) as Effect.Effect<any, any>,
      share: () => Effect.fail(new Error("Session sharing is disabled in mimo-desktop")),
      unshare: () => Effect.void,
      init: () => Effect.void,
      noop: () => Effect.void,
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Session.defaultLayer))

export * as SessionShare from "./session"
