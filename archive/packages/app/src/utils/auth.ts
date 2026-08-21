import { decode64 } from "@/utils/base64"

export const DEFAULT_AUTH_USERNAME = "mimo"

export function authTokenFromCredentials(input: { username?: string; password: string }) {
  return btoa(`${input.username ?? DEFAULT_AUTH_USERNAME}:${input.password}`)
}

export function authFromToken(token: string | null) {
  const decoded = decode64(token ?? undefined)
  if (!decoded) return
  const separator = decoded.indexOf(":")
  if (separator === -1) return
  return {
    username: decoded.slice(0, separator) || DEFAULT_AUTH_USERNAME,
    password: decoded.slice(separator + 1),
  }
}
