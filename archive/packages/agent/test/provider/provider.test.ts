import { describe, expect, test } from "bun:test"
import { Auth } from "@/auth"
import { Provider, ProviderID } from "@/provider/provider"
import { Effect, Layer } from "effect"

const authLayer = (model?: string) =>
  Layer.mock(Auth.Service)({
    get: () =>
      Effect.succeed(
        model
          ? {
              type: "api" as const,
              key: "test-key",
              metadata: {
                model,
              },
            }
          : undefined,
      ),
    all: () => Effect.succeed({}),
    set: () => Effect.void,
    remove: () => Effect.void,
  })

const runProvider = <A>(effect: Effect.Effect<A, never, Provider.Service>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Provider.layer), Effect.provide(authLayer())))

const runProviderWithStoredModel = <A>(model: string, effect: Effect.Effect<A, never, Provider.Service>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Provider.layer), Effect.provide(authLayer(model))))

describe("MiMo provider catalog", () => {
  test("exposes only MiMo V2.5 and MiMo V2.5 Pro", async () => {
    const provider = await runProvider(Provider.Service.use((service) => service.getProvider(ProviderID.make("mimo"))))

    expect(Object.keys(provider.models).sort()).toEqual(["mimo-v2.5", "mimo-v2.5-pro"])
  })

  test("marks MiMo V2.5 Pro as text-only input while MiMo V2.5 stays multimodal", async () => {
    const provider = await runProvider(Provider.Service.use((service) => service.getProvider(ProviderID.make("mimo"))))

    expect(provider.models["mimo-v2.5"]?.capabilities.input).toEqual({
      text: true,
      audio: true,
      image: true,
      video: true,
      pdf: false,
    })
    expect(provider.models["mimo-v2.5-pro"]?.capabilities.input).toEqual({
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    })
    expect(provider.models["mimo-v2.5-pro"]?.capabilities.attachment).toBe(true)
  })

  test("marks both MiMo V2.5 models as supporting reasoning", async () => {
    const provider = await runProvider(Provider.Service.use((service) => service.getProvider(ProviderID.make("mimo"))))

    expect(provider.models["mimo-v2.5"]?.capabilities.reasoning).toBe(true)
    expect(provider.models["mimo-v2.5-pro"]?.capabilities.reasoning).toBe(true)
  })

  test("uses official 128K output limit for MiMo V2.5 models", async () => {
    const provider = await runProvider(Provider.Service.use((service) => service.getProvider(ProviderID.make("mimo"))))

    expect(provider.models["mimo-v2.5"]?.limit.output).toBe(128_000)
    expect(provider.models["mimo-v2.5-pro"]?.limit.output).toBe(128_000)
  })

  test("falls back removed persisted MiMo models to the default model", async () => {
    const result = await runProviderWithStoredModel(
      "mimo-v2-pro",
      Effect.gen(function* () {
        const service = yield* Provider.Service
        const provider = yield* service.getProvider(ProviderID.make("mimo"))
        const defaults = yield* service.defaultModel()
        return { provider, defaults }
      }),
    )

    expect(result.provider.options.model).toBe("mimo-v2.5")
    expect(result.defaults).toEqual({
      providerID: ProviderID.make("mimo"),
      modelID: Provider.ModelID.make("mimo-v2.5"),
    })
  })
})
