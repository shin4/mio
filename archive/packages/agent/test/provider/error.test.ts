import { describe, expect, test } from "bun:test"
import { APICallError } from "ai"
import { ProviderError } from "../../src/provider/error"
import { ProviderID } from "../../src/provider/schema"

describe("ProviderError", () => {
  test("uses MiMo CLI wording for gateway HTML authentication failures", () => {
    const result = ProviderError.parseAPICallError({
      providerID: ProviderID.make("mimo"),
      error: new APICallError({
        message: "Unauthorized",
        url: "https://api.example.test/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 401,
        responseHeaders: { "content-type": "text/html" },
        responseBody: "<html><body>blocked</body></html>",
        isRetryable: false,
      }),
    })

    expect(result.message).toContain("mio auth login")
    expect(result.message).not.toContain("opencode auth login")
  })
})
