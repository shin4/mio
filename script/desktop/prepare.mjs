/** Materialize the reviewed upstream tree; generated source lives outside our workspaces. */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { resolve, join } from "node:path"
import { fileURLToPath } from "node:url"

import { composeModels } from "./models.mjs"
import { verifyCheckout } from "./verify-checkout.mjs"

export const root = fileURLToPath(new URL("../../", import.meta.url))
export const upstream = join(root, ".desktop-build", "upstream")

function git(args, cwd = upstream) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`)
  return result.stdout.trim()
}

export async function prepare() {
  const lock = JSON.parse(await readFile(join(root, "desktop/upstream.lock.json"), "utf8"))
  await mkdir(join(root, ".desktop-build"), { recursive: true })
  if (!existsSync(join(upstream, ".git"))) {
    git(["clone", "--depth", "1", "--branch", lock.ref, lock.repository, upstream], root)
  }
  if (git(["rev-parse", "HEAD"]) !== lock.commit || git(["remote", "get-url", "origin"]) !== lock.repository) {
    throw new Error("Desktop checkout differs from upstream.lock.json; move it aside and prepare again.")
  }
  // Hash the committed input, not the patched working copy.
  const committed = spawnSync("git", ["show", "HEAD:pnpm-lock.yaml"], { cwd: upstream, maxBuffer: 8 * 1024 * 1024 })
  if (committed.status !== 0 || createHash("sha256").update(committed.stdout).digest("hex") !== lock.lockfileSha256) {
    throw new Error("Upstream pnpm lockfile checksum differs from the reviewed input.")
  }
  const patchDir = join(root, "desktop/patches")
  const patches = (await readdir(patchDir))
    .filter((name) => name.endsWith(".patch"))
    .sort()
    .map((name) => join(patchDir, name))
  for (const patch of patches) {
    const applied = spawnSync("git", ["apply", "--reverse", "--check", patch], { cwd: upstream })
    if (applied.status === 0) continue
    git(["apply", "--check", patch])
    git(["apply", patch])
  }
  // These exact outputs are regenerated from reviewed inputs before compilation.
  // Do not allow whole directories: an extra source file must fail this gate.
  await verifyCheckout(upstream, patches, [
    "apps/desktop/src/mio-product.ts",
    "apps/desktop/scripts/mio-product.mjs",
    ...["icon.png", "icon-macos.png", "icon-windows.png", "tray-windows.ico", "mio.icns"].map(
      (name) => `apps/desktop/resources/${name}`,
    ),
    ...["brand", "brand-2x", "brand-dark", "brand-dark-2x", "uninstaller-sidebar"].map(
      (name) => `apps/desktop/installer/assets/${name}.png`,
    ),
    ...(await readdir(join(root, "desktop/bundle"))).map((name) => `mio/desktop/${name}`),
    ...(await readdir(join(root, "desktop/brand"))).map((name) => `mio/brand/${name}`),
    ...(await readdir(join(root, "desktop/asr"))).map((name) => `mio/asr/${name}`),
    ...(await readdir(join(root, "desktop/tts"))).map((name) => `mio/tts/${name}`),
  ])
  const product = JSON.parse(await readFile(join(root, "desktop/product.json"), "utf8"))
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.[1-9]\d*)?$/.test(product.version)) {
    throw new Error("Invalid Mio release version")
  }
  if (
    !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(product.appId) ||
    !/^[a-z][a-z0-9-]*$/.test(product.protocol) ||
    !/^[a-z0-9-]+$/.test(product.dataDirectory)
  )
    throw new Error("Invalid Mio product identity")
  // The feed is the latest GitHub release: publish-release.mjs uploads its metadata beside the installers.
  if (product.updateOrigin !== null && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/latest\/download$/.test(product.updateOrigin))
    throw new Error("Mio updateOrigin must be null or a GitHub releases/latest/download URL")
  const modelPatch = composeModels(await readFile(join(root, "desktop/bundle/mio.patch.yml"), "utf8"), product)
  await cp(join(root, "desktop/bundle"), join(upstream, "mio/desktop"), { recursive: true })
  await writeFile(join(upstream, "mio/desktop/mio.patch.yml"), modelPatch)
  await cp(join(root, "desktop/brand"), join(upstream, "mio/brand"), { recursive: true })
  await cp(join(root, "desktop/asr"), join(upstream, "mio/asr"), { recursive: true })
  await cp(join(root, "desktop/tts"), join(upstream, "mio/tts"), { recursive: true })
  for (const [target, suffix] of [
    ["src/mio-product.ts", " as const"],
    ["scripts/mio-product.mjs", ""],
  ]) {
    await writeFile(
      join(upstream, "apps/desktop", target),
      `// Generated from desktop/product.json.\nexport const mioProduct = ${JSON.stringify(product, null, 2)}${suffix}\n`,
    )
  }
  for (const name of ["icon.png", "icon-macos.png", "icon-windows.png"]) {
    await cp(join(root, "packages/shell/resources/icon.png"), join(upstream, "apps/desktop/resources", name))
  }
  await cp(join(root, "packages/shell/resources/icon.ico"), join(upstream, "apps/desktop/resources/tray-windows.ico"))
  await cp(join(root, "packages/shell/resources/icon.icns"), join(upstream, "apps/desktop/resources/mio.icns"))
  console.log(`Mio Desktop: ${lock.ref} (${lock.commit.slice(0, 12)}) prepared`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepare()
