# archive/ — frozen OpenCode-derived core

On 2026-08-18 Mio's OpenCode-derived agent core was retired in favor of a runtime composed on
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). See MIGRATION.md at the
repo root for the decision record and the phased plan.

This directory is **frozen reference code**:

- It is **not** part of the Bun workspace: nothing here is installed, built, linted, typechecked,
  or run by CI.
- Do **not** modify it. Port logic out of it (with its tests) into the new dsh-based packages.
- The full pre-restructure tree is also preserved as git branch `archive/opencode-baseline` and
  tag `opencode-final`.

Contents:

| Path | What it was |
|---|---|
| `packages/agent` | The Effect-based agent runtime (`mio-agent`): 52-layer ManagedRuntime, 109-endpoint HTTP API, tools, sessions, SQLite storage |
| `packages/llm` | Schema-first LLM routing (`@opencode-ai/llm`): protocols (openai-chat / anthropic-messages), MiMo provider, transports |
| `packages/plugin` | The `@opencode-ai/plugin` API surface |
| `packages/http-recorder` | HTTP record/replay used by the archived tests — the format of the MiMo cassettes `packages/runtime`'s composition test replays |
| `script/gen-config-schema.ts` | Schema generator driven by the archived agent |
| `packages/desktop` | The OpenCode-derived Electron app (`@opencode-ai/desktop`), superseded by `packages/shell`. Its renderer embedded the Solid UI tier and its main process spawned the archived agent as a utilityProcess sidecar |
| `packages/app` | The SolidJS renderer (`@opencode-ai/app`) — MiMo UX and 19 locale files; the reference for Phase 3's dsh client plugins |
| `packages/ui` | Shared Solid components, theme, i18n (`@opencode-ai/ui`) |
| `packages/core` | Utilities the Solid tier imported (`@opencode-ai/core`), including the `mimo-catalog.ts` twin — the model facts it carried now live in `packages/runtime/mio.patch.yml` |
| `packages/sdk` | The generated HTTP/SSE client (`@opencode-ai/sdk`) the Solid renderer spoke, and the `createOpencode*` compatibility symbols |
| `packages/llm-mimo` | Mio's own MiMo adapter (`@mio/llm-mimo`), archived 2026-08-22 in Phase 3 Stage 1 once `dsh-llm-pi-ai` was measured to serve MiMo directly. `src/endpoints.ts` is still the endpoint/billing/region reference, and `test/fixtures/recordings` holds the live-captured cassettes copied into `packages/runtime/test/fixtures` |
| `patches/` | `solid-js` and `virtua` patches, used only by the Solid tier |
| `workflows/` | `build-check.yml` and `release.yml` (electron-builder packaging + electron-updater feeds for the old app) and `releasing.md`. Packaging CI returns when `packages/shell` gets its own build — these are kept as the reference for what a release job has to do |

Highest-value porting references — check MIGRATION.md before porting any of them, since several
have since been audited and deliberately rejected:

- `packages/llm/src/providers/mimo.ts` — endpoint/billing/region/auth facts. The port into
  `@mio/llm-mimo` was reversed in Phase 3 Stage 1; these facts now configure `baseURL` in
  `packages/runtime/mio.patch.yml`, and `packages/llm-mimo/src/endpoints.ts` is the fuller table
- `packages/llm/src/protocols/openai-chat.ts` — MiMo multimodal parts, usage breakdown, reasoning turns
- `packages/agent/src/session/llm/tool-repair.ts` — the 4-stage MiMo tool-call repair pipeline.
  **Audited stage by stage on 2026-08-19 and mostly rejected** (two stages were dead code, one is
  dsh-native, one deferred); the one live implementation worth reading is
  `packages/llm/src/protocols/openai-chat.ts:475`, not this file
- `packages/agent/src/session/context.ts` + `processor.ts` — prefix-cache drift detection / cache observability
- `packages/agent/src/provider/provider.ts` — billing/currency/quota logic
- `packages/agent/src/server/routes/instance/httpapi/groups/tts.ts`, `dictation.ts` — MiMo TTS / ASR platform features
- `packages/desktop/src/main/` — shell services the new shell still lacks: `updater.ts`, deep links and
  protocol registration in `index.ts`, `menu.ts`, `shell-env.ts`, and the system-CA / env-proxy
  handling in `sidecar.ts`
- `workflows/build-check.yml`, `workflows/release.yml` — what packaging and release automation has to cover
