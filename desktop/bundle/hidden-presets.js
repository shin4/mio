/** Moves a saved default agent preset that Mio hides back to the registry default. */

export const name = "mio-hidden-presets"
export const inject = ["agentPresets", "settings"]

// Kept registered so sessions recorded under them still resume, but hidden from every choosing
// surface by the ui-agent-preset overlay hunk (keep the two lists equal). A profile from 0.4.x may
// still name one as its default, which would keep composing new sessions with a mode the UI no
// longer shows.
const HIDDEN = new Set(["ptc", "minimal"])
const NS = "agent-preset-registry"

/**
 * Reset the saved default once, at startup. The user layer that holds it applies after every
 * bundle, so no patch row can override it; the settings service writes the same field the
 * Settings page does. Hidden presets are off the choosing surfaces, so the choice cannot come back.
 * The write is not awaited: it rewrites the profile tree, which waits for every entry to finish
 * activating, this one included, so awaiting it here deadlocks startup.
 * @param ctx - context carrying `agentPresets` and `settings`.
 */
export function apply(ctx) {
  const saved = ctx.agentPresets.config.selectedDefault.get()
  if (!HIDDEN.has(saved)) return
  const fallback = ctx.agentPresets.config.default
  void ctx.settings.update(NS, { selectedDefault: fallback }).then(
    () => ctx.logger.info("saved default agent preset %C is hidden; reset to %C", saved, fallback),
    (error) => ctx.logger.warn(error),
  )
}
