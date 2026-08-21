// Interim stand-in for the archived OpenCode agent sidecar bundle
// (virtual:opencode-server). The dsh-based runtime replaces it in Phase 2 —
// see MIGRATION.md at the repo root.
const GONE =
  "Mio's OpenCode-derived agent core has been archived (archive/packages/agent). " +
  "The deepseek-harness runtime is not wired into the desktop shell yet — see MIGRATION.md, Phase 2."

export namespace Log {
  export const init = async (_: { level: string }) => {}
}

export namespace Database {
  export const getPath = (): string => {
    throw new Error(GONE)
  }
  export const Client = (): { $client: never } => {
    throw new Error(GONE)
  }
}

export namespace JsonMigration {
  export type Progress = { current: number; total: number }
  export const run = async (_db: unknown, _opts: { progress: (event: Progress) => void }) => {}
}

export namespace Server {
  export type Listener = { stop(close?: boolean): void | Promise<void> }
  export const listen = async (_: { port: number; hostname: string; cors: string[] }): Promise<Listener> => {
    throw new Error(GONE)
  }
}

export namespace Config {
  export type Info = unknown
  export const get = async (): Promise<never> => {
    throw new Error(GONE)
  }
}

export const bootstrap = (): never => {
  throw new Error(GONE)
}
