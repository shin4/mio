;(function () {
  var keys = {
    themeId: "mimo-theme-id",
    colorScheme: "mimo-color-scheme",
    light: "mimo-theme-css-light",
    dark: "mimo-theme-css-dark",
  }
  var legacy = {
    themeId: "opencode-theme-id",
    colorScheme: "opencode-color-scheme",
    light: "opencode-theme-css-light",
    dark: "opencode-theme-css-dark",
  }
  var read = function (key, legacyKey) {
    var value = localStorage.getItem(key)
    if (value !== null) return value

    value = localStorage.getItem(legacyKey)
    if (value === null) return null

    localStorage.setItem(key, value)
    localStorage.removeItem(legacyKey)
    return value
  }
  var remove = function (key, legacyKey) {
    localStorage.removeItem(key)
    localStorage.removeItem(legacyKey)
  }
  var themeId = read(keys.themeId, legacy.themeId) || "oc-2"

  if (themeId === "oc-1") {
    themeId = "oc-2"
    localStorage.setItem(keys.themeId, themeId)
    localStorage.removeItem(legacy.themeId)
    remove(keys.light, legacy.light)
    remove(keys.dark, legacy.dark)
  }

  var scheme = read(keys.colorScheme, legacy.colorScheme) || "system"
  var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  var mode = isDark ? "dark" : "light"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode

  // Update theme-color meta tag to match app color scheme
  var metas = document.querySelectorAll("meta[name='theme-color']")
  if (metas.length > 0) metas[0].setAttribute("content", isDark ? "#131010" : "#F8F7F7")

  if (themeId === "oc-2") return

  var css = read(mode === "dark" ? keys.dark : keys.light, mode === "dark" ? legacy.dark : legacy.light)
  if (css) {
    var style = document.createElement("style")
    style.id = "oc-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  }
})()
