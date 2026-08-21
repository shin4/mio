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
import { cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"

/** One plugin to place in the profile: a package directory to copy verbatim. */
export interface BundledPlugin {
  /** Package name, exactly as the patch layer names it (e.g. `@mio/llm-mimo`). */
  readonly name: string
  /** Directory holding the built package (its `package.json` and `lib/`). */
  readonly source: string
}

/**
 * Ensure every bundled plugin is present in the profile.
 *
 * The copy is unconditional. Comparing versions looks cheaper but is wrong here:
 * a plugin's version does not move when its code does, so the check would copy
 * once and then serve whatever the first install left behind — across app updates
 * included. Copies are whole-directory replacements rather than merges, so a file
 * an older build left behind cannot survive either.
 * @returns the names written, for logging.
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
