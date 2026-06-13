import { type ComponentProps } from "solid-js"

// Mio brand logo set — the "Mio" rounded-pixel wordmark.
//
// The glyph is defined ONCE as rounded rectangles in a 37×18 grid-unit box
// (an "M" + lowercase "i" + lowercase "o", continuing the original pixel
// monogram and adding the "o"). `MioGlyph` scales + centers it into any
// viewBox and rounds every pixel by `MIO_RX` grid units, so each mark shares
// one source of truth. The committed favicon SVGs and desktop icon images are
// kept visually in sync with this grid (see packages/ui/src/assets/favicon and
// packages/desktop/icons/*).

const MIO_W = 37
const MIO_H = 18
const MIO_RX = 0.8
const MIO_RECTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 16, 3], // M top bar
  [0, 3, 4, 15], // M left leg
  [7, 3, 2, 5], // M center peak
  [12, 3, 4, 15], // M right leg
  [19, 0, 3, 3], // i dot
  [19, 5, 3, 13], // i stem
  [25, 5, 12, 3], // o top
  [25, 15, 12, 3], // o bottom
  [25, 8, 3, 7], // o left
  [34, 8, 3, 7], // o right
]

export function MioGlyph(props: {
  width: number
  height: number
  fill?: string
  class?: string
  dataComponent?: string
  ref?: ComponentProps<"svg">["ref"]
}) {
  const scale = Math.min(props.width / MIO_W, props.height / MIO_H)
  const ox = (props.width - MIO_W * scale) / 2
  const oy = (props.height - MIO_H * scale) / 2
  const fill = props.fill ?? "var(--icon-strong-base)"
  return (
    <svg
      ref={props.ref}
      data-component={props.dataComponent}
      viewBox={`0 0 ${props.width} ${props.height}`}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      {MIO_RECTS.map(([x, y, w, h]) => (
        <rect
          x={ox + x * scale}
          y={oy + y * scale}
          width={w * scale}
          height={h * scale}
          rx={MIO_RX * scale}
          fill={fill}
        />
      ))}
    </svg>
  )
}

export const Mark = (props: { class?: string }) => (
  <MioGlyph width={33} height={16} dataComponent="logo-mark" class={props.class} />
)

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => (
  <MioGlyph width={100} height={50} dataComponent="logo-splash" ref={props.ref} class={props.class} />
)

export const Logo = (props: { class?: string }) => <MioGlyph width={234} height={42} class={props.class} />
