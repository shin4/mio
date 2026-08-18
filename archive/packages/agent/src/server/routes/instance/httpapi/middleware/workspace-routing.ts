import { Context, Effect, Layer, Option, Schema } from "effect"
import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { HttpServerRequest } from "effect/unstable/http"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"

// Workspace routing was used for multi-tenant control-plane routing.
// In mimo-desktop (single-user, single-machine) it degrades to a no-op
// HttpApi middleware so callers don't have to be touched.

// Kept optional so handlers can still read ctx.query.directory / workspace
// without us touching all 17 route groups. They're effectively ignored at
// runtime — the only "workspace" mimo-desktop knows about is the local project.
export const WorkspaceRoutingQueryFields = {
  directory: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
} as const

export const WorkspaceRoutingQuery = Schema.Struct(WorkspaceRoutingQueryFields)
export type WorkspaceRoutingQuery = Schema.Schema.Type<typeof WorkspaceRoutingQuery>

type WorkspaceRouteContextValue = { readonly workspaceID: string | undefined; readonly directory: string }

export const WorkspaceRouteContext = Context.Reference<WorkspaceRouteContextValue>(
  "@mimo/WorkspaceRouteContext",
  {
    defaultValue: () => ({ workspaceID: undefined, directory: process.cwd() }),
  },
)
export type WorkspaceRouteContext = WorkspaceRouteContextValue

export class WorkspaceRoutingMiddleware extends HttpApiMiddleware.Service<WorkspaceRoutingMiddleware>()(
  "@mimo/WorkspaceRoutingMiddleware",
  {},
) {}

// Extract the :sessionID from /session/:sessionID/... paths so we can recover
// the request's directory from the session row. Mirrors upstream opencode's
// getWorkspaceRouteSessionID. /session/status has no id.
function sessionIDFromPath(pathname: string): string | undefined {
  if (pathname === "/session/status") return undefined
  return pathname.match(/^\/session\/([^/]+)(?:\/|$)/)?.[1]
}

// Real layer: resolves the request's working directory.
//
// Resolution order matches upstream opencode (`session?.directory ||
// defaultDirectory(...)`): an explicit ?directory= query param wins; otherwise
// recover it from the session referenced in the URL path; only then fall back
// to the server's process.cwd().
//
// The previous mimo stub fell straight back to process.cwd() (the server's
// HOME dir) whenever the caller omitted ?directory=. That single regression
// caused two user-visible bugs: (1) the model was told the wrong working
// directory (home), and (2) the session's live events were emitted/tagged under
// the home-dir key instead of the project dir the open conversation subscribes
// to, so streamed replies never refreshed into the GUI until a reload re-fetched
// them by session id. Recovering session.directory fixes both at the source.
//
// Session.Service is read optionally (serviceOption) and any lookup error is
// swallowed, so this can only ever improve on the old cwd fallback — never fail
// a request.
export const workspaceRoutingLayer = Layer.effect(
  WorkspaceRoutingMiddleware,
  Effect.sync(() =>
    WorkspaceRoutingMiddleware.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        const workspace =
          url.searchParams.get("workspace") ?? request.headers["x-opencode-workspace"] ?? undefined

        // The SDK only rewrites the directory into the ?directory= query for
        // GET/HEAD requests; for POST/PUT/etc (prompt_async, session.create,
        // …) it leaves it in the x-opencode-directory HEADER (see the sdk
        // client.ts rewrite()). The old mimo middleware read ONLY the query
        // param, so every POST lost its directory and fell back to
        // process.cwd() (the server's home dir) — which told the model the
        // wrong cwd AND tagged the session's live events under the home-dir key
        // instead of the project dir the open conversation subscribes to, so
        // replies never streamed into the GUI. Read the header too, then the
        // session row, then cwd (matching upstream's defaultDirectory order).
        let directory: string | undefined =
          url.searchParams.get("directory") ?? request.headers["x-opencode-directory"] ?? undefined
        if (!directory) {
          const sessionID = sessionIDFromPath(url.pathname)
          if (sessionID) {
            const sessions = Option.getOrUndefined(yield* Effect.serviceOption(Session.Service))
            if (sessions) {
              const session = yield* sessions
                .get(SessionID.make(sessionID))
                .pipe(Effect.catch(() => Effect.succeed(undefined)))
              directory = session?.directory
            }
          }
        }

        return yield* effect.pipe(
          Effect.provideService(WorkspaceRouteContext, {
            directory: directory ?? process.cwd(),
            workspaceID: workspace,
          }),
        )
      }),
    ),
  ),
)

export const WorkspaceRoutingMiddlewareLive = workspaceRoutingLayer

export const workspaceRoutingMiddleware = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect
