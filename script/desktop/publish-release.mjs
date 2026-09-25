/** Publish only installers from a successful qualification of the current main tree. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"

assert.equal(process.env.GITHUB_ACTIONS, "true")
assert.equal(process.env.GITHUB_REF, "refs/heads/main")
const repository = process.env.GH_REPO
assert.match(repository ?? "", /^[\w.-]+\/[\w.-]+$/)
const runId = process.env.QUALIFICATION_RUN
assert.match(runId ?? "", /^\d+$/)
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" }).trim()
const api = (path) => JSON.parse(gh("api", `repos/${repository}/${path}`))
const run = api(`actions/runs/${runId}`)
assert.equal(run.conclusion, "success", "Qualification must pass on every platform")
assert.equal(run.path, ".github/workflows/release.yml")
assert.equal(run.event, "workflow_dispatch")
assert.equal(run.head_repository.full_name, repository)
assert.match(run.head_sha, /^[a-f0-9]{40}$/)
execFileSync("git", ["fetch", "--no-tags", "origin", run.head_sha], { stdio: "inherit" })
const tree = (ref) => execFileSync("git", ["rev-parse", `${ref}^{tree}`], { encoding: "utf8" }).trim()
assert.equal(tree(run.head_sha), tree("HEAD"), "Qualified source must match the current main tree exactly")
assert.equal(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(), "")

const product = JSON.parse(await readFile("desktop/product.json", "utf8"))
assert.match(product.version, /^\d+\.\d+\.\d+$/)
const lock = JSON.parse(await readFile("desktop/upstream.lock.json", "utf8"))
const tag = `v${product.version}`
const targets = ["mac-arm64", "mac-x64", "win-x64"]
const artifacts = api(`actions/runs/${runId}/artifacts?per_page=100`)
assert.equal(artifacts.total_count, 3)
for (const target of targets) {
  const artifact = artifacts.artifacts.find((item) => item.name === `mio-${target}`)
  assert.ok(artifact && !artifact.expired, `Missing qualified ${target} artifacts`)
}
const directory = ".desktop-build/publication"
await mkdir(directory, { recursive: true })
// This is a fresh checkout; never mix artifacts from an earlier publication attempt.
assert.equal((await readdir(directory)).length, 0)
gh("run", "download", runId, "--dir", directory)
const checksums = []
const evidence = []
const uploads = []
for (const target of targets) {
  const source = join(directory, `mio-${target}`)
  const qualification = JSON.parse(await readFile(join(source, "qualification.json"), "utf8"))
  const record = JSON.parse(await readFile(join(source, "build-record.json"), "utf8"))
  assert.equal(qualification.passed, true)
  assert.equal(qualification.version, product.version)
  assert.equal(qualification.target, target)
  assert.equal(qualification.commit, run.head_sha)
  assert.equal(qualification.upstream, lock.commit)
  assert.equal(record.upstream.commit, lock.commit)
  assert.equal(record.mio.commit, run.head_sha)
  assert.equal(record.mio.dirty, false)
  assert.equal(record.mode, "package")
  assert.equal(record.target, target)
  assert.equal(qualification.signing, target === "win-x64"
    ? "unsigned (explicitly approved)"
    : "Developer ID signed, notarized, stapled, Gatekeeper accepted")
  const names = target === "win-x64"
    ? [`mio-${product.version}-win-x64-unsigned.exe`]
    : [`mio-${product.version}-${target}.dmg`, `mio-${product.version}-${target}.zip`]
  assert.deepEqual(qualification.artifacts.map((item) => item.name).sort(), names.sort())
  for (const artifact of qualification.artifacts) {
    const file = join(source, artifact.name)
    assert.equal((await stat(file)).size, artifact.bytes)
    const hash = createHash("sha256")
    for await (const chunk of createReadStream(file)) hash.update(chunk)
    assert.equal(hash.digest("hex"), artifact.sha256)
    const destination = join(directory, artifact.name)
    await copyFile(file, destination)
    uploads.push(destination)
    checksums.push(`${artifact.sha256}  ${artifact.name}`)
  }
  evidence.push({ ...qualification, build: record })
}
const report = join(directory, `mio-${product.version}-qualification.json`)
await writeFile(report, JSON.stringify({ run: run.html_url, platforms: evidence }, null, 2) + "\n")
const sums = join(directory, "SHA256SUMS.txt")
await writeFile(sums, checksums.join("\n") + "\n")
const notes = `desktop/releases/${tag}.md`
await readFile(notes, "utf8")
// Ref creation is atomic and fails if this version already exists.
assert.match(process.env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/)
gh("api", "--method", "POST", `repos/${repository}/git/refs`, "-f", `ref=refs/tags/${tag}`, "-f", `sha=${process.env.GITHUB_SHA}`)
gh("release", "create", tag, "--draft", "--verify-tag", "--title", `Mio ${tag}`, "--notes-file", notes)
gh("release", "upload", tag, ...uploads, sums, report)
const release = JSON.parse(gh("release", "view", tag, "--json", "isDraft,assets"))
assert.equal(release.isDraft, true)
assert.equal(release.assets.length, 7)
for (const file of [...uploads, sums, report]) {
  const name = file.split("/").at(-1)
  const asset = release.assets.find((item) => item.name === name)
  assert.ok(asset, `Upload missing: ${name}`)
  assert.equal(asset.size, (await stat(file)).size)
}
gh("release", "edit", tag, "--draft=false", "--latest")
console.log(`Published Mio ${tag} from verified qualification ${run.html_url}`)
