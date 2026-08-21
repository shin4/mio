import path from "path"
import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import os from "os"
import { Context, Effect, Layer } from "effect"
import { Flock } from "./util/flock"
import { Flag } from "./flag/flag"
import { AppInfo } from "./app-info"

const app = AppInfo.id
const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)
const tmp = path.join(os.tmpdir(), app)

const paths = {
  get home() {
    return process.env.MIO_TEST_HOME ?? os.homedir()
  },
  data,
  bin: path.join(cache, "bin"),
  log: path.join(data, "log"),
  repos: path.join(data, "repos"),
  cache,
  config,
  state,
  tmp,
}

export const Path = paths

// One-time migration for the MiMo-Code → Mio rename. The XDG roots moved from
// <base>/mimo to <base>/mio; if a legacy root exists and the new one does not,
// move it so existing sessions, auth, and config carry over on first launch.
// Runs before the mkdir below so the rename targets don't exist yet.
const LEGACY_APP = "mimo"
// Existence-guarded, so it's a no-op once migrated (and if app ever equals the
// legacy id, legacy === dir and the guards below skip).
await Promise.all(
  [data, cache, config, state].map(async (dir) => {
    const legacy = path.join(path.dirname(dir), LEGACY_APP)
    const [exists, legacyExists] = await Promise.all([
      fs.access(dir).then(() => true, () => false),
      fs.access(legacy).then(() => true, () => false),
    ])
    if (!exists && legacyExists) await fs.rename(legacy, dir).catch(() => {})
  }),
)
// The default database file is named after the app id; rename the legacy
// mimo.db (and its WAL/SHM siblings) inside the now-migrated data dir.
await Promise.all(
  ["", "-wal", "-shm"].map(async (suffix) => {
    const from = path.join(data, `${LEGACY_APP}.db${suffix}`)
    const to = path.join(data, `${app}.db${suffix}`)
    const [toExists, fromExists] = await Promise.all([
      fs.access(to).then(() => true, () => false),
      fs.access(from).then(() => true, () => false),
    ])
    if (fromExists && !toExists) await fs.rename(from, to).catch(() => {})
  }),
)

Flock.setGlobal({ state })

await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
  fs.mkdir(Path.repos, { recursive: true }),
])

export class Service extends Context.Service<Service, Interface>()("@opencode/Global") {}

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly bin: string
  readonly log: string
  readonly repos: string
}

export function make(input: Partial<Interface> = {}): Interface {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Flag.MIO_CONFIG_DIR ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    repos: Path.repos,
    ...input,
  }
}

export const layer = Layer.effect(
  Service,
  Effect.sync(() => Service.of(make())),
)

export const defaultLayer = layer

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => Service.of(make(input))),
  )

export * as Global from "./global"
