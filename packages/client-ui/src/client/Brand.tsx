/**
 * Mio's brand marks, drawn rather than imported.
 *
 * The mark is the fluke — 「鲸尾·深潜 / The Sounding」, a whale's fluke and tail
 * stock, the last thing above water before a deep dive — adopted 2026-08-22.
 * `assets/brand/mio-icon.svg` is the tile master the app icon
 * (`packages/shell/resources/icon.icns`) is generated from, and
 * `assets/brand/README.md` records that pipeline. The path is transcribed here
 * so the bundle carries no asset request: the client module system serves one
 * JavaScript file per plugin, and an `<img src>` would need a second route.
 *
 * `sidebar.brand.mark` and `conversation.hero.brand.mark` are **square** slots
 * (24px and 34px as the shell renders them), and the fluke tile is square by
 * construction — the same orange field and white fluke the dock icon shows, so
 * the in-app brand and the installed app read as the same product.
 *
 * The name slot still draws the ten-rectangle "Mio" wordmark in `currentColor`,
 * following the sidebar's text colour rather than pinning a brand colour
 * against a background that moves. The wordmark is a typography pass of its
 * own and deliberately did not ride along with the mark swap.
 */

/** Brand orange — Xiaomi's #FF6900, matching the app icon field. */
const MIO_ORANGE = "#FF6900"

/** The fluke, on the icon master's 1024-unit grid. */
const FLUKE =
  "M 150 430 C 324 376, 464 430, 512 548 C 560 430, 700 376, 874 430 " +
  "C 800 520, 700 570, 598 588 C 586 640, 590 700, 612 758 " +
  "C 576 788, 448 788, 412 758 C 434 700, 438 640, 426 588 " +
  "C 324 570, 224 520, 150 430 Z"

interface Rect {
  readonly x?: number
  readonly y?: number
  readonly width: number
  readonly height: number
}

/** The "Mio" wordmark, 37×18 in the glyph's own coordinate space. */
const WORDMARK: readonly Rect[] = [
  { width: 16, height: 3 },
  { y: 3, width: 4, height: 15 },
  { x: 7, y: 3, width: 2, height: 5 },
  { x: 12, y: 3, width: 4, height: 15 },
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
 * The product icon: the white fluke on the orange rounded field.
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
      <rect width="512" height="512" rx="115" fill={MIO_ORANGE} />
      {/* The 1024-grid fluke centred on the 512 field at 65% width. */}
      <path transform="translate(20.5 -11.7) scale(0.46)" fill="#FFFFFF" d={FLUKE} />
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
