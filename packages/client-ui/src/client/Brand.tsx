/**
 * Mio's brand marks, drawn rather than imported.
 *
 * The glyph is the ten-rectangle "Mio" wordmark from the app icon
 * (`archive/packages/app/public/favicon-v3.svg`, the same artwork
 * `packages/shell/resources/icon.icns` is generated from), transcribed here so
 * the bundle carries no asset request: the client module system serves one
 * JavaScript file per plugin, and an `<img src>` would need a second route.
 *
 * Two presentations, and they are not the same glyph — which is the point.
 *
 * `sidebar.brand.mark` and `conversation.hero.brand.mark` are **square** slots
 * (24px and 34px as the shell renders them). The full "Mio" wordmark is 37:18,
 * so fitting it into a square leaves the letters about 9px tall: illegible, and
 * doubled up against the wordmark the neighbouring name slot already draws. The
 * mark therefore carries the `M` alone, which is 16:18 and fills a square
 * properly, on the icon's dark rounded field so it reads as the same product
 * icon the dock shows.
 *
 * The name slot draws the full wordmark with no field, painted in
 * `currentColor` so it inherits the sidebar's text colour and follows the
 * light/dark theme rather than pinning a brand colour against a background
 * that moves.
 */

/** Brand orange, matching the app icon. */
const MIO_ORANGE = "#FF8A00"
/** Icon field, matching the app icon. */
const MIO_FIELD = "#1C1B1A"

interface Rect {
  readonly x?: number
  readonly y?: number
  readonly width: number
  readonly height: number
}

/** The "M", 16×18 in the glyph's own coordinate space. */
const MONOGRAM: readonly Rect[] = [
  { width: 16, height: 3 },
  { y: 3, width: 4, height: 15 },
  { x: 7, y: 3, width: 2, height: 5 },
  { x: 12, y: 3, width: 4, height: 15 },
]

/** The "io" that follows it, completing the 37×18 wordmark. */
const WORDMARK: readonly Rect[] = [
  ...MONOGRAM,
  { x: 19, width: 3, height: 3 },
  { x: 19, y: 5, width: 3, height: 13 },
  { x: 25, y: 5, width: 12, height: 3 },
  { x: 25, y: 15, width: 12, height: 3 },
  { x: 25, y: 8, width: 3, height: 7 },
  { x: 34, y: 8, width: 3, height: 7 },
]

function Glyph({ rects, fill }: { rects: readonly Rect[]; fill: string }) {
  return (
    <g fill={fill}>
      {rects.map((rect) => (
        <rect key={`${rect.x ?? 0}-${rect.y ?? 0}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={0.8} />
      ))}
    </g>
  )
}

/**
 * The product icon: the `M` monogram on the icon's rounded field.
 * @param props - presentation requested by the host surface.
 */
export function MioBrandMark({ size, className }: { size?: number | string; className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      fill="none"
      role="img"
      aria-label="Mio"
    >
      <rect width="512" height="512" rx="96" fill={MIO_FIELD} />
      {/* 16×18 scaled to 190×214 and centred on the 512 field. */}
      <g transform="translate(161,148.5) scale(11.9)">
        <Glyph rects={MONOGRAM} fill={MIO_ORANGE} />
      </g>
    </svg>
  )
}

/**
 * The wordmark alone, for surfaces that slot the mark separately.
 *
 * Height-driven rather than width-driven: the slot sits in a text row, so the
 * glyph should match the row's cap height and take whatever width follows.
 */
export function MioBrandName() {
  return (
    <svg viewBox="0 0 37 18" height="1em" fill="none" role="img" aria-label="Mio">
      <Glyph rects={WORDMARK} fill="currentColor" />
    </svg>
  )
}
