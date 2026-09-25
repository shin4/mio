/** Qualify actual packaged payloads and copy only installers plus public evidence. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { root, upstream } from "./prepare.mjs"

const target = process.argv[2]
assert.ok(["mac-arm64", "mac-x64", "win-x64"].includes(target), "Unknown release target")
const windows = target === "win-x64"
assert.equal(process.platform, windows ? "win32" : "darwin")
const product = JSON.parse(await readFile(join(root, "desktop/product.json"), "utf8"))
const lock = JSON.parse(await readFile(join(root, "desktop/upstream.lock.json"), "utf8"))
const directory = join(
  upstream,
  "apps/desktop/.desktop-build/targets",
  target,
  windows ? "unsigned-artifacts" : "artifacts",
)
const output = join(root, ".desktop-build/release", target)
const require = createRequire(join(upstream, "apps/desktop/package.json"))
const asar = createRequire(require.resolve("app-builder-lib"))("@electron/asar")
function checkManifest(resources) {
  const manifest = JSON.parse(asar.extractFile(join(resources, "app.asar"), "package.json").toString())
  assert.equal(manifest.version, product.version)
  assert.equal(manifest.dshDesktopAppId, product.appId)
  assert.equal(manifest.dshMandatoryUpdatePolicy, undefined)
}
const names = windows
  ? [`mio-${product.version}-win-x64-unsigned.exe`]
  : [`mio-${product.version}-${target}.dmg`, `mio-${product.version}-${target}.zip`]
const temporary = await mkdtemp(join(tmpdir(), "mio-installer-verify-"))
try {
  if (windows) {
    const installed = join(temporary, "installed")
    execFileSync(join(directory, names[0]), ["/S", `/D=${installed}`], { timeout: 180_000, stdio: "inherit" })
    checkManifest(join(installed, "resources"))
    assert.ok((await readdir(installed)).includes("Mio.exe"))
    const { smokePreparedRuntime } = await import(
      pathToFileURL(join(upstream, "apps/desktop/scripts/smoke-prepared-runtime.ts"))
    )
    const { readDesktopRuntime } = await import(pathToFileURL(join(upstream, "apps/desktop/src/runtime-tree.ts")))
    const descriptor = readDesktopRuntime(join(upstream, "apps/desktop/.desktop-build/targets", target, "dsh"))
    await smokePreparedRuntime(
      join(installed, "resources/app.asar/dsh"),
      join(installed, "Mio.exe"),
      join(installed, "resources/runtime"),
      descriptor,
    )
  } else {
    const { loadDesktopPackageEnvironment } = await import(
      pathToFileURL(join(upstream, "apps/desktop/scripts/desktop-package-environment.mjs"))
    )
    const { resolveMacOSSigningEnvironment } = await import(
      pathToFileURL(join(upstream, "apps/desktop/scripts/desktop-release-environment.mjs"))
    )
    const { verifyMacOSNotarizedApplication, verifyMacOSDiskImage } = await import(
      pathToFileURL(join(upstream, "apps/desktop/scripts/verify-macos-signature.mjs"))
    )
    const expected = resolveMacOSSigningEnvironment(loadDesktopPackageEnvironment("darwin"))
    verifyMacOSDiskImage(join(directory, names[0]), expected)
    execFileSync("/usr/bin/ditto", ["-xk", join(directory, names[1]), temporary])
    verifyMacOSNotarizedApplication(join(temporary, "Mio.app"), expected)
    checkManifest(join(temporary, "Mio.app/Contents/Resources"))
    const mount = join(temporary, "mounted")
    await mkdir(mount)
    execFileSync("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, join(directory, names[0])])
    try {
      checkManifest(join(mount, "Mio.app/Contents/Resources"))
    } finally {
      execFileSync("hdiutil", ["detach", mount])
    }
  }
  await mkdir(output, { recursive: true })
  const artifacts = []
  for (const name of names) {
    const data = await readFile(join(directory, name))
    assert.ok(data.length > 0)
    await cp(join(directory, name), join(output, name))
    artifacts.push({ name, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") })
  }
  await writeFile(
    join(output, "qualification.json"),
    JSON.stringify(
      {
        version: product.version,
        target,
        upstream: lock.commit,
        commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
        signing: windows
          ? "unsigned (explicitly approved)"
          : "Developer ID signed, notarized, stapled, Gatekeeper accepted",
        passed: true,
        artifacts,
      },
      null,
      2,
    ) + "\n",
  )
  await cp(join(root, ".desktop-build/build-record.json"), join(output, "build-record.json"))
  console.log(`${target}: verified Mio ${product.version} installers and identity`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
