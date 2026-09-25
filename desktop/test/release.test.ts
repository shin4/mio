import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { createElectronBuilderConfig } from "../../.desktop-build/upstream/apps/desktop/scripts/electron-builder-config.mjs"
import { validateDesktopPackageEnvironment } from "../../.desktop-build/upstream/apps/desktop/scripts/desktop-package-environment.mjs"

void test("Mio release identity is independent of the pinned runtime and needs no upstream policy service", async () => {
  const product = JSON.parse(await readFile(new URL("../product.json", import.meta.url), "utf8"))
  const lock = JSON.parse(await readFile(new URL("../upstream.lock.json", import.meta.url), "utf8"))
  assert.equal(product.version, "0.4.0")
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
  assert.equal(config.publish, null)
  assert.match(config.artifactName, /unsigned/)
})
