/**
 * MiMo connection form — presentation-agnostic.
 *
 * Holds all connection state, validation, and persistence (serverSDK.client.auth.set
 * with metadata for billing/region/protocol/model). Rendered by both the settings
 * dialog (settings-mimo.tsx) and the first-launch onboarding screen
 * (onboarding/onboarding-screen.tsx).
 *
 * Persistence layout in ~/.local/share/mimo/auth.json (0o600):
 *   { "mimo": { "type": "api", "key": "sk-…",
 *               "metadata": { billing, region, protocol, model, contextWindow } } }
 */
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { showToast } from "@opencode-ai/ui/toast"
import { Tag } from "@opencode-ai/ui/tag"
import { Component, createMemo, createSignal, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useProviders } from "@/hooks/use-providers"

export type MimoProtocol = "openai" | "anthropic"
export type MimoModel = "mimo-v2.5" | "mimo-v2.5-pro"
export type MimoBilling = "pay-as-you-go" | "token-plan"
export type MimoRegion = "cn" | "sgp" | "ams"

const PROVIDER_ID = "mimo"
export const MIO_PLATFORM_URL = "https://platform.xiaomimimo.com"

// Context window budget is fixed at the 1M maximum; the selector was removed from the UI.
const CONTEXT_WINDOW = 1_048_576

type Prices = { input: number; output: number }
type ModelOption = {
  label: string
  value: MimoModel
  blurbKey: "v25" | "v25Pro"
  USD: Prices
  RMB: Prices
}
const MODEL_OPTIONS: ModelOption[] = [
  {
    label: "MiMo V2.5",
    value: "mimo-v2.5",
    blurbKey: "v25",
    USD: { input: 0.14, output: 0.28 },
    RMB: { input: 1.0, output: 2.0 },
  },
  {
    label: "MiMo V2.5 Pro",
    value: "mimo-v2.5-pro",
    blurbKey: "v25Pro",
    USD: { input: 0.435, output: 0.87 },
    RMB: { input: 3.0, output: 6.0 },
  },
]

const BILLING_VALUES: { value: MimoBilling; labelKey: "payAsYouGo" | "tokenPlan"; keyPrefix: string }[] = [
  { value: "pay-as-you-go", labelKey: "payAsYouGo", keyPrefix: "sk-" },
  { value: "token-plan", labelKey: "tokenPlan", keyPrefix: "tp-" },
]

const REGION_VALUES: { value: MimoRegion }[] = [{ value: "cn" }, { value: "sgp" }, { value: "ams" }]

function currencyFor(billing: MimoBilling, region: MimoRegion): "USD" | "RMB" {
  if (billing === "token-plan" && region === "cn") return "RMB"
  return "USD"
}

function formatPrice(currency: "USD" | "RMB", value: number): string {
  if (currency === "USD") return `$${value.toFixed(value < 1 ? 3 : 2)}`
  return `¥${value.toFixed(2)}`
}

function isMimoModel(v: unknown): v is MimoModel {
  return typeof v === "string" && MODEL_OPTIONS.some((o) => o.value === v)
}

export type MimoConnectFormProps = {
  /** "dialog" renders the settings header + scroll cap; "onboarding" renders fields only. */
  variant: "dialog" | "onboarding"
  /** Called after a successful save AND disconnect. Dialog passes dialog.close(); onboarding omits it (the gate auto-dismisses on the reactive `connected` change). */
  onDone?: () => void
}

export const MimoConnectForm: Component<MimoConnectFormProps> = (props) => {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const providers = useProviders()
  const platform = usePlatform()

  const t = language.t

  const current = createMemo(() => providers.all().get(PROVIDER_ID))
  const currentOpts = createMemo(() => (current()?.options ?? {}) as Record<string, unknown>)
  const isConnected = createMemo(() => Boolean(current()?.key))

  const initialBilling: MimoBilling =
    currentOpts().billing === "token-plan" ? "token-plan" : "pay-as-you-go"
  const savedRegion = currentOpts().region
  // Unconfigured users (onboarding, or a disconnected provider) default to CN,
  // ignoring the server's placeholder "sgp" for keyless providers. A connected
  // user keeps their saved region.
  const initialRegion: MimoRegion =
    current()?.key && (savedRegion === "sgp" || savedRegion === "ams") ? savedRegion : "cn"
  const initialProtocol: MimoProtocol = currentOpts().protocol === "anthropic" ? "anthropic" : "openai"
  const storedModel = currentOpts().model
  const initialModel: MimoModel = isMimoModel(storedModel) ? storedModel : "mimo-v2.5"

  const [apiKey, setApiKey] = createSignal(current()?.key ?? "")
  const [protocol, setProtocol] = createSignal<MimoProtocol>(initialProtocol)
  const [model, setModel] = createSignal<MimoModel>(initialModel)
  const [billing, setBilling] = createSignal<MimoBilling>(initialBilling)
  const [region, setRegion] = createSignal<MimoRegion>(initialRegion)
  const [showKey, setShowKey] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [disconnecting, setDisconnecting] = createSignal(false)

  const placeholder = createMemo(() => (billing() === "token-plan" ? "tp-..." : "sk-..."))
  const expectedPrefix = createMemo(() => (billing() === "token-plan" ? "tp-" : "sk-"))
  const billingLabel = (v: MimoBilling) =>
    t(v === "token-plan" ? "provider.mimo.billing.tokenPlan.label" : "provider.mimo.billing.payAsYouGo.label")
  const keyWarning = createMemo(() => {
    const key = apiKey().trim()
    if (!key) return undefined
    if (!key.startsWith(expectedPrefix())) {
      return t("provider.mimo.apiKey.warning", {
        prefix: expectedPrefix(),
        billing: billingLabel(billing()),
      })
    }
    return undefined
  })

  const save = async () => {
    const key = apiKey().trim()
    if (!key || saving()) return
    setSaving(true)
    try {
      await serverSDK.client.auth.set({
        providerID: PROVIDER_ID,
        auth: {
          type: "api",
          key,
          metadata: {
            billing: billing(),
            region: region(),
            protocol: protocol(),
            model: model(),
            contextWindow: String(CONTEXT_WINDOW),
          },
        },
      })
      await serverSDK.client.global.dispose()
      props.onDone?.()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: t("provider.connect.toast.connected.title", { provider: "MiMo" }),
        description: t("provider.connect.toast.connected.description", { provider: "MiMo" }),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: t("common.requestFailed"), description: message })
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    if (disconnecting()) return
    setDisconnecting(true)
    try {
      await serverSDK.client.auth.remove({ providerID: PROVIDER_ID })
      await serverSDK.client.global.dispose()
      props.onDone?.()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: t("provider.disconnect.toast.disconnected.title", { provider: "MiMo" }),
        description: t("provider.disconnect.toast.disconnected.description", { provider: "MiMo" }),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: t("common.requestFailed"), description: message })
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div
      class="flex flex-col gap-6"
      classList={{ "px-2.5 pb-3 overflow-y-auto max-h-[70vh]": props.variant === "dialog" }}
    >
      <Show when={props.variant === "dialog"}>
        <div class="px-2.5 flex gap-4 items-center">
          <ProviderIcon id={PROVIDER_ID} class="size-5 shrink-0 icon-strong-base" />
          <div class="text-16-medium text-text-strong">{t("provider.connect.title", { provider: "MiMo" })}</div>
        </div>
      </Show>

      <div class="px-2.5 flex flex-col gap-5">
        <Show when={props.variant === "dialog"}>
          <p class="text-12-regular text-text-weak">
            {t("provider.mimo.dialog.description")}
            <a
              href={MIO_PLATFORM_URL}
              class="text-text-interactive-base ml-1"
              onClick={(event) => {
                event.preventDefault()
                platform.openLink(MIO_PLATFORM_URL)
              }}
            >
              {t("provider.mimo.dialog.getKey")}
            </a>
          </p>
        </Show>

        {/* Billing type */}
        <div>
          <span class="text-12-regular text-text-weak block mb-1.5">{t("provider.mimo.billing.label")}</span>
          <div class="flex flex-col gap-2">
            {BILLING_VALUES.map((opt) => (
              <button
                type="button"
                onClick={() => setBilling(opt.value)}
                class="text-left p-2.5 rounded border transition-colors"
                classList={{
                  "border-border-focused bg-surface-raised-base": billing() === opt.value,
                  "border-border-base hover:bg-surface-raised-base": billing() !== opt.value,
                }}
              >
                <div class="text-14-regular text-text-base flex items-center gap-2">
                  <span>{t(`provider.mimo.billing.${opt.labelKey}.label` as const)}</span>
                  <code class="text-12-regular text-text-weak">{opt.keyPrefix}xxxx</code>
                </div>
                <div class="text-12-regular text-text-weak mt-0.5">
                  {t(`provider.mimo.billing.${opt.labelKey}.desc` as const)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Region (only for token-plan) */}
        <Show when={billing() === "token-plan"}>
          <div>
            <span class="text-12-regular text-text-weak block mb-1.5">{t("provider.mimo.region.label")}</span>
            <div class="flex gap-2">
              {REGION_VALUES.map((opt) => (
                <button
                  type="button"
                  onClick={() => setRegion(opt.value)}
                  title={t(`provider.mimo.region.${opt.value}.desc` as const)}
                  class="flex-1 text-12-regular py-1.5 rounded border transition-colors"
                  classList={{
                    "border-border-focused bg-surface-raised-base text-text-base": region() === opt.value,
                    "border-border-base text-text-weak hover:bg-surface-raised-base": region() !== opt.value,
                  }}
                >
                  {t(`provider.mimo.region.${opt.value}.label` as const)}
                </button>
              ))}
            </div>
          </div>
        </Show>

        {/* API Key */}
        <div>
          <span class="text-12-regular text-text-weak block mb-1.5">{t("provider.mimo.apiKey.label")}</span>
          <div class="flex gap-2">
            <input
              type={showKey() ? "text" : "password"}
              value={apiKey()}
              onInput={(e) => setApiKey(e.currentTarget.value)}
              placeholder={placeholder()}
              class="flex-1 text-14-regular bg-surface-raised-base border border-border-base rounded px-3 py-1.5 focus:outline-none focus:border-border-focused"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey())}
              class="px-2 py-1.5 text-12-regular text-text-weak border border-border-base rounded hover:bg-surface-raised-base"
            >
              {showKey() ? t("provider.mimo.apiKey.hide") : t("provider.mimo.apiKey.show")}
            </button>
          </div>
          <Show when={keyWarning()}>
            <p class="text-12-regular text-text-warning mt-1">{keyWarning()}</p>
          </Show>
        </div>

        {/* Protocol */}
        <div>
          <span class="text-12-regular text-text-weak block mb-1.5">{t("provider.mimo.protocol.label")}</span>
          <div class="flex gap-2">
            {(["openai", "anthropic"] as MimoProtocol[]).map((p) => (
              <button
                type="button"
                onClick={() => setProtocol(p)}
                class="flex-1 text-12-regular py-1.5 rounded border transition-colors"
                classList={{
                  "border-border-focused bg-surface-raised-base text-text-base": protocol() === p,
                  "border-border-base text-text-weak hover:bg-surface-raised-base": protocol() !== p,
                }}
              >
                <span class="inline-flex items-center justify-center gap-1.5">
                  {p === "openai" ? t("provider.mimo.protocol.openai") : t("provider.mimo.protocol.anthropic")}
                  <Show when={p === "openai"}>
                    <Tag>{t("dialog.provider.tag.recommended")}</Tag>
                  </Show>
                </span>
              </button>
            ))}
          </div>
          <p class="text-12-regular text-text-weaker mt-1">
            {protocol() === "openai"
              ? t("provider.mimo.protocol.openai.hint")
              : t("provider.mimo.protocol.anthropic.hint")}
          </p>
        </div>

        {/* Model selection */}
        <div>
          <span class="text-12-regular text-text-weak block mb-2">
            {t("provider.mimo.model.label")}
            <span class="text-text-weaker ml-1">
              {t("provider.mimo.model.pricing", {
                currency: currencyFor(billing(), region()) === "RMB" ? "RMB ¥" : "USD $",
              })}
            </span>
          </span>
          <div class="flex flex-col gap-2">
            {MODEL_OPTIONS.map((opt) => {
              const cur = () => currencyFor(billing(), region())
              const prices = () => opt[cur()]
              return (
                <button
                  type="button"
                  onClick={() => setModel(opt.value)}
                  class="text-left p-3 rounded border transition-colors"
                  classList={{
                    "border-border-focused bg-surface-raised-base": model() === opt.value,
                    "border-border-base hover:bg-surface-raised-base": model() !== opt.value,
                  }}
                >
                  <div class="flex items-baseline justify-between gap-2">
                    <div class="text-14-regular text-text-base">{opt.label}</div>
                    <div class="text-12-regular text-text-weak tabular-nums">
                      {formatPrice(cur(), prices().input)} {t("provider.mimo.model.in")} /{" "}
                      {formatPrice(cur(), prices().output)} {t("provider.mimo.model.out")}
                    </div>
                  </div>
                  <div class="text-12-regular text-text-weak mt-0.5">
                    {t(`provider.mimo.model.blurb.${opt.blurbKey}` as const)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div class="flex items-center justify-between gap-3 pt-2">
          <Show when={isConnected()}>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={disconnecting()}
              class="text-14-regular text-text-weak hover:text-text-base transition-colors disabled:opacity-50"
            >
              {disconnecting() ? t("provider.mimo.disconnecting") : t("common.disconnect")}
            </button>
          </Show>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!apiKey().trim() || saving()}
            class="ml-auto py-2 px-4 rounded text-14-medium transition-colors"
            classList={{
              "bg-surface-raised-stronger-non-alpha text-text-base hover:bg-surface-raised-base":
                !!apiKey().trim() && !saving(),
              "bg-surface-raised-base text-text-weaker cursor-not-allowed": !apiKey().trim() || saving(),
            }}
          >
            {saving() ? t("provider.mimo.saving") : isConnected() ? t("provider.mimo.save") : t("common.connect")}
          </button>
        </div>
      </div>
    </div>
  )
}
