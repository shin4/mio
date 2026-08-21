export const MIO_RUN_ID = "MIO_RUN_ID"
export const MIO_PROCESS_ROLE = "MIO_PROCESS_ROLE"
export const OPENCODE_RUN_ID = MIO_RUN_ID
export const OPENCODE_PROCESS_ROLE = MIO_PROCESS_ROLE

export function ensureRunID() {
  return (process.env[MIO_RUN_ID] ??= crypto.randomUUID())
}

export function ensureProcessRole(fallback: "main" | "worker") {
  return (process.env[MIO_PROCESS_ROLE] ??= fallback)
}

export function ensureProcessMetadata(fallback: "main" | "worker") {
  return {
    runID: ensureRunID(),
    processRole: ensureProcessRole(fallback),
  }
}

export function sanitizedProcessEnv(overrides?: Record<string, string>) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  return overrides ? Object.assign(env, overrides) : env
}
