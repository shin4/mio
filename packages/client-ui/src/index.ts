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

/** Required service: the web host, for routes, the index transform, and the injection row. */
export const inject = ["webServer"]

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
  })
}
