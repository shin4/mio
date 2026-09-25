import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { verifyCheckout } from "../../script/desktop/verify-checkout.mjs"

test("source verification rejects edits beyond and within reviewed patches without changing the real index", async () => {
  const home = await mkdtemp(join(tmpdir(), "mio-checkout-test-"))
  const git = (...args: string[]) => execFileSync("git", args, { cwd: home })
  try {
    git("init", "-q")
    await writeFile(join(home, "source.js"), "original\n")
    await writeFile(join(home, "other.js"), "untouched\n")
    git("add", ".")
    git(
      "-c",
      "user.name=Mio Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    )
    await writeFile(join(home, "source.js"), "reviewed\n")
    const patch = join(home, "reviewed.patch")
    await writeFile(patch, git("diff"))
    const index = await readFile(join(home, ".git/index"))
    await verifyCheckout(home, [patch], ["reviewed.patch"])
    await writeFile(join(home, "other.js"), "unreviewed\n")
    await assert.rejects(verifyCheckout(home, [patch], ["reviewed.patch"]), /other\.js/)
    await writeFile(join(home, "other.js"), "untouched\n")
    await writeFile(join(home, "source.js"), "reviewed\nextra\n")
    await assert.rejects(verifyCheckout(home, [patch], ["reviewed.patch"]), /source\.js/)
    await writeFile(join(home, "source.js"), "reviewed\n")
    await writeFile(join(home, "extra.js"), "injected\n")
    await assert.rejects(verifyCheckout(home, [patch], ["reviewed.patch"]), /extra\.js/)
    await rm(join(home, "extra.js"))
    await verifyCheckout(home, [patch], ["reviewed.patch"])
    assert.deepEqual(await readFile(join(home, ".git/index")), index)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
