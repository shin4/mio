#!/usr/bin/env bun

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const channel = process.env.MIO_CHANNEL ?? "dev"
const version = process.env.MIO_VERSION ?? "local"

const migrationDirs = (
  await fs.promises.readdir(path.join(dir, "migration"), {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isDirectory() && /^\d{4}\d{2}\d{2}\d{2}\d{2}\d{2}/.test(entry.name))
  .map((entry) => entry.name)
  .sort()

const migrations = await Promise.all(
  migrationDirs.map(async (name) => {
    const sql = await Bun.file(path.join(dir, "migration", name, "migration.sql")).text()
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name)
    return {
      sql,
      timestamp: match
        ? Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            Number(match[6]),
          )
        : 0,
      name,
    }
  }),
)

console.log(`Loaded ${migrations.length} migrations`)

await Bun.build({
  target: "node",
  entrypoints: ["./src/node.ts"],
  outdir: "./dist/node",
  format: "esm",
  sourcemap: "linked",
  external: ["jsonc-parser", "@lydell/node-pty", "opencode-web-ui.gen.ts"],
  define: {
    MIO_MIGRATIONS: JSON.stringify(migrations),
    MIO_CHANNEL: `'${channel}'`,
    MIO_VERSION: `'${version}'`,
  },
})

console.log("Build complete")
