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
| `packages/llm-mimo` (`@mio/llm-mimo`) | Cordis plugin on `ctx.llm` for the `mimo` route: endpoint/billing/region tables, `api-key` auth, per-request settings + credentials resolution, configurable-provider registration, OpenAI-chat SSE → StreamChunk translation, catalog. Typechecks clean; 18 replay tests green over live-captured cassettes |
| dsh pin | `0.1.1-rc.1`, bumped 2026-08-21 (both `latest` and `next` upstream). Still a prerelease line — there is no stable `0.1.1` |
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
      `node-addon-require-builtin` addon; it loads under Electron but cannot reach Node's
      internals from Electron's own V8 realm, which breaks plugin resolution and HMR), and
      `@mio/llm-mimo` has to be reachable from the profile dsh actually loads it from. The
      second fact was initially recorded here the wrong way round — as "must live in the same
      `node_modules` tree as `@deepseek-ai/dsh`", which a root dependency appeared to satisfy.
      The plugin-provisioning entry below has the corrected model: resolution is
      profile-relative, and the root dependency is gone
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
- [x] **Packaging — electron-builder, verified by launching the result (2026-08-19).** An
      unsigned macOS build starts, provisions a profile in a fresh `$DSH_HOME`, boots the runtime,
      serves the UI, shows MiMo as configured, and leaves no orphan on quit. Seven distinct
      failures had to be fixed first, and every one of them produced a build that completed
      without a warning and only broke at runtime: incomplete dependency collection from Bun's
      layout, the dsh entry resolving inside `app.asar`, `asarUnpack` covering only scoped
      packages, `directories.app` not redirecting the build, electron's version being
      uninferrable from a production-only tree, npm re-resolving dsh's `^` ranges to an untested
      release, and dsh's runtime peer dependencies not being materialized. The reasoning behind
      each is in `packages/shell/README.md`
- [x] **dsh rc.6 → rc.7 (2026-08-19)** — the first churn rehearsal, and the architecture absorbed
      it with no code change: typecheck clean, 14 replay tests green, a live MiMo request correct,
      and the runtime, the shell, and a packaged build all boot. rc.7 was still 1.3 days short of
      `bunfig.toml`'s 3-day gate, so it was installed with a one-off
      `bun install --minimum-release-age=0`; the policy itself is unchanged, deliberately — the
      gate matters most for the fastest-moving dependency
- [x] **dsh rc.7 → rc.8 (2026-08-21)** — second rehearsal, and the first one to catch a real
      behavior change: since rc.8 the runtime opens the Web UI in the system browser by default,
      which for the shell means a stray second copy of the app on every launch. Fixed by passing
      `--no-open`. Everything else absorbed unchanged (typecheck, 14 replay tests, a live tool
      call, runtime, shell, packaged build). rc.8 adds one plugin —
      `dsh-tool-pwsh-persistent` — and is tagged `next` rather than `latest`; adopted knowingly,
      again with a one-off `--minimum-release-age=0` and the gate left in place.
      The lesson is the cadence: batching several dsh releases would have buried this change
      among dozens of others
- [x] **Cross-platform packaging CI (2026-08-21)** — `.github/workflows/build-check.yml` builds
      one unsigned artifact per runner: macOS arm64, macOS x64, Windows x64, Linux x64. The matrix
      is structural, not stylistic: dsh's native dependencies ship as platform packages that the
      staging step installs for the host, so no flag makes one runner sufficient.
      Three bugs were fixed to make it possible, all found locally rather than by a red CI: the
      electron-builder config hardcoded `["arm64","x64"]` for macOS (overriding the CLI and
      producing an x64 artifact carrying arm64 binaries), the staging step used a Unix-only
      `cp -R`, and `--projectDir` makes `--config` resolve against the staged directory so the
      script's config path never existed.
      CI installs with `--minimum-release-age=0`: the gate in `bunfig.toml` guards *resolution*,
      and CI replays an already-reviewed lockfile — without it every dsh bump leaves CI red for
      days. This was not hypothetical; the rc.8 bump broke the existing jobs
- [x] **The shell keeps watching the runtime after it reports ready (2026-08-21)** — dsh prints
      its URL before the plugin tree finishes loading, so a late failure left the shell holding a
      window pointed at a server that had already exited, with nothing shown. Verified by killing
      the runtime mid-session: the shell now names the exit and shows the runtime's own output.
      This also corrects a claim recorded here earlier: losing `--expose-internals` does not
      silently degrade plugin resolution, it kills the runtime — the silence was the shell's
- [x] **dsh rc.8 → 0.1.1-rc.1 (2026-08-21)** — third rehearsal, absorbed with no code change:
      typecheck, 14 replay tests, a live MiMo request, runtime, shell, and a packaged build all
      clean. Dependency surface identical to rc.8 (62 direct deps, none added or removed), so this
      is an ordinary family bump. Note there is no stable `0.1.1`; `0.1.1-rc.1` is what upstream
      tagged `latest`. It was **3 hours old** when installed — an order of magnitude inside
      `bunfig.toml`'s 3-day gate, which exists for exactly that window. Bypassed knowingly with a
      one-off `--minimum-release-age=0`; the policy is unchanged
- [x] **Signing, notarization, and a release job (2026-08-21).** Less new work than the open item
      claimed: the macOS credentials were still configured in the repo from the old app, which
      shipped signed + notarized four-platform releases through `v0.2.1`, and a local
      `bun run package` was *already* producing a fully signed, hardened build — electron-builder
      found the Developer ID in the keychain by itself, and `codesign --verify --deep --strict`
      passed on all thirteen nested native binaries. What was actually missing was notarization
      (`spctl` said `rejected, source=Unnotarized Developer ID`) and a job to perform it.

      So the work was to make the implicit explicit and wire the release path:
      `resources/entitlements.mac.plist` is checked in rather than inherited from
      electron-builder's bundled template, with the three keys that build was already getting and
      a record of the three the archived app had that are deliberately not carried over;
      `hardenedRuntime`, `entitlements`, `entitlementsInherit`, `gatekeeperAssess`, and `notarize`
      are stated in the config; and `.github/workflows/release.yml` builds the same four-platform
      matrix as `build-check`, signs and notarizes the macOS jobs, and uploads to a draft release
      that a final job publishes.

      One hazard was caught before it shipped: electron-builder resolves the *Windows* signing
      certificate from `WIN_CSC_LINK` falling back to `CSC_LINK`
      (`windowsSignToolManager.cscInfo`), so the archived workflow's habit of passing the Apple
      secrets to every runner would hand a macOS Developer ID certificate to signtool. They are
      scoped to the macOS jobs. Windows signing is wired (`script/sign-windows.ps1`, which
      survived the archiving unreferenced) but inert: the `AZURE_TRUSTED_SIGNING_*` secrets have
      never been configured, so Windows installers are unsigned — as they were before.

      Verified locally, then closed on the real thing: `v0.3.0-rc.1` built all four artifacts,
      and the published macOS DMG was downloaded and checked rather than trusted —
      `spctl -a -t exec` reports `accepted, source=Notarized Developer ID`, `stapler validate`
      finds the ticket, entitlements survive on the app and all four helper apps, and the released
      app boots, spawns the runtime child, serves the dsh UI over HTTP 200, and quits with no
      orphan. That is the gap this item existed for: `rejected / Unnotarized` → `accepted /
      Notarized`.

      `v0.3.0-rc.1` also surfaced a defect it did not fix, corrected in the entry below:
      electron-builder notarizes the `.app` and *then* wraps it, so the **DMG a user actually
      double-clicks carried no ticket**
- [x] **The DMG carries its own notarization ticket (2026-08-22).** `v0.3.0-rc.1` shipped a
      notarized *app* inside an unnotarized *image*: `macPackager.notarizeIfProvided(appPath)` is
      electron-builder's only notarization call and there is no option covering artifacts, so the
      DMG was built after the app was already notarized and stapled.

      This was first written up here as a narrow, online-only problem, and that was wrong. The
      published image was measured while online: `stapler validate` found no ticket, `spctl -a -t
      open` returned `rejected, source=Unnotarized Developer ID`, and Apple's own
      `syspolicy_check distribution` reported a **fatal** "Notary Ticket Missing" — against the app
      inside the same file, which passed every check. Gatekeeper's online lookup cannot rescue it,
      because the image was never submitted: there is nothing to find locally *or* on Apple's
      servers. The first fix recorded here was wrong for the same reason — `stapler staple` alone
      cannot attach a ticket that was never issued.

      So an `afterAllArtifactBuild` hook submits each DMG to `notarytool`, staples it, and
      validates the result, gated on the same credentials as the app notarization so a
      credential-less build still succeeds. A submission that completes as anything but `Accepted`
      fails the build rather than shipping unnoticed, and failures report scrubbed `stderr` — Node
      puts the full argv into an execFile rejection, and the argv holds the app-specific password.

      Verified by driving the hook directly with invalid credentials before spending a CI run: it
      is invoked, non-DMG artifacts are filtered out, a DMG reaches `notarytool`, and the password
      does not appear in the failure message. The packaging config is now covered by
      `bun typecheck`, which it was not when it held no logic

- [ ] Carry the still-missing shell services: auto-update, `mio://` deep links, native menus,
      shell-env import, system CA / proxy propagation. The updater is deferred deliberately, and
      the release job is shaped around that: `publish` stays `null` and no `latest*.yml` is
      emitted, because a feed with no consumer is worse than none — per-arch metadata clobbers
      itself unless a merge step fixes it up (`archive/packages/desktop/scripts/`
      `finalize-latest-yml.ts` is that step, unported). Both come back together
- [ ] Parity audit against the Solid UI's feature areas: terminal (dsh-terminal + client UI),
      permissions/questions (dsh-user-approval / dsh-interaction), plan mode (dsh-plan-mode +
      client-ui-plan), attachments, model selection — explicit keep/cut list for the rest
      (session revert, worktrees, share, PTY tickets, …)
- [ ] Verify zh locale coverage in real use (dsh ships `LOCALE_IDS = ["zh", "en"]`)

## Phase 3 — MiMo product surfaces and data

Planned 2026-08-22 from a survey of the installed dsh 0.1.1-rc.1 tree and the archive. The load-
bearing findings were re-checked adversarially, and several first-pass conclusions did not survive
— where that happened, the correction is recorded with the item rather than quietly dropped.

### Direction change — DeepSeek routes come back (decided 2026-08-22)

`mio.patch.yml` disables `llm-deepseek` and `llm-pi-ai`, and CLAUDE.md states MiMo-first as
settled. **That is superseded: Mio keeps dsh's native DeepSeek compatibility alongside native-level
MiMo support.** This is a product decision, not a discovered constraint, so it is recorded here and
in CLAUDE.md rather than applied as a silent config edit.

Re-enabling is a two-line config change with no technical risk: `llm-deepseek` owns only the
`deepseek-official` route, `llm-mimo` owns `mimo`, nothing collides, and `llm-pi-ai` registers no
routes until settings supply profiles. The one real consequence is a product asymmetry —
`deepseek-official` gets a fully editable Models card while MiMo cannot, for the `layoutOf()`
reason below. **The MiMo card therefore has to land before the routes come back**, or Mio ships a
UI where the competitor configures more easily than the product does.

### The finding that reorders everything

**A fresh Mio install has no in-app way to enter an API key.** Not a rough edge — a functional gap,
verified in the running UI, with both paths closed:

- dsh's Models page picks a hand-written editor per provider family. `layoutOf()` in
  `dsh-client-ui-settings-models` knows only `llm-deepseek` and `llm-pi-ai`, so `llm-mimo` falls
  to `layout === "unknown"`, which renders an advanced-settings hint paragraph **instead of** the
  API-key input and disables the submit button.
- dsh *does* ship a first-run coordinator (the `settings.onboarding` slot + `OnboardingSurface`),
  but its only credential step is hard-wired to `llm-deepseek` — which Mio disables, so no
  onboarding runs at all.

Today the key can only arrive through `MIO_API_KEY` or the credentials store. Onboarding is
therefore not polish; it is the missing half of a shippable product.

### Stage 0 — no dependencies

- [ ] **Set the desktop app icon.** The packaged app currently ships Electron's default icon
      (`default Electron icon is used — application icon is not set` in every build log). A full
      Mio icon set already exists at `archive/packages/desktop/icons/prod/` (`.icns`, `.ico`, all
      Linux PNG sizes) generated from `favicon-v3.svg` — an orange `#FF8A00` MIO wordmark on a
      `#1C1B1A` rounded field. Pure gap-filling, touching no dsh internals
- [ ] Refresh CLAUDE.md: it still describes `packages/desktop` and the Solid tier as active, and
      its test commands point into `archive/`

### Stage 1 — MiMo adapter hardening (the "native-level" half)

Highest priority: these are defects in shipping code, and they need no new infrastructure. Twelve
gaps were confirmed by driving the real adapter against a local server, not by reading it. **Four
report success while losing data:**

- [ ] A **truncated stream is reported as a successful `stop`** with the partial text committed —
      the adapter has no `[DONE]` discipline
- [ ] A **final SSE event without a trailing newline is dropped outright**, losing model output
      with no error
- [ ] A **degenerate empty completion** becomes an empty assistant message instead of dsh's
      retryable `EMPTY_RESPONSE`
- [ ] An **image block in an assistant message is silently erased** from the wire body (the
      user-role case is loudly refused; this one is not)

Compounding them: MiMo never emits `TRANSPORT`, `TIMEOUT`, `QUOTA`, `CONTEXT_WINDOW_EXCEEDED`, or
`MALFORMED_RESPONSE`, and `dsh-llm-retry` matches on exactly
`[EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT]` — so a network blip is a failed turn,
not a retried one.

- [ ] Classify the missing failure codes; a 402 "Insufficient balance" currently surfaces as an
      unclassified error although dsh ships both the code and the detector helper
- [ ] Add a stream idle watchdog — a stalled MiMo stream currently hangs indefinitely
- [ ] Parse `Retry-After` in HTTP-date form; it is dropped today on exactly the rate-limit
      responses where it matters
- [ ] Pass `GenerateOptions.sessionId` / `.purpose` through — compaction and session-title calls
      run at full reasoning cost because they are ignored
- [ ] Fall back to the last good settings snapshot instead of breaking every subsequent request,
      and throw `LlmError` rather than a bare `Error` (code `UNKNOWN`)
- [ ] Decide the Anthropic path: `protocol` is hardcoded to `"openai"` at the one call site, so
      the four `/anthropic` URLs in the endpoint table are dead constants. Either wire it or
      delete them

Three items assumed to be gaps are **not**, because dsh has no such concept: monetary cost/pricing,
structured output, and model discovery (`llm-deepseek` does not implement it either). Prompt
caching is already at parity. Recording this so the list is not re-derived later.

### Stage 2 — client UI plugin foundation (shared prerequisite)

dsh client UI plugins are ordinary npm packages **loaded dynamically at runtime from the profile's
cordis tree**, not bundled into the prebuilt frontend — verified end to end by hand-writing a probe
package, installing it the way `@mio/llm-mimo` is installed, and watching it appear in
`window.__DSH_BOOT__`, get served from `/plugins/<pkg>/client.js`, and render a new Settings page.
Third parties can add UI without forking.

- [ ] **Reproduce the client bundle wrapper.** The build preset that emits dsh's lazy-CJS bundle
      format (`clientBundle` / `packages/client/tsdown.client.ts`) is **not published** — every
      client package's build script is a bare `tsdown` with no shipped config. The loader contract
      (`window.__ModuleLoader__.load({id, factory})`) is fully documented in `dsh-client-modules`'
      README, and a hand-written bundle worked first try. Check the upstream GitHub repo for the
      real plugin before writing our own
- [ ] Ship `@mio/client-ui` as a workspace package, provisioned into the profile by the same
      copy that `setup-profile.ts` and `shell/src/profile.ts` already do for the provider plugin
      — the profile-relative resolution constraint from Phase 2 applies identically

### Stage 3 — onboarding and the MiMo provider card

Closes the gap above. dsh's onboarding chrome does not need rebuilding — only its steps.

- [ ] **First-run wizard** registering into `settings.onboarding`. The archived flow is the UX
      reference: two steps (`welcome` → `configure`) over one shared 392-line component
      (`archive/packages/app/src/components/onboarding/`, `mimo-connect-form.tsx`), gated on the
      derived "does provider `mimo` have a key", inescapable. It collects billing track, region
      (only when token-plan), key, protocol, and default model — exactly what
      `resolveConnection()` needs
- [ ] **Validate the key before accepting it.** The archived form does **not**: no test request,
      no server check, only a non-blocking `sk-` / `tp-` prefix hint. Do not inherit that
- [ ] **MiMo provider card as its own `settings.section` page** (decided 2026-08-22: option (a),
      not an upstream PR). Writes the key through `api.credentials.set`, the same call dsh's own
      card makes. Accepted trade-off: a Mio settings page coexists with dsh's Models page. An
      upstream PR making `layoutOf()` extensible stays on the table but is not the plan — dsh is a
      days-old preview and the patch would have to survive fast churn
- [ ] Note the surface's limit: the onboarding gate is `sessions ready && (no current session ||
      current session blank)`, so it can take over only from the empty state — a user who loses
      their key mid-session cannot be re-prompted there. The settings page is the answer for that
- [ ] i18n: the archive has 18 locales, but **only `en` and `zh` carry any of the 8 `onboarding.*`
      or 45 `provider.mimo.*` keys** — the other 16 silently fall back to English. dsh ships
      `LOCALE_IDS = ["zh", "en"]`, so nothing is lost. CLAUDE.md's "19-locale i18n" is misleading
      for these strings specifically

### Stage 4 — Mio branding

Achievable entirely through supported seams, verified by building a brand plugin, booting the
runtime, and driving it in a browser: the sidebar mark, sidebar wordmark, conversation hero, and
the DeepSeek onboarding dialog were all replaced, and a full-page text sweep of the running app
found zero visible "DeepSeek" strings, with the prebuilt dist untouched.

One first-pass conclusion was **wrong and is corrected here**: "almost no branding lives in the
dist" came from grepping the dist for `deepseek`, which cannot find branding that is artwork,
colour, and copy. The whale artwork and wordmark *are* compiled into
`dsh-web-frontend/dist/assets/index-*.js`, and `favicon.svg`, `manifest.webmanifest`, and
`<title>` are dist files. They are reachable anyway — just by different seams.

- [ ] Replace the brand slot occupants (`dsh-client-ui-brand-official`) by slot shadowing on
      `priority`. dsh documents these slots for exactly this: "deployments may replace the shell's
      fish fallback"
- [ ] Shadow `/favicon.svg` and `/manifest.webmanifest` with named `kind: "exact"` routes, which
      take precedence over the prebuilt dist with zero dist modification
- [ ] **Window title.** `dsh-client-ui-renderer` hardcodes `const productTitle = "DeepSeek
      Harness"` and writes it to `document.title` in a `useEffect`; it is the only occurrence in
      ~200 packages, has no config field, and is not a slot, so it cannot be displaced by an
      occupant. It is still solvable **without a fork** — a ~40-line host plugin using
      `ctx.webServer.tapIndex()` plus the typed `webserver/index-inject` script row, both
      documented, proven live (`document.title === "Mio"`, session-title projection preserved as
      `Refactor the parser — Mio`). An earlier note here recommended solving it in Electron with
      `page-title-updated` + `preventDefault()`; **that is strictly weaker** — it freezes the
      native title, discarding dsh's deliberate `<session> — <product>` projection, and leaves
      `document.title` wrong for `bun run dev:runtime`. Label the plugin a workaround for upstream
      version skew: `dsh-client-web@0.1.1-rc.1` already ships a `DocumentTitle` that honours the
      served `<title>`; the same-version prebuilt dist is simply stale relative to it, so a plain
      `tapIndex` suffices once the dist catches up
- [ ] **Do not miss `welcome-notice`.** Four of the "DeepSeek Harness" strings in
      `dsh-client-ui-settings-models` belong to a second onboarding step (order `-100`) that is
      **not** gated behind the `llm-deepseek` provider — disabling that plugin does not remove
      them
- [ ] Accepted as cosmetic: the design token ramp is named `--dsw-static-deepseek-*`. Values can
      be overridden via `overrideTokens`; the names still leak into DOM inspection

### Stage 5 — re-enable the DeepSeek routes

- [ ] Drop the `disabled: true` rows for `llm-deepseek` and `llm-pi-ai` from `mio.patch.yml`,
      after Stage 3 lands. Update CLAUDE.md's "MiMo-first" wording to match the decision above

### Stage 6 — MiMo ASR and TTS as standalone dsh plugins

**dsh 0.1.1-rc.1 has zero audio capability**: no ASR, no TTS, no audio content block, no audio
attachment kind, no client capture. Its modality vocabulary is `text | image`, its attachment store
is a raster-image store, and the browser wire's prompt part union is a closed `text | image`. This
is net-new surface, not a port.

Scope decided 2026-08-22: **dictation-as-text and TTS-as-playback, shipped as standalone dsh
plugins.** Both deliberately avoid the two hard walls:

1. An out-of-repo plugin must **not** append its own session-event types — persistence refuses to
   read such a log.
2. True multimodal audio *input to the model* needs upstream changes to dsh's `ContentBlockMap`,
   `ModelModalityMap`, attachment store, and the `/api` prompt schema.

Dictation that transcribes in the plugin and writes the transcript into the composer draft, and TTS
that synthesizes host-side and plays in the browser, clear both.

The runtime half is cheap: MiMo's ASR and TTS are **both ordinary `POST {baseURL}/chat/completions`
calls** with the same `api-key` `@mio/llm-mimo` already resolves — no new transport. The archive
carries ~500 lines of runtime code, 260 lines of DSP helpers with existing unit tests, and ~900
lines of Solid UI.

- [ ] **TTS plugin.** Three fixed models (`mimo-v2.5-tts`, `-voicedesign`, `-voiceclone`) selected
      by a `mode` field; text to speak carried in an assistant message; base64 audio read back from
      `choices[0].message.audio.data`. Nine preset voices, a `(唱歌)` singing mode with a
      documented quirk (a leading empty user message is mandatory), voicedesign via natural
      language plus `optimize_text_preview`, and voiceclone passing the reference clip's data URL
      as `audio.voice`
- [ ] **Dictation plugin.** `mimo-v2.5-asr` with an `input_audio` content part plus MiMo's
      `asr_options.language`; capture via `getUserMedia` + PCM16 mono WAV encoding, gated by a
      shared VAD (2s minimum, RMS/peak/active-ms thresholds) that runs on both client and server,
      one data URL per utterance under a 60s / 10MB cap
- [ ] Reuse rather than re-derive: WAV encode/decode, the VAD, the recorder lifecycle, the
      singleton read-aloud player, transcript insertion. MiMo-specific are the model ids, wire
      shapes, singing/audio-tag/design/clone semantics, `asr_options`, the `reasoning_content`
      transcript fallback, and the caps

### Unscheduled (unchanged)

- [ ] Session data: migrate Drizzle/SQLite sessions into dsh's session log, or ship a read-only
      history viewer over the old DB
- [ ] Config bridge: `mio.json(c)` / `.mio/` → cordis.yml patch layers; `MIO_*` env respected
      (`.mimo` legacy stays read-only). Note the residual from PR #7's closure: dsh loads `.env`
      from the working directory, so opening an untrusted repo carries its `.env` into the runtime
      environment
- [ ] MCP parity check (`dsh-mcp-client`) against the archived 8-endpoint MCP surface
- [ ] Minor: `@deepseek-ai/dsh-brand` is a devDependency of `packages/llm-mimo` and is imported
      nowhere — `attributionHeaders` comes from `dsh-llm`

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
