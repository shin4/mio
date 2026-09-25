/** Add opt-in catalog entries before packaging the official Desktop composition. */
export function composeModels(patch, product) {
  if (typeof product.enableUltraSpeed !== "boolean") {
    throw new Error("desktop/product.json: enableUltraSpeed must be a boolean")
  }
  const marker = "        # mio:optional-models"
  if (patch.split(marker).length !== 2) throw new Error("Missing or duplicate optional model slot")
  return patch.replace(
    marker,
    product.enableUltraSpeed
      ? `          - ${JSON.stringify({
          id: "mimo-v2.6-pro-ultraspeed",
          name: "MiMo V2.6 Pro UltraSpeed",
          reasoningEfforts: { off: "none", high: "high" },
        })}`
      : marker,
  )
}
