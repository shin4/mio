/** Compare real source bytes with HEAD plus reviewed patches, using a private index. */
import { spawnSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export async function verifyCheckout(checkout, patches, generated = []) {
  const temporary = await mkdtemp(join(tmpdir(), "mio-source-index-"))
  const env = { ...process.env, GIT_INDEX_FILE: join(temporary, "index") }
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: checkout, env, encoding: "utf8" })
    if (result.status !== 0) throw new Error(result.stderr || "Source verification failed")
    return result.stdout
  }
  try {
    git(["read-tree", "HEAD"])
    for (const patch of patches) git(["apply", "--cached", patch])
    const unexpected = [
      ...git(["diff", "--name-only", "-z"]).split("\0"),
      ...git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0"),
    ].filter((file) => file && !generated.includes(file))
    if (unexpected.length) {
      throw new Error(`Unreviewed upstream changes; move them out before building:\n${unexpected.join("\n")}`)
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
