import { basicAuthHeader } from "./auth"

export async function checkHealth(url: string, password?: string | null, doFetch: typeof fetch = fetch) {
  let healthUrl: URL
  try {
    healthUrl = new URL("/global/health", url)
  } catch {
    return false
  }

  const headers = new Headers()
  const authorization = basicAuthHeader(password)
  if (authorization) headers.set("authorization", authorization)

  try {
    const res = await doFetch(healthUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}
