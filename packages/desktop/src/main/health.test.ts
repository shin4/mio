import { describe, expect, test } from "bun:test"

import { checkHealth } from "./health"

describe("checkHealth", () => {
  test("uses the Mio default auth username", async () => {
    let authorization = ""
    const ok = await checkHealth("http://127.0.0.1:4096", "secret", async (_url, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? ""
      return new Response(null, { status: 200 })
    })

    expect(ok).toBe(true)
    expect(authorization).toBe(`Basic ${Buffer.from("mio:secret").toString("base64")}`)
  })
})
