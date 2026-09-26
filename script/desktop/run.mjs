/** Use the official build/dev/package entry points with Mio's pinned product overlay. */
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile, readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { prepare, root, upstream } from "./prepare.mjs"
import { renderResources } from "./resources.mjs"

const mode = process.argv[2] ?? "build"
const target = process.argv[3]
const unsigned = process.argv[4]
if (!["build", "dev", "start", "package"].includes(mode)) throw new Error("Expected build, dev, start or package")
if (mode === "package" && !["mac-arm64", "mac-x64", "win-x64"].includes(target)) {
  throw new Error("Package target required: mac-arm64, mac-x64 or win-x64")
}
if (unsigned !== undefined && (unsigned !== "--unsigned" || target !== "win-x64")) {
  throw new Error("Only win-x64 supports --unsigned in the upstream release pipeline")
}
await prepare()
const product = JSON.parse(await readFile(join(root, "desktop/product.json"), "utf8"))
const environment = {
  ...process.env,
  DSH_CLIENT_TITLE: product.name,
  DSH_HOME: process.env.MIO_HOME ?? join(root, ".desktop-build", "home"),
  DSH_DESKTOP_USER_DATA_DIR: join(root, ".desktop-build", "electron-user-data"),
  DSH_DESKTOP_OPEN_DEVTOOLS: process.env.DSH_DESKTOP_OPEN_DEVTOOLS ?? "0",
  // No publication delay: dependency identities are controlled by the committed lockfile.
  npm_config_minimum_release_age: "0",
}

async function pnpm(args) {
  await new Promise((resolve, reject) => {
    // Windows pnpm is a command shim. All arguments below are fixed or allowlisted above.
    const child = spawn("pnpm", args, {
      cwd: upstream,
      env: environment,
      stdio: "inherit",
      shell: process.platform === "win32",
    })
    child.once("error", reject)
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pnpm ${args.join(" ")} exited ${code}`))))
  })
}

await pnpm(["install", "--frozen-lockfile", "--config.minimum-release-age=0"])
await renderResources()
if (mode === "package") {
  await pnpm(["--filter", "@deepseek-ai/dsh-desktop", "run", "package", target, ...(unsigned ? [unsigned] : [])])
} else {
  if (mode !== "start") await pnpm(["run", "build"])
  if (mode === "dev" || mode === "start") await pnpm(["run", "start:desktop"])
}
// This records inputs, not a claim that an installer was signed or qualified.
const files = [
  "desktop/product.json",
  "desktop/upstream.lock.json",
  ...(await readdir(join(root, "desktop/patches")))
    .filter((name) => name.endsWith(".patch"))
    .map((name) => `desktop/patches/${name}`),
  ...(await readdir(join(root, "desktop/bundle"))).map((name) => `desktop/bundle/${name}`),
  ...(await readdir(join(root, "desktop/brand"))).map((name) => `desktop/brand/${name}`),
  ...(await readdir(join(root, "desktop/asr"))).map((name) => `desktop/asr/${name}`),
  ...(await readdir(join(root, "desktop/tts"))).map((name) => `desktop/tts/${name}`),
  ...(await readdir(join(root, "desktop/media"))).map((name) => `desktop/media/${name}`),
  ...(await readdir(join(root, "script/desktop"))).map((name) => `script/desktop/${name}`),
  "assets/brand/mio-icon.svg",
  "packages/shell/resources/icon.png",
  "packages/shell/resources/icon.ico",
  "packages/shell/resources/icon.icns",
  relative(root, join(upstream, "pnpm-lock.yaml")),
]
const hashes = Object.fromEntries(
  await Promise.all(
    files.map(async (file) => [
      file,
      createHash("sha256")
        .update(await readFile(join(root, file)))
        .digest("hex"),
    ]),
  ),
)
await writeFile(
  join(root, ".desktop-build/build-record.json"),
  JSON.stringify(
    {
      mode,
      target,
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      upstream: JSON.parse(await readFile(join(root, "desktop/upstream.lock.json"), "utf8")),
      mio: {
        commit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
        dirty: spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout.trim() !== "",
      },
      hashes,
    },
    null,
    2,
  ) + "\n",
)
