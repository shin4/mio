# Mio core replacement: OpenCode → DeepSeek Harness (dsh)

**Decision (2026-08-18):** replace Mio's OpenCode-derived agent core with a runtime composed on
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`@deepseek-ai/dsh`, Cordis
plugin architecture), re-porting the MiMo-specific stack as dsh plugins. The OpenCode core is
frozen under `archive/` (also branch `archive/opencode-baseline`, tag `opencode-final`). Upstream
sync had already been impossible — history was squashed at the fork point with no upstream
remote — so nothing is lost by retiring it.

**UI decision (2026-08-18, same day):** the product UI is **dsh's native web client**
(`dsh-web-frontend`, prebuilt static dist served by the dsh host; ships `zh`/`en` locales), hosted
by a thin Electron shell. No BFF and no renderer port. The Solid UI tier was archived on
2026-08-19 once the shell replaced its only consumer; MiMo product UX is rebuilt as dsh client
UI plugins (React).

**Scope principle (2026-08-19): dsh-native is the mainline.** This version ships dsh's own
behavior wherever dsh has an answer. MiMo-specific code is added only where dsh structurally
cannot serve MiMo (the provider adapter and its wire shaping) — not because the archived runtime
happened to do something. Before building any MiMo-specific capability, check dsh first, and
prefer configuring a shipped plugin over writing one. Ported behavior must justify itself against
dsh's current design, not against the old core.

**Risk accepted:** dsh is a days-old developer preview (`0.1.0-rc.x`, pinned exact) that warns of
compatibility-breaking changes. Expect churn; keep the pin exact and bump deliberately.

## Current state

| Area | State |
|---|---|
| `archive/packages/{agent,llm,plugin,http-recorder}` | Frozen reference, out of workspace, excluded from lint/CI |
| `archive/packages/{app,ui,core,sdk}` | The Solid UI tier, archived 2026-08-19 once the shell replaced its only consumer. Still the reference for MiMo UX and the 19 locale files when Phase 3 builds dsh client plugins |
| `packages/shell` (`@mio/shell`) | The desktop app: spawns the dsh runtime and hosts its web UI. Written from scratch; the OpenCode-derived `packages/desktop` is archived |
| `packages/runtime` (`@mio/runtime`) | dsh composition: `mio.patch.yml` over the `web` profile; `scripts/setup-profile.ts` builds the plugin and copies it into the repo-local `.dsh/` profile; `bun run dev:runtime` boots green |
| `packages/llm-mimo` (`@mio/llm-mimo`) | Cordis plugin on `ctx.llm` for the `mimo` route: endpoint/billing/region tables, `api-key` auth, per-request settings + credentials resolution, configurable-provider registration, OpenAI-chat SSE → StreamChunk translation, catalog. Typechecks clean; 14 replay tests green over live-captured cassettes |
| dsh pin | `0.1.0-rc.6` (rc.7 blocked by bunfig `minimumReleaseAge`; bump when aged) |
| End-to-end | Verified 2026-08-19 against a live MiMo token-plan account: real answers, real tool use, real file writes through the dsh web UI |

## Phase 1 — MiMo provider adapter (dsh-native elsewhere)

- [x] Load `@mio/llm-mimo` into a dsh profile — built to `lib/` and copied into the profile
      (`bun run dev:runtime`); verified enabled in the running runtime's plugin inventory,
      with `llm-deepseek` / `llm-pi-ai` disabled by the patch layer
- [x] **First real MiMo round-trip — verified end to end (2026-08-19)** against a live
      token-plan / cn account. Adapter probe: reasoning + text blocks, tool call
      (`get_weather` → `{"city": "Paris"}`, finish `tool-calls`), tool-result continuation, and
      `cacheReadTokens` on the second turn. Full runtime through the dsh web UI: MiMo answered in
      the composer, drove `Read` → `Write` in a real workspace, and produced the correct file.
      No adapter changes were needed — the wire translation was right first time
- [x] **MiMo cassettes captured from the live API** (`packages/llm-mimo/script/record.ts` →
      `test/fixtures/recordings/`): reasoning+text, tool call, tool-result continuation with cache
      reads, max-tokens truncation, and a 401. The suite now replays real MiMo traffic and no
      longer reads anything from `archive/` — one Phase 4 blocker removed. Cassettes carry no
      credentials (the `api-key` header is never recorded).
      Wire facts the recordings pinned down: MiMo sends explicit `null` for absent delta fields
      *and* for `prompt_tokens_details`; only the first tool-call fragment carries `id`/`name`.
      The adapter already handled all of it — the wire types were tightened to stop implying
      otherwise
- [x] Settings/credentials seams like `dsh-llm-deepseek`: connection facts resolve per request
      through `installSettingsSection` + `ctx.credentials`, so a changed key/billing/region lands
      on the next request without a restart
- [x] **Reasoning-effort exposure via `LlmModelReasoningInfo`** — tiers established by probing the
      live API, not from docs: MiMo accepts `none | low | medium | high` and answers everything
      else (`off`, `minimal`, `xhigh`, `max`) with an opaque HTTP 400, so the adapter validates
      client-side and names the allowed set. Both `mimo-v2.5` and `-pro` expose the same four.
      No adapter default — omitting the field preserves MiMo's own. Verified live: `none` returns
      no reasoning block at all, `high` returns one
- [ ] Anthropic-messages protocol option (token-plan endpoints expose both) — deferred by the
      dsh-native principle; the OpenAI-chat route already reaches every endpoint. Revisit only if
      a capability turns out to be Anthropic-route-only

**Phase 1 is complete for this version.** What remains above is deferred by design, not pending.

### Audited against dsh — NOT ported (2026-08-19)

The archived "4-stage MiMo tool-call repair pipeline" was checked stage by stage against dsh's
shipped code. Only one stage describes a real MiMo defect dsh cannot see, and it is deferred
under the dsh-native principle. Two of the four were dead code in the archive to begin with.

| Archived stage | Verdict | Evidence |
|---|---|---|
| Storm suppression | **Use dsh's** — `dsh-repeat-tool-reminder` is already in the web profile and is strictly better: escalating thresholds (`[3,5,8]`), include/exclude wildcards, bounded argument preview, per-agent scope, advisory rather than vetoing. The archived `StormDetector` had one threshold and an unbounded message. Configure, don't build | `dsh-repeat-tool-reminder` |
| Truncation repair | **Drop** — contradicts dsh's safety policy: `BlockAssembler.blocks()` deliberately filters tool calls out of a `max-tokens` finish ("drops tool calls that cannot be executed safely") and the loop returns early on that finish. The archived stage wanted to bracket-balance partial JSON and execute anyway. It was also dead code (no callers, and `require()` inside ESM) | `dsh-llm` assembler; `dsh-agent-loop` |
| Reasoning scavenging | **Real MiMo gap, deferred** — dsh has no equivalent (it targets DeepSeek models, which do not emit tool calls inside reasoning text). MiMo sometimes writes `<tool_call>{…}</tool_call>` into reasoning instead of the structured channel. Revisit only if the round-trip and cassettes show it actually happening; the live implementation to port is in `archive/packages/llm/src/protocols/openai-chat.ts:475`, not the dead copy in `tool-repair.ts` | — |
| Schema flattening | **Observe first** — dsh has no equivalent (`jsonNormalizeArgs` is lossless-JSON snapshotting, not schema rewriting), but the archived trigger (depth > 2 or > 10 params) fires on almost no shipped dsh tool: the widest is `str_replace_editor` at 8 flat params, the deepest is `todo_write`'s array-of-objects. MCP-supplied tools are the plausible trigger. Add cheap counting before building any rewriting | `dsh-tools`, shipped `dsh-tool-*` schemas |

Other archived MiMo behavior, same audit:

- **Quota / upsell error mapping** — largely dsh-native: `dsh-llm` ships the shared taxonomy
  (`QUOTA`, `CONTEXT_WINDOW_EXCEEDED`, `EMPTY_RESPONSE`, `AUTH`, `RATE_LIMIT`) with detector
  helpers, and `dsh-llm-retry` executes provider-owned retry policy. The adapter only owes
  faithful status/`retry-after`/request-id facts on `LlmError` (already done). A MiMo-branded
  upsell message is UI, not runtime — defer to the client-plugin work.
- **Prefix-cache discipline** — do not port the drift hashing. It worked around the OLD runtime's
  dynamic per-provider prompt selection, a problem dsh does not have: system-prompt sections are
  concatenated in a declared order, tool schemas arrive in canonical order, and volatile context
  (`dsh-time-context`) is opt-in and lands in request history rather than the system prefix.
  Verify cache-hit rates on real traffic instead; `system-prompt/assemble` is the seam if a
  stability guard is ever needed.
- **Cache-hit observability** — dsh-native, now confirmed on real traffic: the session footer
  showed `缓存命中 66%` for a live MiMo turn, fed by the adapter's disjoint usage split. No
  custom cache meter needed in the runtime.
- **Prefix caching itself works without any Mio machinery** — the live session reported rising
  cache-hit rates across turns with dsh's stock prompt assembly, which is the evidence behind
  dropping the archived drift-hashing work above.
- **Multimodal audio/video input** — out of scope this version. dsh's `ModelModalityMap` is
  `text | image`; audio/video would need a modality extension plus attachment wiring. Ship
  text (and image, once verified through dsh's attachment path); revisit audio/video later.

## Phase 2 — thin Electron shell hosting the dsh web UI

- [x] **New thin shell — `packages/shell` (`@mio/shell`), written from scratch (2026-08-19).**
      Electron main spawns the dsh runtime as a child process using Electron's bundled Node
      (`ELECTRON_RUN_AS_NODE`, so no system Node is required), reads the URL back from the
      runtime's own startup line (`--port 0`, so nothing can collide with `dev:runtime`), and
      loads it in a sandboxed window (`contextIsolation`, no `nodeIntegration`, no preload
      bridge). Verified: window loads the dsh UI over HTTP 200, and the runtime child exits with
      the app — no orphan. Shares no code with the archived desktop app.

      Two environment facts this cost real debugging, both documented in `packages/shell/README.md`:
      the runtime child **must** get `--expose-internals` (dsh otherwise needs the
      `node-addon-require-builtin` addon, which is built for Node's ABI and fails under Electron —
      silently breaking plugin resolution and loudly breaking HMR), and `@mio/llm-mimo` must live
      in the same `node_modules` tree as `@deepseek-ai/dsh` (a profile-local install is invisible
      on that fallback path), which is why it is a root dependency and what packaging must
      preserve
- [ ] Carry over the shell services worth keeping: auto-update, `mio://` deep links, native menus,
      window state, shell-env import, system CA / env-proxy propagation (from `main/sidecar.ts`);
      decide the desktop-pet window's fate
- [x] **Archived the old desktop app (2026-08-19)** — `packages/desktop` → `archive/packages/`,
      taking `server-stub.ts` and the utilityProcess sidecar path with it. Its packaging CI
      (`build-check.yml`, `release.yml`) and `docs/releasing.md` moved to `archive/workflows/`,
      since both only build the old app; they stay as the reference for what the new shell's
      release job must cover. All references cleaned: root scripts, ci.yml, gitleaks paths,
      CONTRIBUTING.md. Verified after the move: `bun run dev:desktop` boots the new shell and
      serves the UI, typecheck 6/6, lint clean
- [x] **Plugin provisioning without a package manager (2026-08-19)** — prerequisite for
      packaging, and it corrected a wrong diagnosis. dsh resolves plugin entries **relative to
      the profile directory**, not to its own installation: a virgin `$DSH_HOME` outside the repo
      fails to find `@mio/llm-mimo` no matter what is beside dsh. Installing it is therefore a
      plain copy of the published surface (`package.json` + `lib/`) into
      `profiles/web/node_modules/@mio/llm-mimo`, which dsh scaffolds around and preserves.
      `setup-profile.ts` and the shell's `src/profile.ts` now do exactly that — no pnpm, no
      tarball, no network. The root `@mio/llm-mimo` dependency added on the earlier (wrong)
      diagnosis is removed. Verified from an empty profile on both paths, and from a
      `$DSH_HOME` outside the repo entirely
- [ ] Packaging: electron-builder for the new shell. dsh and the built plugin must be
      `asarUnpack`ed (the startup copy reads the plugin with plain `fs`); `mio.patch.yml` ships in
      resources; the profile itself is created on the user's machine at first launch
- [ ] Carry the still-missing shell services: auto-update, `mio://` deep links, native menus,
      shell-env import, system CA / proxy propagation
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
- [ ] MiMo UI as dsh client plugins (React) — scoped by the dsh-native principle to what dsh
      cannot show: the connection form (billing track / region / key) and MiMo quota/upsell
      dialogs. Usage and cache figures come from dsh's own token-meter surfaces, so no custom
      cache meter unless those prove insufficient. UX reference: the archived Solid components
      (`mimo-connect-form.tsx`, `settings-mimo.tsx`)
- [ ] TTS (9 voices + voicedesign/voiceclone) and dictation (`mimo-v2.5-asr`) as dsh runtime +
      client-UI plugins (`archive/packages/agent/.../groups/tts.ts`, `dictation.ts`) — genuinely
      MiMo-platform features with no dsh equivalent, but not mainline for this version
- [ ] Session data: migrate Drizzle/SQLite sessions into dsh's session log, or ship a read-only
      history viewer over the old DB
- [ ] Config bridge: `mio.json(c)` / `.mio/` → cordis.yml patch layers; `MIO_*` env respected
      (`.mimo` legacy stays read-only)
- [ ] MCP parity check (`dsh-mcp-client`) against the archived 8-endpoint MCP surface

## Phase 4 — cleanup

- [x] **Archived the Solid UI tier (2026-08-19)** — `packages/{app,ui,core,sdk}` moved to
      `archive/packages/`, together with the `solid-js` / `virtua` patches and the opentui
      upgrade script. The `@opencode-ai/*` package names and `createOpencode*` symbols retired
      with them, so no API migration was needed. Root config pruned to match: the workspace
      catalog dropped from 50 entries to 4, `patchedDependencies` and `overrides` are gone, and
      CI is three jobs over three packages. Active workspace is now `runtime`, `llm-mimo`,
      `shell` only
- [ ] Remove `archive/` once ports + replay tests land; the git branch/tag remain the record
- [ ] CI: runtime boot smoke test, adapter replay suite, drop stale allowlists (gitleaks paths)
