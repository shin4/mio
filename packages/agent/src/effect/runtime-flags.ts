import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("MIO_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@opencode/RuntimeFlags", {
  autoShare: bool("MIO_AUTO_SHARE"),
  pure: bool("MIO_PURE"),
  disableDefaultPlugins: bool("MIO_DISABLE_DEFAULT_PLUGINS"),
  disableChannelDb: bool("MIO_DISABLE_CHANNEL_DB"),
  disableEmbeddedWebUi: bool("MIO_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("MIO_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("MIO_DISABLE_LSP_DOWNLOAD"),
  skipMigrations: bool("MIO_SKIP_MIGRATIONS"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("MIO_DISABLE_CLAUDE_CODE"),
    direct: bool("MIO_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("MIO_DISABLE_CLAUDE_CODE"),
    direct: bool("MIO_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("MIO_ENABLE_EXA"),
    legacy: bool("MIO_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("MIO_ENABLE_PARALLEL"),
    legacy: bool("MIO_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("MIO_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("MIO_ENABLE_QUESTION_TOOL"),
  experimentalScout: enabledByExperimental("MIO_EXPERIMENTAL_SCOUT"),
  experimentalBackgroundSubagents: enabledByExperimental("MIO_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("MIO_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("MIO_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("MIO_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("MIO_EXPERIMENTAL_PLAN_MODE"),
  experimentalEventSystem: enabledByExperimental("MIO_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("MIO_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("MIO_EXPERIMENTAL_ICON_DISCOVERY"),
  acpNext: bool("MIO_ACP_NEXT"),
  outputTokenMax: positiveInteger("MIO_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("MIO_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  // Default true in mimo-desktop: the AI SDK runtime is disabled (Provider.getLanguage
  // intentionally fails), so native is the only working code path. Env var can still
  // force-disable for debugging.
  experimentalNativeLlm: Config.boolean("MIO_EXPERIMENTAL_NATIVE_LLM").pipe(Config.withDefault(true)),
  experimentalWebSockets: bool("MIO_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("MIO_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.defaultLayer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const defaultLayer = Service.defaultLayer.pipe(Layer.orDie)

export * as RuntimeFlags from "./runtime-flags"
