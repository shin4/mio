/**
 * Mio's client UI plugin, Node half.
 *
 * Two jobs. The Loader row itself is one: the client module system scans
 * enabled entries for packages declaring `dsh.client` and serves each one's
 * built `./client` export, so this row is what puts the browser half on the
 * page. dsh's own `dsh-client-ui-brand-official` is nothing but such a seat.
 *
 * The other is the document title, which is the one brand surface no slot
 * reaches. `dsh-client-ui-renderer` hardcodes
 * `const productTitle = "DeepSeek Harness"` and writes it into `document.title`
 * from a component that is a hardcoded sibling of the root outlet rather than a
 * slot occupant, so no registration can displace it, and a bare `id` patch
 * cannot re-point the row at a replacement (a `name` mismatch warns and skips
 * the whole patch).
 *
 * Both halves of the fix below use documented dsh seams and patch nothing.
 */
import type { Context } from "@deepseek-ai/cordis"
// Type-only: brings in the `ctx.webServer` service and the
// `webserver/index-inject` event declaration merged onto cordis. No value
// import — the harness stays external to this bundle.
import type {} from "@deepseek-ai/dsh-host-webserver"

// No top-level `inject`. The web work below needs `ctx.webServer`, but making
// the whole entry depend on it would mean this plugin cannot activate in a
// profile that has no web host — and a loader entry that never activates fails
// the boot, taking the runtime down with it rather than degrading. The
// browser half is served by the web host or not at all, so the Node half
// simply has nothing to do there.

/** What dsh's renderer calls the product, and what Mio calls it. */
const DSH_PRODUCT = "DeepSeek Harness"
const MIO_PRODUCT = "Mio"

/**
 * The Mio mark, as the browser tab icon and installed-app icon.
 *
 * The same ten-rectangle wordmark the app icon and the sidebar brand draw,
 * kept in sync by hand rather than shared: this half runs in Node and the other
 * in the browser, and one small SVG duplicated is cheaper than a build-time
 * asset pipeline for a brand that changes about never.
 */
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none"><rect width="512" height="512" rx="96" fill="#1C1B1A"/><g transform="translate(64,162.5) scale(10.38)" fill="#FF8A00"><rect width="16" height="3" rx="0.8"/><rect y="3" width="4" height="15" rx="0.8"/><rect x="7" y="3" width="2" height="5" rx="0.8"/><rect x="12" y="3" width="4" height="15" rx="0.8"/><rect x="19" width="3" height="3" rx="0.8"/><rect x="19" y="5" width="3" height="13" rx="0.8"/><rect x="25" y="5" width="12" height="3" rx="0.8"/><rect x="25" y="15" width="12" height="3" rx="0.8"/><rect x="25" y="8" width="3" height="7" rx="0.8"/><rect x="34" y="8" width="3" height="7" rx="0.8"/></g></svg>`

/**
 * Styling for Mio's onboarding step.
 *
 * Shipped as a `style` injection row rather than through a CSS pipeline: dsh's
 * own client preset compiles module CSS with lightningcss, which Mio does not
 * reproduce (`packages/client-ui/scripts/bundle.ts` explains why the upstream
 * preset is not vendored). One `<style>` row is a documented index injection,
 * and it keeps the browser bundle a single JavaScript file with no second
 * route to serve.
 *
 * Values come from dsh's own token ramp so the step follows the active theme
 * instead of pinning colours that only work in the dark one.
 */
const ONBOARDING_CSS = `
.mio-onboarding {
  /* The surface's stage is a centering flex row that stretches its child, so
     the card sizes itself on the cross axis instead of filling the viewport. */
  align-self: center;
  box-sizing: border-box;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(420px, calc(100vw - 48px));
  padding: 32px;
  border-radius: 16px;
  background: var(--dsw-color-background-elevated, #1c1b1a);
  color: var(--dsw-color-text-strong, #f5f5f4);
  box-shadow: 0 24px 64px rgb(0 0 0 / 35%);
}
.mio-onboarding h1 { margin: 0; font-size: 22px; font-weight: 700; }
.mio-onboarding p { margin: 0; font-size: 14px; color: var(--dsw-color-text-weak, #a8a29e); }
.mio-onboarding__lead { font-size: 15px; }
.mio-onboarding__field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.mio-onboarding__field input,
.mio-onboarding__field select {
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-color-border-default, #44403c);
  background: var(--dsw-color-background-base, #0c0a09);
  color: inherit;
  font: inherit;
}
.mio-onboarding__field small { color: var(--dsw-color-text-weak, #a8a29e); }
.mio-onboarding__error { color: var(--dsw-color-text-danger, #f87171); }
.mio-onboarding__actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.mio-onboarding__actions button {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid var(--dsw-color-border-default, #44403c);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.mio-onboarding__actions button:disabled { opacity: 0.5; cursor: default; }
.mio-onboarding__primary {
  background: #ff8a00;
  border-color: #ff8a00;
  color: #1c1b1a;
  font-weight: 600;
}
.mio-onboarding__quiet { border-color: transparent; opacity: 0.7; }
`

/** dsh's manifest with Mio's identity; the shape is otherwise unchanged. */
const MANIFEST = JSON.stringify(
  {
    id: "/",
    name: MIO_PRODUCT,
    short_name: MIO_PRODUCT,
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  },
  null,
  2,
)

/**
 * Rewrite the product name inside `document.title` at the property level.
 *
 * This is a **workaround for upstream version skew, and should be deleted when
 * the skew closes.** `dsh-client-web@0.1.1-rc.1` already ships a `DocumentTitle`
 * that honours the served `<title>` — which `tapIndex` below already controls —
 * but the prebuilt `dsh-web-frontend` dist pinned at the same version is stale
 * relative to it and still carries the hardcoded constant. Once the dist catches
 * up, the tap alone is enough and this row can go.
 *
 * It rewrites rather than pins, so dsh's deliberate `<session> — <product>`
 * projection survives: "Refactor the parser — DeepSeek Harness" becomes
 * "Refactor the parser — Mio" rather than being flattened to a constant. That
 * is the reason this is not done in the Electron shell with
 * `page-title-updated` + `preventDefault()`, which can only freeze the whole
 * title and would leave `document.title` wrong for `bun run dev:runtime`
 * anyway.
 */
const TITLE_GUARD = `(() => {
  var owner = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  if (!owner || !owner.set || !owner.get) return;
  var rename = (value) => String(value).split(${JSON.stringify(DSH_PRODUCT)}).join(${JSON.stringify(MIO_PRODUCT)});
  Object.defineProperty(document, 'title', {
    configurable: true,
    get: () => owner.get.call(document),
    set: (value) => owner.set.call(document, rename(value)),
  });
  document.title = document.title;
})();`

/**
 * Host plugin body.
 * @param ctx - the plugin context carrying `ctx.webServer`.
 */
export function apply(ctx: Context): void {
  // Runs once a web host exists, and never in a profile without one.
  ctx.inject(["webServer"], (ctx) => applyWebBrand(ctx))
}

/**
 * Everything that needs a browser to matter.
 * @param ctx - a context in which `ctx.webServer` is available.
 */
function applyWebBrand(ctx: Context): void {
  // Two brand assets live in the prebuilt `dsh-web-frontend` dist, which Mio
  // does not patch. A named exact route is matched before the fallback that
  // serves that dist, so registering these paths shadows the shipped files
  // without touching them.
  const serve = (path: string, type: string, body: string) =>
    ctx.webServer.register({
      kind: "exact",
      path,
      handler: (_request, response) => {
        response.writeHead(200, { "content-type": type, "cache-control": "no-cache" })
        response.end(body)
      },
    })
  serve("/favicon.svg", "image/svg+xml", FAVICON)
  serve("/manifest.webmanifest", "application/manifest+json", MANIFEST)

  // The served title. Correct on its own once the prebuilt dist stops
  // overwriting it, and what the guard above restores to in the meantime.
  ctx.webServer.tapIndex((html) =>
    html.replace(/<title>[\s\S]*?<\/title>/, `<title>${MIO_PRODUCT}</title>`),
  )

  // A head row runs before the client bundles do, so the accessor is in place
  // by the time React first writes a title.
  ctx.on("webserver/index-inject", (table) => {
    table.push({ kind: "script", placement: "head", text: TITLE_GUARD })
    table.push({ kind: "style", text: ONBOARDING_CSS })
  })
}
