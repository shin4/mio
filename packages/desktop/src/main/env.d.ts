interface ImportMetaEnv {
  readonly MIO_CHANNEL: string
  readonly MIO_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Resolved by the `mio:virtual-server-module` plugin in electron.vite.config.ts.
// Interim: backed by server-stub.ts until the dsh runtime lands (MIGRATION.md,
// Phase 2) — keep these declarations in sync with that stub.
declare module "virtual:opencode-server" {
  export namespace Log {
    export function init(options: { level: string }): Promise<void>
  }
  export namespace Database {
    export function getPath(): string
    export function Client(): { $client: never }
  }
  export namespace JsonMigration {
    export type Progress = { current: number; total: number }
    export function run(db: unknown, options: { progress: (event: Progress) => void }): Promise<void>
  }
  export namespace Server {
    export type Listener = { stop(close?: boolean): void | Promise<void> }
    export function listen(options: { port: number; hostname: string; cors: string[] }): Promise<Listener>
  }
  export namespace Config {
    export type Info = unknown
    export function get(): Promise<never>
  }
  export function bootstrap(): never
}
