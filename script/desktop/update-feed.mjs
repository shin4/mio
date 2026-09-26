/** electron-updater channel files for the GitHub Releases feed (`releases/latest/download`). */

/**
 * Compose the channel metadata one release publishes. Both macOS architectures share
 * `nightly-mac.yml`; electron-updater selects the ZIP whose name does or does not contain `arm64`.
 * @param {string} version - Product version every entry must carry.
 * @param {Record<string, { url: string, sha512: string, size: number, releaseDate: string }>} entries - Qualified update payload per target.
 * @returns {Record<string, string>} Channel filename to YAML text.
 */
export function composeUpdateFeed(version, entries) {
  const feed = (targets) => {
    const files = targets.map((target) => {
      const entry = entries[target]
      if (!entry) throw new Error(`Missing update payload for ${target}`)
      if (!/^[\w.-]+$/.test(entry.url) || !entry.url.includes(version)) throw new Error(`Unexpected update file ${entry.url}`)
      if (!/^[A-Za-z0-9+/]{86}==$/.test(entry.sha512)) throw new Error(`Invalid SHA-512 for ${entry.url}`)
      if (!Number.isSafeInteger(entry.size) || entry.size <= 0) throw new Error(`Invalid size for ${entry.url}`)
      return entry
    })
    const releaseDate = targets.map((target) => entries[target].releaseDate).sort().at(-1)
    return [
      `version: ${version}`,
      "files:",
      ...files.flatMap((file) => [`  - url: ${file.url}`, `    sha512: '${file.sha512}'`, `    size: ${file.size}`]),
      `path: ${files[0].url}`,
      `sha512: '${files[0].sha512}'`,
      `releaseDate: '${releaseDate}'`,
      "",
    ].join("\n")
  }
  return {
    "nightly-mac.yml": feed(["mac-arm64", "mac-x64"]),
    "nightly.yml": feed(["win-x64"]),
  }
}
