import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { composeUpdateFeed } from "../../script/desktop/update-feed.mjs"
import { officialClientBuildEnvironment } from "../../.desktop-build/upstream/scripts/client-build-environment.ts"
import { createElectronBuilderConfig } from "../../.desktop-build/upstream/apps/desktop/scripts/electron-builder-config.mjs"
import { validateDesktopPackageEnvironment } from "../../.desktop-build/upstream/apps/desktop/scripts/desktop-package-environment.mjs"

void test("Mio release identity is independent of the pinned runtime and needs no upstream policy service", async () => {
  const product = JSON.parse(await readFile(new URL("../product.json", import.meta.url), "utf8"))
  const lock = JSON.parse(await readFile(new URL("../upstream.lock.json", import.meta.url), "utf8"))
  assert.equal(product.version, "0.4.3")
  assert.equal(lock.version, "0.1.7-rc.2")
  const environment = {
    DSH_DESKTOP_APP_ID: product.appId,
    DSH_DESKTOP_UNSIGNED: "1",
    DSH_DESKTOP_TARGET_PLATFORM: "win32",
    DSH_DESKTOP_TARGET_ARCH: "x64",
  }
  validateDesktopPackageEnvironment(environment, { platform: "win32", arch: "x64" }, { unsigned: true })
  const config = createElectronBuilderConfig(environment, "win32", "x64")
  assert.equal(config.extraMetadata.version, product.version)
  assert.equal(config.extraMetadata.dshDesktopAppId, product.appId)
  assert.equal(config.extraMetadata.dshMandatoryUpdatePolicy, undefined)
  // Unsigned Windows still updates: the feed carries SHA-512, and no publisher name is pinned.
  assert.deepEqual(config.publish, [{ provider: "generic", url: `${product.updateOrigin}/`, channel: "nightly" }])
  assert.equal(config.win.signtoolOptions.publisherName, undefined)
  assert.match(config.artifactName, /unsigned/)
})

void test("one GitHub release feed serves both macOS architectures and Windows", async () => {
  const require = createRequire(new URL("../../.desktop-build/upstream/apps/desktop/package.json", import.meta.url))
  const yaml = require("js-yaml")
  const sha512 = (seed: string) => createHash("sha512").update(seed).digest("base64")
  const entry = (url: string, releaseDate: string) => ({ url, sha512: sha512(url), size: url.length, releaseDate })
  const feed = composeUpdateFeed("0.4.2", {
    "mac-arm64": entry("mio-0.4.2-mac-arm64.zip", "2026-09-26T10:00:00.000Z"),
    "mac-x64": entry("mio-0.4.2-mac-x64.zip", "2026-09-26T10:05:00.000Z"),
    "win-x64": entry("mio-0.4.2-win-x64-unsigned.exe", "2026-09-26T10:03:00.000Z"),
  })
  assert.deepEqual(Object.keys(feed).sort(), ["nightly-mac.yml", "nightly.yml"])
  const mac = yaml.load(feed["nightly-mac.yml"])
  assert.equal(mac.version, "0.4.2")
  assert.deepEqual(mac.files.map((file: { url: string }) => file.url), ["mio-0.4.2-mac-arm64.zip", "mio-0.4.2-mac-x64.zip"])
  assert.equal(mac.files[1].sha512, sha512("mio-0.4.2-mac-x64.zip"))
  assert.equal(mac.releaseDate, "2026-09-26T10:05:00.000Z")
  const win = yaml.load(feed["nightly.yml"])
  assert.deepEqual(win.files, [{ url: "mio-0.4.2-win-x64-unsigned.exe", sha512: sha512("mio-0.4.2-win-x64-unsigned.exe"), size: 30 }])
  assert.throws(() => composeUpdateFeed("0.4.2", { "mac-arm64": entry("mio-0.4.2-mac-arm64.zip", "x") }), /mac-x64/)
})

void test("the browser bundle reports the Mio version, not the pinned runtime's", async () => {
  const product = JSON.parse(await readFile(new URL("../product.json", import.meta.url), "utf8"))
  const root = fileURLToPath(new URL("../../.desktop-build/upstream", import.meta.url))
  const environment = officialClientBuildEnvironment(root, { DSH_CLIENT_COMMIT_HASH: "477b4f4" })
  assert.equal(environment.DSH_CLIENT_VERSION, product.version)
  assert.equal(environment.DSH_CLIENT_TITLE, "Mio")
})
