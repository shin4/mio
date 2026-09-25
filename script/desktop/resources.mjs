/** Rasterize Mio's SVG mark for the official Windows installer dimensions. */
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { readFile, rename } from "node:fs/promises"
import { join } from "node:path"
import { root, upstream } from "./prepare.mjs"

export async function renderResources() {
  const sharp = createRequire(join(upstream, "apps/desktop/package.json"))("sharp")
  const icon = await readFile(join(root, "assets/brand/mio-icon.svg"))
  const directory = join(upstream, "apps/desktop/installer/assets")
  for (const name of ["brand", "brand-2x", "brand-dark", "brand-dark-2x", "uninstaller-sidebar"]) {
    const target = join(directory, `${name}.png`)
    // Dimensions must come from the pinned source, not an editable generated image.
    const { width, height } = await sharp(
      execFileSync("git", ["show", `HEAD:apps/desktop/installer/assets/${name}.png`], { cwd: upstream }),
    ).metadata()
    const dark = name.includes("dark")
    const size = Math.round(Math.min(width * 0.22, height * 0.4))
    const background = dark ? "#151517" : "#FFFFFF"
    const title = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/><text x="50%" y="75%" text-anchor="middle" font-family="sans-serif" font-size="${size * 0.55}" font-weight="600" fill="${dark ? "#FFFFFF" : "#151517"}">Mio</text></svg>`,
    )
    await sharp(title)
      .composite([
        {
          input: await sharp(icon).resize(size, size).png().toBuffer(),
          left: Math.round((width - size) / 2),
          top: Math.round(height * 0.18),
        },
      ])
      .png()
      .toFile(`${target}.tmp`)
    await rename(`${target}.tmp`, target)
  }
}
