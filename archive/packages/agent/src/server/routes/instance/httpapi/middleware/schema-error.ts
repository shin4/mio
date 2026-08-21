import { Effect, Layer } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiError, HttpApiMiddleware } from "effect/unstable/httpapi"
import * as Log from "@opencode-ai/core/util/log"
import { InvalidRequestError } from "../errors"

const log = Log.create({ service: "server" })

// Effect's Issue formatter recursively dumps the rejected `actual` value with no
// truncation, so a 5KB invalid array produces a ~360KB string. Cap to keep 4xx
// responses small and avoid mirroring entire request payloads (which may contain
// secrets) into the response body and log file.
const REASON_LIMIT = 1024
function truncateReason(reason: string) {
  if (reason.length <= REASON_LIMIT) return reason
  return reason.slice(0, REASON_LIMIT) + `… (${reason.length - REASON_LIMIT} more chars)`
}

// A bare `HttpApiError.BadRequest` carries no kind/message, so the best we can attach
// is a generic, non-empty reason (see the note on schemaErrorLayer).
const GENERIC_REASON = "Request did not match the expected schema."

// Emit the documented NamedError shape so the SDK's `wrapClientError` can extract
// `.data.message`. `/api/` routes return the typed InvalidRequestError; legacy routes
// return the `{ name: "BadRequest", data }` envelope.
function toResponse(path: string, message: string, kind?: string) {
  if (path.startsWith("/api/")) return Effect.fail(new InvalidRequestError({ message, kind }))
  return Effect.succeed(
    HttpServerResponse.jsonUnsafe(
      { name: "BadRequest", data: kind === undefined ? { message } : { message, kind } },
      { status: 400 },
    ),
  )
}

// Default Respondable returns an empty 400 body. Match the NamedError shape used by the
// other 4xx/5xx so the SDK's `wrapClientError` extracts `.data.message`.
export class SchemaErrorMiddleware extends HttpApiMiddleware.Service<SchemaErrorMiddleware>()(
  "@opencode/HttpApiSchemaError",
  {
    error: InvalidRequestError,
  },
) {}

// Schema rejections reach this middleware as FAILURES in two forms:
//   1. `HttpApiSchemaError` (params/headers/query decode + response encode): still
//      carries `kind` + `cause.message` (incl. the field path), so emit full detail.
//   2. `HttpApiError.BadRequest`: Effect 4.0.0-beta.66 collapses some payload-decode
//      failures into a content-less BadRequest before app middleware runs (verified at
//      runtime), so the detail is gone — attach a generic non-empty message.
// The built-in `layerSchemaErrorTransform` only handles case 1, leaving case 2 as a bare
// `{"_tag":"BadRequest"}`; this middleware handles both.
export const schemaErrorLayer = Layer.succeed(SchemaErrorMiddleware, (httpEffect, options) =>
  Effect.catch(httpEffect, (error) => {
    if (HttpApiError.HttpApiSchemaError.is(error)) {
      const message = truncateReason(error.cause.message)
      log.warn("schema rejection", { kind: error.kind, reason: message })
      return toResponse(options.endpoint.path, message, error.kind)
    }
    if (error instanceof HttpApiError.BadRequest || (error as { _tag?: unknown })?._tag === "BadRequest") {
      log.warn("schema rejection (no detail available)", { path: options.endpoint.path })
      return toResponse(options.endpoint.path, GENERIC_REASON)
    }
    // Pass non-schema errors through unchanged. The middleware's declared error channel
    // is InvalidRequestError, so the original error type isn't statically assignable;
    // the cast is type-only — at runtime the original error propagates as-is.
    return Effect.fail(error) as unknown as Effect.Effect<never, InvalidRequestError>
  }),
)
