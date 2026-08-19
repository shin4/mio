/**
 * Materializing Mio's plugins into the dsh profile.
 *
 * dsh resolves a plugin entry relative to the **profile directory**, walking up
 * from `$DSH_HOME/profiles/<name>` — not from the dsh installation. The profile
 * lives in the user's data directory, whose parent chain never reaches the app
 * bundle, so a plugin shipped inside the app is invisible to the runtime until
 * it is placed in the profile itself.
 *
 * Placing it is a plain directory copy. dsh needs no package manager here: when
 * it scaffolds a profile it symlinks the running installation's packages into
 * `profiles/node_modules`, and a plugin copied under `profiles/<name>/node_modules`
 * resolves its peer dependencies through that same farm. The copy may run before
 * the profile exists — dsh scaffolds around it and leaves it in place.
 */
import { cp, mkdir, readFile, rm } from "node:fs/promises"
import path from "node:path"

/** One plugin to place in the profile: a package directory to copy verbatim. */
export interface BundledPlugin {
  /** Package name, exactly as the patch layer names it (e.g. `@mio/llm-mimo`). */
  readonly name: string
  /** Directory holding the built package (its `package.json` and `lib/`). */
  readonly source: string
}

/** Version already installed in the profile, or undefined when absent/unreadable. */
async function installedVersion(target: string): Promise<string | undefined> {
  const raw = await readFile(path.join(target, "package.json"), "utf8").catch(() => undefined)
  if (raw === undefined) return undefined
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== "object" || parsed === null) return undefined
  const version = (parsed as { version?: unknown }).version
  return typeof version === "string" ? version : undefined
}

/**
 * Ensure every bundled plugin is present in the profile at the shipped version.
 *
 * Re-copies when the installed version differs, so an app update replaces the
 * plugin a previous version left behind. Copies are whole-directory replacements
 * rather than merges: a stale file from an older build would otherwise survive.
 * @returns the names actually written, for logging.
 */
export async function installBundledPlugins(
  dshHome: string,
  profile: string,
  plugins: readonly BundledPlugin[],
): Promise<string[]> {
  const root = path.join(dshHome, "profiles", profile, "node_modules")
  const written: string[] = []

  for (const plugin of plugins) {
    const target = path.join(root, ...plugin.name.split("/"))
    const shipped = await installedVersion(plugin.source)
    if (shipped !== undefined && shipped === (await installedVersion(target))) continue

    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true })
    // Only what the package publishes. Copying the whole source directory would
    // drag a workspace checkout's tests, scripts, and node_modules into the
    // profile in development, where `source` is the checkout rather than an
    // installed package.
    await cp(path.join(plugin.source, "package.json"), path.join(target, "package.json"))
    await cp(path.join(plugin.source, "lib"), path.join(target, "lib"), { recursive: true, dereference: true })
    written.push(plugin.name)
  }

  return written
}
