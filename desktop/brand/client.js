/** Mio adds brand occupants and accent tokens to the unmodified official layout. */
window.__ModuleLoader__.load({
  id: "@mio/brand",
  factory(require) {
    const { createElement } = require("react")
    const mark =
      "M150 430C324 376 464 430 512 548C560 430 700 376 874 430C800 520 700 570 598 588C586 640 590 700 612 758C576 788 448 788 412 758C434 700 438 640 426 588C324 570 224 520 150 430Z"
    const BrandMark = ({ size = 28 }) =>
      createElement(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "100 330 824 500",
          "aria-hidden": true,
        },
        createElement("path", { d: mark, fill: "#FF6900" }),
      )
    const BrandName = () => createElement("span", { style: { fontWeight: 650, fontSize: "18px" } }, "Mio")
    return {
      inject: ["slots", "theme"],
      apply(ctx) {
        ctx.slots.inject("sidebar.brand.mark", () =>
          ctx.slots.inject("sidebar.brand.name", function* () {
            yield ctx.slots.register({ name: "sidebar.brand.mark" }, BrandMark)
            yield ctx.slots.register({ name: "sidebar.brand.name" }, BrandName)
          }),
        )
        ctx.slots.inject("conversation.hero.brand.mark", function* () {
          yield ctx.slots.register({ name: "conversation.hero.brand.mark" }, BrandMark)
        })
        ctx.effect(() =>
          ctx.theme.overrideTokens("@mio/brand", {
            "--dsw-alias-button-info-fill": { light: "#C85100", dark: "#C85100" },
            "--dsw-alias-button-info-hover": { light: "#A64300", dark: "#A64300" },
            "--dsw-alias-state-business-tertiary": { light: "#FFF0E5", dark: "#4A291B" },
            "--dsw-alias-link": { light: "#B94C00", dark: "#FF9A55" },
            "--dsw-alias-state-business-primary": { light: "#C85100", dark: "#FF9A55" },
            "--dsw-alias-brand-primary-new-colorprimary-new-color": { light: "#C85100", dark: "#FF9A55" },
          }),
        )
      },
    }
  },
})
