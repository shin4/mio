export const DEFAULT_AUTH_USERNAME = "mio"

export function basicAuthHeader(password?: string | null, username = DEFAULT_AUTH_USERNAME) {
  if (!password) return undefined
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}
