/** Qualify actual packaged payloads and copy only installers plus public evidence. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises"
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
const yaml = require("js-yaml")
assert.match(product.updateOrigin ?? "", /^https:\/\/github\.com\//, "Releases carry the GitHub update feed")
function checkManifest(resources) {
  const manifest = JSON.parse(asar.extractFile(join(resources, "app.asar"), "package.json").toString())
  assert.equal(manifest.version, product.version)
  assert.equal(manifest.dshDesktopAppId, product.appId)
  assert.equal(manifest.dshMandatoryUpdatePolicy, undefined)
  // The installed updater reads the flat GitHub Releases feed; unsigned Windows skips publisher checks.
  const config = yaml.load(readFileSync(join(resources, "app-update.yml"), "utf8"))
  assert.equal(config.provider, "generic")
  assert.equal(config.url, `${product.updateOrigin}/`)
  assert.equal(config.channel, "nightly")
  assert.equal(config.publisherName, undefined)
}
/** The channel entry this target contributes; its hash must describe the exact uploaded payload. */
async function checkFeed(metadata, name) {
  const feed = yaml.load(await readFile(join(directory, metadata), "utf8"))
  assert.equal(feed.version, product.version)
  assert.equal(feed.files.length, 1)
  const [file] = feed.files
  const data = await readFile(join(directory, name))
  assert.equal(file.url, name)
  assert.equal(file.size, data.length)
  assert.equal(file.sha512, createHash("sha512").update(data).digest("base64"))
  return { url: file.url, sha512: file.sha512, size: file.size, releaseDate: String(feed.releaseDate) }
}
const names = windows
  ? [`mio-${product.version}-win-x64-unsigned.exe`]
  : [`mio-${product.version}-${target}.dmg`, `mio-${product.version}-${target}.zip`]
const update = await checkFeed(windows ? "nightly.yml" : "nightly-mac.yml", names.at(-1))
const temporary = await realpath(await mkdtemp(join(tmpdir(), "mio-qa-")))
try {
  if (windows) {
    const { inspectWindowsRuntimeSignature } = await import(
      pathToFileURL(join(upstream, "apps/desktop/scripts/windows-runtime-signature.mjs"))
    )
    const signature = await inspectWindowsRuntimeSignature(join(directory, names[0]))
    assert.equal(signature.status, "NotSigned", "Windows installer must be explicitly unsigned")
    const installed = join(temporary, product.name)
    execFileSync(join(directory, names[0]), ["/S", `/D=${installed}`], { timeout: 180_000, stdio: "inherit" })
    checkManifest(join(installed, "resources"))
    assert.ok((await readdir(installed)).includes("Mio.exe"))
    // Official packaging scripts use non-erasable TypeScript; use their pinned tsx loader.
    const { tsImport } = await import(pathToFileURL(require.resolve("tsx/esm/api")))
    const { smokePreparedRuntime } = await tsImport(
      pathToFileURL(join(upstream, "apps/desktop/scripts/smoke-prepared-runtime.ts")).href,
      import.meta.url,
    )
    const { readDesktopRuntime } = await tsImport(
      pathToFileURL(join(upstream, "apps/desktop/src/runtime-tree.ts")).href,
      import.meta.url,
    )
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
    // 0.4.1 shipped without it: the hardened runtime denied the microphone and macOS never prompted.
    const entitlements = execFileSync(
      "/usr/bin/codesign",
      ["--display", "--entitlements", "-", "--xml", join(temporary, "Mio.app")],
      { encoding: "utf8" },
    )
    const granted = JSON.parse(
      execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], { input: entitlements, encoding: "utf8" }),
    )
    assert.equal(granted["com.apple.security.device.audio-input"], true, "Voice input needs the audio-input entitlement")
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
        update,
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
