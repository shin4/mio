import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("MIMO_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@opencode/RuntimeFlags", {
  autoShare: bool("MIMO_AUTO_SHARE"),
  pure: bool("MIMO_PURE"),
  disableDefaultPlugins: bool("MIMO_DISABLE_DEFAULT_PLUGINS"),
  trustProjectPlugins: bool("MIMO_TRUST_PROJECT_PLUGINS"),
  disableChannelDb: bool("MIMO_DISABLE_CHANNEL_DB"),
  disableEmbeddedWebUi: bool("MIMO_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("MIMO_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("MIMO_DISABLE_LSP_DOWNLOAD"),
  skipMigrations: bool("MIMO_SKIP_MIGRATIONS"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("MIMO_DISABLE_CLAUDE_CODE"),
    direct: bool("MIMO_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("MIMO_DISABLE_CLAUDE_CODE"),
    direct: bool("MIMO_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("MIMO_ENABLE_EXA"),
    legacy: bool("MIMO_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("MIMO_ENABLE_PARALLEL"),
    legacy: bool("MIMO_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("MIMO_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("MIMO_ENABLE_QUESTION_TOOL"),
  experimentalScout: enabledByExperimental("MIMO_EXPERIMENTAL_SCOUT"),
  experimentalBackgroundSubagents: enabledByExperimental("MIMO_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("MIMO_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("MIMO_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("MIMO_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("MIMO_EXPERIMENTAL_PLAN_MODE"),
  experimentalEventSystem: enabledByExperimental("MIMO_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("MIMO_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("MIMO_EXPERIMENTAL_ICON_DISCOVERY"),
  acpNext: bool("MIMO_ACP_NEXT"),
  outputTokenMax: positiveInteger("MIMO_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("MIMO_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  // Default true in mimo-desktop: the AI SDK runtime is disabled (Provider.getLanguage
  // intentionally fails), so native is the only working code path. Env var can still
  // force-disable for debugging.
  experimentalNativeLlm: Config.boolean("MIMO_EXPERIMENTAL_NATIVE_LLM").pipe(Config.withDefault(true)),
  experimentalWebSockets: bool("MIMO_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("MIMO_CLIENT").pipe(Config.withDefault("cli")),
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
