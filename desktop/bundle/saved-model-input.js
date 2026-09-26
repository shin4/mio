/** Restores bundle-declared model input modalities missing from a saved provider model list. */

export const name = "mio-saved-model-input"
export const inject = ["settings"]

const NS = "llm-pi-ai"

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Path ops that copy `input` from the bundle's model row onto each saved row of the same id that
 * has none. A row that states its own `input` is the user's choice and stays as it is.
 * @param base - the section every bundle layer composes.
 * @param user - the section the user layer holds.
 * @returns ordered `set` ops, empty when nothing is missing.
 */
export function missingInputOps(base, user) {
  const providers = record(user?.providers) ? user.providers : {}
  return Object.entries(providers).flatMap(([provider, saved]) => {
    const declared = base?.providers?.[provider]?.models
    if (!record(saved) || !Array.isArray(saved.models) || !Array.isArray(declared)) return []
    return saved.models.flatMap((model, index) => {
      if (!record(model) || model.input !== undefined) return []
      const input = declared.find((row) => record(row) && row.id === model.id)?.input
      if (!Array.isArray(input)) return []
      return [{ op: "set", path: ["providers", provider, "models", String(index), "input"], value: input }]
    })
  })
}

/**
 * Any Settings write to `llm-pi-ai` (the welcome's endpoint write, a Models page save) stores the
 * whole provider table in the user layer, which applies after every bundle. A profile saved before
 * a bundle declared `input` on a model keeps that model text-only, and the composer refuses images.
 * The section is checked whenever its document changes, since `llm-pi-ai` may activate after this
 * entry; the repair is idempotent. Writes are not awaited, as in hidden-presets.js: they rewrite
 * the profile tree, which waits for every entry to finish activating.
 * @param ctx - context carrying `settings`.
 */
export function apply(ctx) {
  let writing = false
  const repair = () => {
    if (writing) return
    const section = ctx.settings.describe().find((row) => row.ns === NS)
    if (section === undefined) return
    const ops = missingInputOps(section.base, section.user)
    if (ops.length === 0) return
    writing = true
    void ctx.settings.mutate(NS, ops, section.revision).then(
      () => ctx.logger.info("restored input modalities on %d saved model(s)", ops.length),
      (error) => ctx.logger.warn(error),
    ).finally(() => { writing = false })
  }
  ctx.on("settings/document-updated", (ns) => { if (ns === NS) repair() })
  queueMicrotask(repair)
}
