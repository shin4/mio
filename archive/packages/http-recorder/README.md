# Mio HTTP Recorder

`@opencode-ai/http-recorder` is an internal compatibility-scoped package for
recording and replaying HTTP and WebSocket traffic in Effect tests. It lets
tests exercise real request shapes against deterministic, version-controlled
cassettes without hand-written mocks.

## Quickstart

```ts
import { Effect } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { HttpRecorder } from "@opencode-ai/http-recorder"

const program = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient
  const response = yield* http.execute(HttpClientRequest.get("https://api.example.com/users/1"))
  return yield* response.json
})

Effect.runPromise(program.pipe(Effect.provide(HttpRecorder.cassetteLayer("users/get-one"))))
```

Default `auto` mode replays when a cassette exists and records when it does not.
`CI=true` forces strict replay so missing cassettes fail instead of silently
recording new upstream traffic.

## Modes

| Mode | Behavior |
| --- | --- |
| `auto` | Replay existing cassettes; record missing ones outside CI. |
| `replay` | Strict replay only. |
| `record` | Execute upstream and write the cassette. |
| `passthrough` | Bypass recording entirely. |

## Cassette Safety

Cassettes are source files under `test/fixtures/recordings`. The recorder
redacts common credentials from headers, URLs, and JSON bodies, then scans for
known secret patterns before writing. Unsafe cassettes fail with
`UnsafeCassetteError`.

Use `Redactor.defaults(...)` to customize redaction for provider-specific
payloads.

## Layout

- `effect.ts` - `cassetteLayer` and `recordingLayer`.
- `websocket.ts` - WebSocket record/replay executor.
- `cassette.ts` - file-system and memory cassette services.
- `recorder.ts` - shared record/replay state.
- `redactor.ts` and `redaction.ts` - redaction policy and secret detection.
- `schema.ts` - cassette JSON schemas.
- `matching.ts` - sequential request matching and diagnostics.
