# Mio core replacement: OpenCode → DeepSeek Harness (dsh)

**Decision (2026-08-18):** replace Mio's OpenCode-derived agent core with a runtime composed on
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`@deepseek-ai/dsh`, Cordis
plugin architecture), re-porting the MiMo-specific stack as dsh plugins. The OpenCode core is
frozen under `archive/` (also branch `archive/opencode-baseline`, tag `opencode-final`). Upstream
sync had already been impossible — history was squashed at the fork point with no upstream
remote — so nothing is lost by retiring it.

**UI decision (2026-08-18, same day):** the product UI is **dsh's native web client**
(`dsh-web-frontend`, prebuilt static dist served by the dsh host; ships `zh`/`en` locales), hosted
by a thin Electron shell. No BFF and no renderer port: the Solid UI tier stays in the workspace as
read-only reference until the Phase 2 shell reaches parity, then retires into `archive/` (Phase 4).
MiMo product UX is rebuilt as dsh client UI plugins (React).

**Risk accepted:** dsh is a days-old developer preview (`0.1.0-rc.x`, pinned exact) that warns of
compatibility-breaking changes. Expect churn; keep the pin exact and bump deliberately.

## State after Phase 0 (this change)

| Area | State |
|---|---|
| `archive/packages/{agent,llm,plugin,http-recorder}` | Frozen reference, out of workspace, excluded from lint/CI |
| `packages/{app,ui,core,sdk}` | Kept green (typecheck + lint) as **read-only reference** for MiMo UX/i18n ports; retires in Phase 4 per the UI decision |
| `packages/desktop` | Builds and launches; sidecar resolves to `src/main/server-stub.ts`, which throws with a pointer here — replaced by the thin shell in Phase 2 |
| `packages/runtime` (`@mio/runtime`) | dsh composition: `mio.patch.yml` over the `web` profile; `scripts/setup-profile.ts` provisions the repo-local `.dsh/` profile and installs the plugin as a packed tarball; `bun run dev:runtime` boots green |
| `packages/llm-mimo` (`@mio/llm-mimo`) | Cordis plugin on `ctx.llm` for the `mimo` route: endpoint/billing/region tables, `api-key` auth, per-request settings + credentials resolution, configurable-provider registration, OpenAI-chat SSE → StreamChunk translation, catalog. Typechecks clean; 9 replay tests green |
| dsh pin | `0.1.0-rc.6` (rc.7 blocked by bunfig `minimumReleaseAge`; bump when aged) |

## Phase 1 — MiMo adapter to parity (port from `archive/`)

- [x] Load `@mio/llm-mimo` into a dsh profile — build to `lib/` + packed-tarball install
      (`bun run dev:runtime`); verified enabled in the running runtime's plugin inventory,
      with `llm-deepseek` / `llm-pi-ai` disabled by the patch layer
- [x] Replay tests against real recorded OpenAI-chat SSE from
      `archive/packages/llm/test/fixtures/recordings` (text, tool calls, usage/cache split,
      reasoning, finish mapping, empty-assistant filtering, HTTP error facts)
- [ ] First real MiMo round-trip through `dsh web` (needs `MIO_API_KEY`; text + tool calls)
- [ ] MiMo-specific cassettes: `reasoning_content` turns, multimodal parts, truncation repair
- [ ] Multimodal user parts: audio as data: URL, `video_url` + `fps` / `media_resolution`
      (`archive/packages/llm/src/protocols/openai-chat.ts`); needs dsh `ModelModalityMap` extension
      for audio/video and attachment-service wiring for images
- [ ] 4-stage tool-call repair as an `llm/stream` waterfall listener: schema flattening,
      reasoning scavenging, truncation repair, storm suppression
      (`archive/packages/agent/src/session/llm/tool-repair.ts`)
- [ ] Prefix-cache discipline: stable system prompt + drift hashing + cache-hit observability
      (`archive/packages/agent/src/session/context.ts`, `processor.ts`) — needs a dsh seam for
      prompt-assembly stability; upstream discussion likely
- [x] Settings/credentials seams like `dsh-llm-deepseek`: connection facts resolve per request
      through `installSettingsSection` + `ctx.credentials`, so a changed key/billing/region lands
      on the next request without a restart
- [ ] MiMo quota/upsell error mapping (`archive/packages/agent/src/session/retry.ts`) via
      provider retry policy + error codes
- [ ] Anthropic-messages protocol option (token-plan endpoints expose both)
- [ ] Reasoning-effort exposure via `LlmModelReasoningInfo`

## Phase 2 — thin Electron shell hosting the dsh web UI

- [ ] New thin shell: Electron main spawns the dsh runtime (web profile + `mio.patch.yml`) as a
      child process and loads the local dsh host URL in a BrowserWindow (port pick + auth,
      readiness poll)
- [ ] Carry over the shell services worth keeping: auto-update, `mio://` deep links, native menus,
      window state, shell-env import, system CA / env-proxy propagation (from `main/sidecar.ts`);
      decide the desktop-pet window's fate
- [ ] Retire `server-stub.ts` and the old utilityProcess sidecar path once the wrapper boots;
      restore predev/prebuild around the new spawn path
- [ ] Parity audit against the Solid UI's feature areas: terminal (dsh-terminal + client UI),
      permissions/questions (dsh-user-approval / dsh-interaction), plan mode (dsh-plan-mode +
      client-ui-plan), attachments, model selection — explicit keep/cut list for the rest
      (session revert, worktrees, share, PTY tickets, …)
- [ ] Verify zh locale coverage in real use (dsh ships `LOCALE_IDS = ["zh", "en"]`)

## Phase 3 — MiMo product surfaces and data

- [ ] **MiMo provider card as a dsh client UI plugin** — verified gap: the Models page picks a
      hand-written editor per provider family (`layoutOf()` in `dsh-client-ui-settings-models`
      knows only `llm-deepseek` / `llm-pi-ai`), so third-party routes get a read-only card with
      no API-key input. Until then the key comes from `MIO_API_KEY` / the credentials store.
      Consider an upstream PR making that layout registry extensible
- [ ] MiMo UI as dsh client plugins (React): connection form (billing track / region / key),
      catalog presentation, quota/upsell dialogs, context/cache-usage meter (over
      `ctx.tokenMeter`) — port UX from the archived Solid components (`mimo-connect-form.tsx`,
      `settings-mimo.tsx`, `cache-meter.tsx`, `status-popover-context*`)
- [ ] TTS (9 voices + voicedesign/voiceclone) and dictation (`mimo-v2.5-asr`) rebuilt as dsh
      runtime + client-UI plugins (`archive/packages/agent/.../groups/tts.ts`, `dictation.ts`)
- [ ] Session data: migrate Drizzle/SQLite sessions into dsh's session log, or ship a read-only
      history viewer over the old DB
- [ ] Config bridge: `mio.json(c)` / `.mio/` → cordis.yml patch layers; `MIO_*` env respected
      (`.mimo` legacy stays read-only)
- [ ] MCP parity check (`dsh-mcp-client`) against the archived 8-endpoint MCP surface

## Phase 4 — cleanup

- [ ] Archive the Solid UI tier (`packages/{app,ui,sdk,core}` and the superseded desktop
      main/renderer code) once the Phase 2 shell reaches daily-driver parity; the
      `@opencode-ai/*` package names and `createOpencode*` symbols retire with it
- [ ] Remove `archive/` once ports + replay tests land; the git branch/tag remain the record
- [ ] CI: runtime boot smoke test, adapter replay suite, drop stale allowlists (gitleaks paths)
