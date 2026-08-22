/**
 * Mio's client UI plugin, browser half.
 *
 * Two things live here, both on slots dsh declares for exactly this purpose.
 *
 * **Brand.** `dsh-client-ui-brand-official`'s own README says "alternative
 * presentation belongs in another Cordis package occupying the same slots", so
 * Mio occupies them and `mio.patch.yml` disables the official row. Nothing in
 * the prebuilt `dsh-web-frontend` dist is patched.
 *
 * **First run.** dsh's onboarding coordinator is reused; only its steps are
 * Mio's. One retires DeepSeek's beta notice, the other connects a MiMo account
 * — which a fresh install otherwise has no in-app way to do, since dsh's only
 * credential step is hard-wired to the `deepseek-official` route.
 *
 * The brand registrations nest through `slots.inject()` as one
 * declaration-aware set, mirroring the official plugin: the package then works
 * whether its row activates before or after the sidebar and conversation
 * declarers, withdraws every occupant when either declaration collapses, and
 * never leaves a partial brand mix behind during HMR.
 */
import { useCallback, useEffect, useRef } from "react"
import { MioBrandMark, MioBrandName } from "./Brand.tsx"
import { MioConnect, type ConnectApi } from "./Connect.tsx"
import { MIO_LOCALES, MIO_NS } from "./locale.ts"

/**
 * Services this half needs. `slots` carries the registrations, `connection`
 * carries the wire API the connect step reads and writes through, and `locale`
 * carries the string tables the framework `t` seat resolves against.
 */
export const inject = ["slots", "connection", "locale"]

/**
 * Retire one of dsh's own onboarding steps by occupying its cell and completing
 * at once.
 *
 * Two steps need this, for the same reason and with different content:
 *
 * - `welcome-notice` announces that *DeepSeek Harness 0.1* is in testing for
 *   *Harness developers* and invites them into the DSH plugin ecosystem.
 *   Correct for dsh, wrong product and wrong audience here — and it survives
 *   disabling `llm-deepseek`, because its only gate is a settings version flag.
 * - `deepseek-official` asks for a **DeepSeek** API key. Mio ships DeepSeek as a
 *   fully supported provider and it configures normally on the Models page; what
 *   it must not do is open a first run of Mio by asking for a key to a provider
 *   the user did not come here for. Reading `onboardingReadiness` suggests this
 *   step self-completes when DeepSeek is unconfigured — driving it proves the
 *   opposite: with no key stored it renders and waits.
 *
 * Completing immediately is the step contract rather than a way around it: a
 * step receives `complete` and may render null, which is what dsh's own notice
 * does while it decides not to show. The ref guard and the braced effect body
 * both matter: the coordinator recreates `complete` inline on every render, and
 * an unbraced arrow would hand `complete()`'s return value to React as a
 * cleanup function. This is the shape dsh's own `WelcomeNotice` uses.
 */
function MioSkipStep({ complete }: { complete: () => void }) {
  const finished = useRef(false)
  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    complete()
  }, [complete])
  useEffect(() => {
    finish()
  }, [finish])
  return null
}

interface SlotDescriptor {
  name: string
  id?: string
  order?: number
  priority?: number
  locale?: string
  inject?: () => Record<string, unknown>
}

interface SlotRegistry {
  inject(name: string, body: () => unknown): unknown
  register(descriptor: SlotDescriptor, component: unknown): unknown
}

interface LocaleRuntime {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
}

interface ClientContext {
  slots: SlotRegistry
  connection: { api: ConnectApi }
  locale: LocaleRuntime
}

/**
 * Register Mio's brand occupants and onboarding steps.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.locale.register(MIO_NS, MIO_LOCALES)

  ctx.slots.inject("sidebar.brand.mark", () =>
    ctx.slots.inject("sidebar.brand.name", () =>
      ctx.slots.inject("conversation.hero.brand.mark", function* () {
        yield ctx.slots.register({ name: "sidebar.brand.mark" }, MioBrandMark)
        yield ctx.slots.register({ name: "sidebar.brand.name" }, MioBrandName)
        yield ctx.slots.register({ name: "conversation.hero.brand.mark" }, MioBrandMark)
      }),
    ),
  )

  ctx.slots.inject("settings.onboarding", function* () {
    // Same slot and cell ids as the steps they retire, one step ahead of each in
    // priority. dsh registers those cells at priority 0 and elects the *lowest*
    // priority as the winner — registering at the same one is refused outright
    // with a message naming this exact fix, rather than silently picking one.
    yield ctx.slots.register(
      { name: "settings.onboarding", id: "welcome-notice", order: -100, priority: -1 },
      MioSkipStep,
    )
    yield ctx.slots.register(
      { name: "settings.onboarding", id: "deepseek-official", order: 0, priority: -1 },
      MioSkipStep,
    )
    // Its own cell, sequenced between the two retired steps.
    yield ctx.slots.register(
      {
        name: "settings.onboarding",
        id: "mio-connect",
        order: -50,
        locale: MIO_NS,
        // Props the surface does not supply. `openLink` goes through
        // `window.open`, which the Electron shell already routes to the system
        // browser (`packages/shell/src/window.ts`) and which is an ordinary new
        // tab in a plain browser.
        inject: () => ({
          api: ctx.connection.api,
          openLink: (url: string) => void window.open(url, "_blank", "noopener,noreferrer"),
        }),
      },
      MioConnect,
    )
  })
}
