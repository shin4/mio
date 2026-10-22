/** Export only packaging journals, with CI credentials and local runtime tokens removed. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export async function collectPackagingDiagnostics(source, destination, environment = process.env) {
  const secrets = Object.entries(environment)
    .filter(([name, value]) => value && /KEY|SECRET|TOKEN|PASSWORD|APPLE_ID|APPLE_TEAM_ID|CSC_LINK/i.test(name))
    .flatMap(([, value]) => [value, encodeURIComponent(value)])
    .sort((a, b) => b.length - a.length)
  const redact = (value) => {
    if (typeof value === "string") return secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value)
      .replace(/([?&](?:token|key|api_key|access_token)=)[^\s&#"']+/gi, "$1[REDACTED]")
      .replace(/(Bearer\s+)[\w.+/=-]+/gi, "$1[REDACTED]")
    if (Array.isArray(value)) return value.map(redact)
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
    return value
  }
  const entries = await readdir(source, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const journal = join(source, entry.name, "events.jsonl")
    // Do not export raw streams, dotenv files, certificates, or arbitrary run-directory files.
    const events = (await readFile(journal, "utf8")).split("\n").filter(Boolean).map((line) => redact(parseEvent(line)))
    await mkdir(join(destination, entry.name), { recursive: true, mode: 0o700 })
    await writeFile(join(destination, entry.name, "events.jsonl"), events.map((event) => JSON.stringify(event)).join("\n") + "\n", { mode: 0o600 })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await collectPackagingDiagnostics(
    ".desktop-build/upstream/apps/desktop/.desktop-build/packaging-runs",
    ".desktop-build/diagnostics",
  )
}

function parseEvent(line) {
  try {
    return JSON.parse(line)
  } catch {
    // JSON parser errors may quote the unredacted input.
    throw new Error("Invalid packaging event; refusing to export malformed journal")
  }
}
