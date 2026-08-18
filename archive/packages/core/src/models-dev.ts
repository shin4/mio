import { Context, Effect, Layer, Schema } from "effect"
import { EventV2 } from "./event"

// mimo-desktop replaces the dynamic models.dev catalog with a static, in-process
// MiMo catalog. This module is preserved as a no-op service so existing
// consumers (server handlers, app-runtime) can resolve their imports without
// changes. Round 4 will rewire them to read from mimo-catalog directly.

export const CatalogModelStatus = Schema.Literals(["alpha", "beta", "deprecated"])
export type CatalogModelStatus = typeof CatalogModelStatus.Type

const CostTier = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache_read: Schema.optional(Schema.Finite),
  cache_write: Schema.optional(Schema.Finite),
  tier: Schema.Struct({
    type: Schema.Literal("context"),
    size: Schema.Finite,
  }),
})

const Cost = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache_read: Schema.optional(Schema.Finite),
  cache_write: Schema.optional(Schema.Finite),
  tiers: Schema.optional(Schema.Array(CostTier)),
  context_over_200k: Schema.optional(
    Schema.Struct({
      input: Schema.Finite,
      output: Schema.Finite,
      cache_read: Schema.optional(Schema.Finite),
      cache_write: Schema.optional(Schema.Finite),
    }),
  ),
})

export const Model = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  family: Schema.optional(Schema.String),
  release_date: Schema.String,
  attachment: Schema.Boolean,
  reasoning: Schema.Boolean,
  temperature: Schema.Boolean,
  tool_call: Schema.Boolean,
  interleaved: Schema.optional(
    Schema.Union([
      Schema.Literal(true),
      Schema.Struct({
        field: Schema.Literals(["reasoning_content", "reasoning_details"]),
      }),
    ]),
  ),
  modalities: Schema.optional(
    Schema.Struct({
      input: Schema.Array(Schema.Literals(["text", "image", "audio", "video", "pdf"])),
      output: Schema.Array(Schema.Literals(["text", "image", "audio", "video", "pdf"])),
    }),
  ),
  status: Schema.optional(Schema.Literals(["alpha", "beta", "deprecated", "active"])),
  cost: Schema.optional(Cost),
  limit: Schema.Struct({
    context: Schema.Finite,
    input: Schema.optional(Schema.Finite),
    output: Schema.Finite,
  }),
  experimental: Schema.optional(
    Schema.Struct({
      modes: Schema.optional(
        Schema.Record(
          Schema.String,
          Schema.Struct({
            provider: Schema.optional(
              Schema.Struct({
                headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
                body: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
              }),
            ),
          }),
        ),
      ),
    }),
  ),
  provider: Schema.optional(
    Schema.Struct({
      api: Schema.optional(Schema.String),
      npm: Schema.optional(Schema.String),
    }),
  ),
})

export type Model = Schema.Schema.Type<typeof Model>

export const Provider = Schema.Struct({
  name: Schema.String,
  api: Schema.optional(Schema.String),
  doc: Schema.optional(Schema.String),
  env: Schema.Array(Schema.String),
  id: Schema.String,
  npm: Schema.optional(Schema.String),
  models: Schema.Record(Schema.String, Model),
})

export type Provider = Schema.Schema.Type<typeof Provider>

export const Event = {
  Refreshed: EventV2.define({
    type: "models-dev.refreshed",
    schema: {},
  }),
}

export interface Interface {
  readonly get: () => Effect.Effect<Record<string, Provider>>
  readonly refresh: (force?: boolean) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ModelsDev") {}

// Empty catalog: callers should query the static MiMo catalog directly.
// Returning an empty record here keeps existing HTTP API responses well-formed
// (they iterate the record) while making it clear that the dynamic source is
// disabled.
export const layer = Layer.effect(
  Service,
  Effect.sync(() =>
    Service.of({
      get: () => Effect.succeed({}),
      refresh: () => Effect.void,
    }),
  ),
)

export const defaultLayer = layer

export * as ModelsDev from "./models-dev"
