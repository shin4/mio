# Mio core replacement: OpenCode → DeepSeek Harness (dsh)

**Decision (2026-08-18):** replace Mio's OpenCode-derived agent core with a runtime composed on
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`@deepseek-ai/dsh`, Cordis
plugin architecture), keeping the Solid/Electron UI tier and re-porting the MiMo-specific stack
as dsh plugins. The OpenCode core is frozen under `archive/` (also branch
`archive/opencode-baseline`, tag `opencode-final`). Upstream sync had already been impossible —
history was squashed at the fork point with no upstream remote — so nothing is lost by retiring it.

**Risk accepted:** dsh is a days-old developer preview (`0.1.0-rc.x`, pinned exact) that warns of
compatibility-breaking changes. Expect churn; keep the pin exact and bump deliberately.

## State after Phase 0 (this change)

| Area | State |
|---|---|
| `archive/packages/{agent,llm,plugin,http-recorder}` | Frozen reference, out of workspace, excluded from lint/CI |
| `packages/{app,ui,core,sdk}` | Kept and green (typecheck + lint). `sdk` doubles as the API contract any BFF must serve; `core` still feeds UI imports |
| `packages/desktop` | Builds and launches; sidecar resolves to `src/main/server-stub.ts`, which throws with a pointer here — the app UI shows a server error until Phase 2 |
| `packages/runtime` (`@mio/runtime`) | dsh composition: `mio.patch.yml` over the `web` profile (validated with `--dump-config`); `bun run dev:runtime` |
| `packages/llm-mimo` (`@mio/llm-mimo`) | Cordis plugin registering a `MimoAdapter` on `ctx.llm` for the `mimo` route: ported endpoint/billing/region tables, `api-key` auth, OpenAI-chat SSE → StreamChunk translation, catalog (mimo-v2.5 / -pro), typechecks clean |
| dsh pin | `0.1.0-rc.6` (rc.7 blocked by bunfig `minimumReleaseAge`; bump when aged) |

## Phase 1 — MiMo adapter to parity (port from `archive/`)

- [ ] Load `@mio/llm-mimo` into a dsh profile: plugin build step (Node won't type-strip inside
      node_modules) + `dsh plugin add`, or a loader path that resolves the workspace source
- [ ] First real MiMo round-trip through `dsh web` (text + tool calls)
- [ ] Replay tests: port MiMo cassettes from `archive/packages/http-recorder` /
      `archive/packages/llm/test` onto dsh's snapshot-replay harness
- [ ] Multimodal user parts: audio as data: URL, `video_url` + `fps` / `media_resolution`
      (`archive/packages/llm/src/protocols/openai-chat.ts`); needs dsh `ModelModalityMap` extension
      for audio/video and attachment-service wiring for images
- [ ] 4-stage tool-call repair as an `llm/stream` waterfall listener: schema flattening,
      reasoning scavenging, truncation repair, storm suppression
      (`archive/packages/agent/src/session/llm/tool-repair.ts`)
- [ ] Prefix-cache discipline: stable system prompt + drift hashing + cache-hit observability
      (`archive/packages/agent/src/session/context.ts`, `processor.ts`) — needs a dsh seam for
      prompt-assembly stability; upstream discussion likely
- [ ] Settings/credentials seams like `dsh-llm-deepseek` (live key/billing switch without restart);
      token-plan region + billing surfaced in settings
- [ ] MiMo quota/upsell error mapping (`archive/packages/agent/src/session/retry.ts`) via
      provider retry policy + error codes
- [ ] Anthropic-messages protocol option (token-plan endpoints expose both)
- [ ] Reasoning-effort exposure via `LlmModelReasoningInfo`

## Phase 2 — desktop shell onto the dsh runtime

- [ ] Decide the renderer seam: BFF translating the existing `@opencode-ai/sdk` HTTP/SSE contract
      to dsh (keeps the 100k-line UI intact) vs. adopting dsh's web client/wire protocol. Audit the
      app's actually-used endpoint subset first (likely far fewer than the 109 declared)
- [ ] Electron main spawns the dsh runtime (stdio JSON-RPC SDK or `dsh-host-webserver`) instead of
      the archived utilityProcess sidecar; retire `server-stub.ts`, restore predev/prebuild
- [ ] Permissions/questions mapped to `dsh-interaction`/`dsh-user-approval`; terminal to
      `dsh-terminal`; plan mode to `dsh-plan-mode`
- [ ] Feature-gap list with explicit keep/cut calls (session revert, worktrees, share, PTY tickets,
      LSP depth, desktop pet server hooks, …)

## Phase 3 — platform features and data

- [ ] TTS (9 voices + voicedesign/voiceclone) and dictation (`mimo-v2.5-asr`) rebuilt as dsh
      plugins (`archive/packages/agent/.../groups/tts.ts`, `dictation.ts`)
- [ ] Session data: migrate Drizzle/SQLite sessions into dsh's session log, or ship a read-only
      history viewer over the old DB
- [ ] Config bridge: `mio.json(c)` / `.mio/` → cordis.yml patch layers; `MIO_*` env respected
      (`.mimo` legacy stays read-only)
- [ ] MCP parity check (`dsh-mcp-client`) against the archived 8-endpoint MCP surface

## Phase 4 — cleanup

- [ ] Retire `@opencode-ai/sdk` + `createOpencode*` symbols (dedicated API migration), then drop
      `packages/sdk`; fold `packages/core` UI helpers into `packages/ui` or the BFF
- [ ] Remove `archive/` once ports + replay tests land; the git branch/tag remain the record
- [ ] CI: runtime boot smoke test, adapter replay suite, drop stale allowlists (gitleaks paths)
