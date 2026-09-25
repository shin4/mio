/** Exercise artifact orchestration with local file operations; does not qualify Apple signing. */
import assert from "node:assert/strict"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { packageMacOSArtifacts } from "../../.desktop-build/upstream/apps/desktop/scripts/package-macos.ts"

for (const arch of ["arm64", "x64"] as const) {
  test(`feed-disabled macOS ${arch} promotes installers without update metadata`, async () => {
    const home = await mkdtemp(join(tmpdir(), "mio-package-test-"))
    const artifactsRoot = join(home, "artifacts")
    const app = join(artifactsRoot, arch === "arm64" ? "mac-arm64" : "mac", "Mio.app")
    await mkdir(app, { recursive: true })
    await writeFile(join(app, "payload"), "fixture application")
    const base = `mio-0.1.7-rc.2-mac-${arch}`
    try {
      await packageMacOSArtifacts(
        {
          arch,
          version: "0.1.7-rc.2",
          artifactsRoot,
          environment: {
            DSH_DESKTOP_MACOS_SIGNING_IDENTITY: "Example Company (TEAMID1234)",
            DSH_DESKTOP_MACOS_TEAM_ID: "TEAMID1234",
            APPLE_KEYCHAIN_PROFILE: "fixture-profile",
          },
        },
        async (artifact) => {
          await mkdir(artifact.output, { recursive: true })
          await writeFile(
            join(artifact.output, `${base}.${artifact.format}`),
            await readFile(join(artifact.appPath, "payload")),
          )
        },
        {
          copyApp: (source, destination) => cp(source, destination, { recursive: true }),
          notarize: async ({ appPath }) => {
            await writeFile(join(appPath, "receipt"), "fixture receipt")
          },
          verifySignature: (path) => {
            assert.ok(path.endsWith("Mio.app"))
          },
          verifyNotarization: (path) => {
            assert.ok(path.endsWith("Mio.app"))
          },
        },
      )
      assert.deepEqual(
        (await readdir(artifactsRoot)).sort(),
        [`${base}.dmg`, `${base}.zip`, arch === "arm64" ? "mac-arm64" : "mac"].sort(),
      )
      assert.equal(await readFile(join(app, "receipt"), "utf8"), "fixture receipt")
      assert.deepEqual(await readdir(home), ["artifacts"])
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
}
