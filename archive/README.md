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
| `packages/http-recorder` | HTTP record/replay used by the archived tests — its MiMo cassettes seed the Phase 1 replay tests |
| `script/gen-config-schema.ts` | Schema generator driven by the archived agent |

Highest-value porting references (MIGRATION.md, Phase 1):

- `packages/llm/src/providers/mimo.ts` — endpoint/billing/region/auth facts (already ported to `@mio/llm-mimo`)
- `packages/llm/src/protocols/openai-chat.ts` — MiMo multimodal parts, usage breakdown, reasoning turns
- `packages/agent/src/session/llm/tool-repair.ts` — the 4-stage MiMo tool-call repair pipeline
- `packages/agent/src/session/context.ts` + `processor.ts` — prefix-cache drift detection / cache observability
- `packages/agent/src/provider/provider.ts` — billing/currency/quota logic
- `packages/agent/src/server/routes/instance/httpapi/groups/tts.ts`, `dictation.ts` — MiMo TTS / ASR platform features
