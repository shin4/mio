import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { collectPackagingDiagnostics } from "../../script/desktop/collect-packaging-diagnostics.mjs"

void test("failure journals retain Apple diagnostics while excluding credentials and raw files", async () => {
  const root = await mkdtemp(join(tmpdir(), "mio-diagnostics-"))
  try {
    const source = join(root, "runs")
    const destination = join(root, "safe")
    await mkdir(join(source, "run-1"), { recursive: true })
    const secret = 'test-password-"\\\n-private'
    const event = {
      type: "stage-end", success: false, stage: "notarytool:wait:Mio.zip",
      error: `CloudKit -1005 error 68 ${secret} ${encodeURIComponent(secret)} user@example.test`,
      nested: [`http://127.0.0.1/?token=session-private`, "Authorization: Bearer bearer-private"],
    }
    await writeFile(join(source, "run-1", "events.jsonl"), JSON.stringify(event) + "\n")
    await writeFile(join(source, "run-1", "stderr.log"), "raw-secret")
    await writeFile(join(source, "run-1", ".env.macos"), secret)
    await collectPackagingDiagnostics(source, destination, { APPLE_APP_SPECIFIC_PASSWORD: secret, APPLE_ID: "user@example.test" })
    assert.deepEqual(await readdir(join(destination, "run-1")), ["events.jsonl"])
    const result = JSON.parse(await readFile(join(destination, "run-1", "events.jsonl"), "utf8"))
    assert.equal(result.success, false)
    assert.equal(result.stage, event.stage)
    assert.equal(result.error, "CloudKit -1005 error 68 [REDACTED] [REDACTED] [REDACTED]")
    assert.deepEqual(result.nested, ["http://127.0.0.1/?token=[REDACTED]", "Authorization: Bearer [REDACTED]"])
    await collectPackagingDiagnostics(join(root, "absent"), join(root, "empty"), {})
    await writeFile(join(source, "run-1", "events.jsonl"), "raw-secret malformed json")
    await assert.rejects(collectPackagingDiagnostics(source, join(root, "invalid"), {}), {
      message: "Invalid packaging event; refusing to export malformed journal",
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
