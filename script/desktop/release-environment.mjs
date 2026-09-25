/** Materialize CI-only credentials for upstream's file-owned packaging boundary. */
import { spawnSync } from "node:child_process"
import { X509Certificate } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { root, upstream } from "./prepare.mjs"

if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Release credentials must be materialized on the CI runner")
const product = JSON.parse(await readFile(join(root, "desktop/product.json"), "utf8"))
const settings = { DSH_DESKTOP_APP_ID: product.appId }
if (process.platform === "darwin") {
  for (const name of ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]) {
    if (!process.env[name]) throw new Error(`Missing required signing secret: ${name}`)
  }
  const directory = join(root, ".desktop-build/signing")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const certificate = join(directory, "developer-id.p12")
  await writeFile(certificate, Buffer.from(process.env.CSC_LINK, "base64"), { mode: 0o600 })
  const args = ["pkcs12", "-in", certificate, "-clcerts", "-nokeys", "-passin", "env:CSC_KEY_PASSWORD"]
  const modern = spawnSync("openssl", args, { encoding: "utf8" })
  const extracted = modern.status === 0 ? modern : spawnSync("openssl", [...args, "-legacy"], { encoding: "utf8" })
  if (extracted.status !== 0) throw new Error("Cannot read Developer ID certificate; check signing credentials")
  const subject = new X509Certificate(extracted.stdout).subject
  const identity = subject
    .split("\n")
    .find((line) => line.startsWith("CN=Developer ID Application: "))
    ?.slice("CN=Developer ID Application: ".length)
  const team = process.env.APPLE_TEAM_ID
  if (!identity || !identity.endsWith(`(${team})`))
    throw new Error("Developer ID certificate does not match Apple Team ID")
  Object.assign(settings, {
    CSC_LINK: certificate,
    CSC_KEY_PASSWORD: process.env.CSC_KEY_PASSWORD,
    APPLE_ID: process.env.APPLE_ID,
    APPLE_APP_SPECIFIC_PASSWORD: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    APPLE_TEAM_ID: team,
    DSH_DESKTOP_MACOS_TEAM_ID: team,
    DSH_DESKTOP_MACOS_SIGNING_IDENTITY: identity,
  })
}
for (const value of Object.values(settings)) {
  if (/[\r\n\0']/.test(value)) throw new Error("Signing configuration contains unsupported dotenv characters")
}
await writeFile(
  join(upstream, "apps/desktop", process.platform === "darwin" ? ".env.macos" : ".env.windows"),
  Object.entries(settings)
    .map(([name, value]) => `${name}='${value}'`)
    .join("\n") + "\n",
  { mode: 0o600 },
)
console.log("Platform release configuration prepared; credential values omitted")
