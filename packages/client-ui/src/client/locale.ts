/**
 * Mio's onboarding copy.
 *
 * dsh ships exactly two locales and `locale.register` takes both together, so
 * these tables are the whole translation surface — there is no third language
 * to fall back to and no partial namespace to ship.
 *
 * The wording is carried over from the archived Solid onboarding
 * (`archive/packages/app/src/i18n/{en,zh}.ts`) with one correction: those
 * strings predate the product rename and say "Welcome to MiMo". **Mio** is the
 * product; **MiMo** is the model family and the platform that issues the key,
 * so the two are now spelled apart rather than used interchangeably.
 */

export const MIO_NS = "mio.onboarding"

const en = {
  "welcome.title": "Welcome to Mio",
  "welcome.subtitle": "A coding agent powered by MiMo models.",
  "welcome.body": "To get started, connect a MiMo account. You'll need an API key from the MiMo platform.",
  "welcome.getKey": "Get an API key",
  "welcome.continue": "I already have a key",
  "connect.title": "Connect MiMo",
  "connect.subtitle": "Your key is stored by the harness, never in a configuration file.",
  "connect.keyLabel": "API key",
  "connect.keyPlaceholder": "sk-… or tp-…",
  "connect.regionLabel": "Token-plan region",
  "connect.regionHint": "Your key begins with tp-, so it belongs to a token plan. Pick the region it was issued for.",
  "connect.region.cn": "China",
  "connect.region.sgp": "Singapore",
  "connect.region.ams": "Amsterdam",
  "connect.submit": "Connect",
  "connect.submitting": "Checking…",
  "connect.back": "Back",
  "connect.later": "Set this up later",
  "error.rejected": "MiMo rejected this key. Check that it was copied whole, and that the region matches the plan it was issued for.",
  "error.unreachable": "Could not reach MiMo to check the key. Check your connection and try again.",
  "error.store": "The key checked out, but storing it failed: {message}",
  "error.endpoint": "The key checked out and was stored, but recording the endpoint failed: {message}",
} as const

const zh: Record<keyof typeof en, string> = {
  "welcome.title": "欢迎使用 Mio",
  "welcome.subtitle": "由 MiMo 模型驱动的编程助手。",
  "welcome.body": "开始之前，请连接 MiMo 账户。你需要在 MiMo 平台获取一个 API Key。",
  "welcome.getKey": "获取 API Key",
  "welcome.continue": "我已有 API Key",
  "connect.title": "连接 MiMo",
  "connect.subtitle": "密钥由 Harness 保管，不会写入配置文件。",
  "connect.keyLabel": "API Key",
  "connect.keyPlaceholder": "sk-… 或 tp-…",
  "connect.regionLabel": "套餐区域",
  "connect.regionHint": "你的 Key 以 tp- 开头，属于套餐计费。请选择它所属的区域。",
  "connect.region.cn": "中国",
  "connect.region.sgp": "新加坡",
  "connect.region.ams": "阿姆斯特丹",
  "connect.submit": "连接",
  "connect.submitting": "校验中…",
  "connect.back": "返回",
  "connect.later": "稍后配置",
  "error.rejected": "MiMo 拒绝了这个 Key。请确认复制完整，且区域与开通套餐的区域一致。",
  "error.unreachable": "无法连接 MiMo 校验此 Key。请检查网络后重试。",
  "error.store": "Key 校验通过，但保存失败：{message}",
  "error.endpoint": "Key 校验通过并已保存，但记录接入地址失败：{message}",
}

/** Both locales, in the shape `locale.register(ns, …)` takes. */
export const MIO_LOCALES = { en, zh }

export type MioMessageKey = keyof typeof en
