/**
 * Mio's client UI plugin, browser half.
 *
 * Occupies the three brand slots dsh declares. This is the documented way to
 * rebrand: `dsh-client-ui-brand-official`'s own README says "alternative
 * presentation belongs in another Cordis package occupying the same slots".
 * Nothing in the prebuilt `dsh-web-frontend` dist is patched — Mio's row simply
 * replaces the official one, which `mio.patch.yml` disables.
 *
 * The registrations nest through `slots.inject()` as one declaration-aware set,
 * mirroring the official plugin: the package then works whether its row
 * activates before or after the sidebar and conversation declarers, withdraws
 * every occupant when either declaration collapses, and never leaves a partial
 * brand mix behind during HMR.
 */
import { useEffect } from "react"
import { MioBrandMark, MioBrandName } from "./Brand.tsx"

/** Required service: the UI slot registry. */
export const inject = ["slots"]

/**
 * Retire dsh's first-run notice by occupying its cell and completing at once.
 *
 * The notice is not Mio's to show: it announces that *DeepSeek Harness 0.1* is
 * in testing for *Harness developers* and invites them into the DSH plugin
 * ecosystem. Correct for dsh, wrong product and wrong audience here — and it is
 * the one piece of DeepSeek copy that survives disabling `llm-deepseek`,
 * because its only gate is a settings version flag.
 *
 * Completing immediately is the step contract rather than a way around it: an
 * onboarding step receives `complete` and may render null, which is exactly
 * what dsh's own notice does while it decides not to show. Mio's own welcome,
 * if it ever wants one, replaces this body (MIGRATION.md, Phase 3 Stage 3).
 */
function MioSkipWelcome({ complete }: { complete: () => void }) {
  useEffect(() => complete(), [complete])
  return null
}

interface SlotRegistry {
  inject(name: string, body: () => unknown): unknown
  register(descriptor: { name: string; id?: string; order?: number; priority?: number }, component: unknown): unknown
}

/**
 * Fill every brand slot as one declaration-aware registration set.
 * @param ctx - client root context.
 */
export function apply(ctx: { slots: SlotRegistry }): void {
  ctx.slots.inject("sidebar.brand.mark", () =>
    ctx.slots.inject("sidebar.brand.name", () =>
      ctx.slots.inject("conversation.hero.brand.mark", function* () {
        yield ctx.slots.register({ name: "sidebar.brand.mark" }, MioBrandMark)
        yield ctx.slots.register({ name: "sidebar.brand.name" }, MioBrandName)
        yield ctx.slots.register({ name: "conversation.hero.brand.mark" }, MioBrandMark)
      }),
    ),
  )

  // Same slot and cell id as the notice it retires, one step ahead of it in
  // priority. dsh registers that cell at priority 0 and elects the *lowest*
  // priority as the winner — registering at the same one is refused outright
  // with a message naming this exact fix, rather than silently picking one.
  ctx.slots.inject("settings.onboarding", () =>
    ctx.slots.register(
      { name: "settings.onboarding", id: "welcome-notice", order: -100, priority: -1 },
      MioSkipWelcome,
    ),
  )
}
