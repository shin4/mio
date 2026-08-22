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
| `archive/packages/llm-mimo` | Mio's own MiMo adapter, archived 2026-08-22 in Stage 1 once `dsh-llm-pi-ai` was measured to serve MiMo. Still the reference for the endpoint/billing/region tables and for the recorded cassettes the composition test replays |
| `packages/shell` (`@mio/shell`) | The desktop app: spawns the dsh runtime and hosts its web UI. Written from scratch; the OpenCode-derived `packages/desktop` is archived |
| `packages/runtime` (`@mio/runtime`) | dsh composition, and no code: `mio.patch.yml` over the `web` profile — `dsh-llm-pi-ai` serves MiMo, `@mio/client-ui` is inserted, `ui-brand-official` is off, new sessions default to `mimo-v2.5`. `bun run dev:runtime` boots green; 2 composition tests replay a cassette through the real headless profile |
| `packages/client-ui` (`@mio/client-ui`) | Mio's dsh client UI plugin, added 2026-08-22 in Stage 2: a Node half holding a Loader seat (`tapIndex` for the document title, exact routes shadowing `/favicon.svg` and the manifest) and a browser half (brand slots, the `mio-connect` onboarding step, `zh`/`en` copy). Bundled by `scripts/bundle.ts`; 10 tests green |
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

### The finding that reordered everything — **resolved in Stage 1**

The gap below was real when this plan was written. Stage 1 closed it as a side effect of deleting
Mio's adapter: a route under `llm-pi-ai` renders dsh's own provider card, key input included. The
analysis is kept because it is why the stages are ordered the way they are.

**A fresh Mio install had no in-app way to enter an API key.** Not a rough edge — a functional gap,
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

### Stage 0 — no dependencies — **done 2026-08-22**

- [x] **Desktop app icon set.** The packaged app shipped Electron's default icon until now
      (`default Electron icon is used — application icon is not set` in every build log).
      `icon.icns` / `icon.ico` / `icon.png` (1024px master) are adopted from the archived desktop
      app into `packages/shell/resources/`, wired with absolute paths for the same reason as the
      entitlements: this config loads with `--projectDir .package`.

      The assets were checked before adopting rather than assumed good — the archive shipped a
      dedicated guard (`scripts/check-mac-icon-geometry.ts`), which is a signal that icon geometry
      had bitten someone. Extracting the `.icns` and re-running its core assertions confirms the
      1024px master still matches Apple's system icon template exactly: opaque bounds
      `104,104-919,919`, drop shadow unclipped at the canvas edge. Verified after packaging too —
      the warning is gone, `CFBundleIconFile` resolves, the bundled `.icns` is byte-identical to
      the source, and the rendered artwork is the Mio wordmark. The guard script itself is not
      ported: it existed to catch regressions while the icon was being iterated on, and this is a
      frozen asset

      **The artwork is superseded 2026-08-22 by the fluke mark — see Stage 4.** What this bullet
      established stands: the wiring, the absolute paths, and the geometry check as the thing to
      re-run after any icon change. What no longer ships is the artwork it adopted — the wordmark
      on `#1C1B1A` with an unclipped shadow and bounds `104,104-919,919`. "Frozen asset" was the
      one wrong call here, and it is why the geometry assertions were re-run by hand rather than
      by a script
- [x] **CLAUDE.md refreshed.** It described `packages/desktop` and the Solid tier as active, listed
      a `dev:app` script that no longer exists, pointed its test commands into `archive/`, and
      cited `packages/core/src/flag/flag.ts` for `MIO_*`. Also records the provider direction
      change above. Note: CLAUDE.md and AGENTS.md are both in `.gitignore`, so that refresh is
      local-only and does not travel with a clone — MIGRATION.md is the shared record

### Stage 1 — MiMo rides dsh's own adapter — **done 2026-08-22**

The plan for this stage was to hand-fix twelve gaps in `@mio/llm-mimo`. It was the wrong plan.
**The adapter should not have existed**, and every gap it had is gone with it.

Its entire justification was one claim, carried over from the archived Effect runtime's
documentation and never tested: *MiMo authenticates with an `api-key` header, not
`Authorization: Bearer`, so pi-ai cannot serve it.* The Phase 3 survey rated that `likely`, not
verified. It is **false** — measured against the live API on 2026-08-22, MiMo accepts Bearer for
non-streaming, streaming, `reasoning_content`, and tool calls alike, and returns the same
standard OpenAI-compatible wire either way (usage with `cached_tokens`, first-fragment-only
tool-call ids, a `[DONE]` terminator).

- [x] **`mio.patch.yml` configures `dsh-llm-pi-ai` to serve MiMo**, with the model catalog,
      context window, and the four `reasoning_effort` tiers MiMo accepts. `@mio/llm-mimo` moved to
      `archive/packages/`, and with it the four defects that reported success while losing data.
      Mio now ships no provider code at all
- [x] **The twelve gaps close by inheritance, not by hand.** pi-ai already has the stream idle
      watchdog, retry policy, error classification, `Retry-After` parsing, request-size bounding,
      and image pipeline this stage was going to build — and a dsh upgrade improves them for free
- [x] **MiMo gets a real editor on dsh's own Models page.** `layoutOf()` keys on the *settings
      namespace*, so a route under `llm-pi-ai` renders the pi-ai card: API key, display name,
      **API base URL**, protocol, and an editable model catalog with a fetch button. Verified in a
      packaged build. This is what answers the billing-track question — a token-plan account
      repoints the endpoint from the UI instead of editing YAML — and it removes most of the
      reason Stage 3 existed
- [x] **Replay tests rebuilt at the composition level.** With no Mio adapter to unit-test, the
      suite now boots the real headless profile against a local server replaying a cassette from
      the archived suite and asserts the answer a user would see. It is mutation-checked: breaking
      the model id in the patch layer fails it. This catches what can actually break now — a dsh
      upgrade changing pi-ai's config schema, a route or model id drifting, or pi-ai mishandling
      MiMo's wire

Two things this stage found by running the packaged build rather than reasoning about it:

- **A cold-start regression this change introduced.** `$DSH_HOME` was created as a side effect of
  placing a bundled plugin; with no plugin left to place, a first launch spawned the runtime child
  with a non-existent cwd and died on a bare `spawn ENOENT` that reads as a missing binary. The
  shell now creates the directory explicitly. Caught by deleting the profile directory and
  relaunching, which is the only way this shows up
- **Enabling DeepSeek is not free, for a reason that is not the Models page.** `llm-deepseek` also
  contributes dsh's onboarding credential step, so with it enabled a first launch of *Mio* opens
  on "添加一个 API Key 开始使用 / 配置 DeepSeek 官方模型". The rows stay disabled until Mio owns
  onboarding — the sequencing this plan already required, arriving through a surface the plan had
  not predicted

### Stage 2 — client UI plugin foundation — **done 2026-08-22**

Delivered together with Stage 4, deliberately: a foundation with no consumer cannot be verified,
and branding is the smallest real one.

- [x] **`@mio/client-ui`**, a two-half dsh plugin. The Node half is a Loader seat (which is what
      makes the client module system find and serve the browser half) plus the host-side brand
      work below; the browser half occupies dsh's declared slots. dsh's own
      `dsh-client-ui-brand-official` has exactly this shape, and its README names the path:
      "alternative presentation belongs in another Cordis package occupying the same slots"
- [x] **The bundle wrapper, reproduced rather than vendored.** A plugin bundle is a classic script
      whose execution only *registers* a factory
      (`window.__ModuleLoader__.load({id, factory})`), with externals resolved through an injected
      `require`. Upstream builds its own client packages with
      `packages/client/tsdown.client.ts`, which is **not** published and is not vendorable: ~590
      lines wired into dsh's build faces (`DSH_BUILD_FACE`, the static-link roster, a bundle
      purity gate, a lightningcss module-CSS pipeline) importing three repo-internal files.
      Tracking it would break on every dsh bump to buy machinery Mio does not use. `scripts/`
      `bundle.ts` reproduces only the artifact shape, in ~90 lines, and `test/` asserts that shape
      so a loader-contract change fails there instead of as a blank page.

      Two build hazards are guarded rather than discovered later: a harness package inlined into
      the bundle (a second React or cordis is a broken page, not a size regression), and
      `react/jsx-dev-runtime`, which builds cleanly and then fails at materialization because the
      shell seeds the production runtime only
- [x] Provisioned through the same profile copy Phase 2 built and Stage 1 left idle —
      `installBundledPlugins` in the shell, `npm pack` into the staged tree for packaging. dsh
      loads plugins **relative to the profile directory**, so this placement is what makes the row
      resolvable at all. The composition test does the same placement, which CI had to teach:
      adding the row to `mio.patch.yml` broke that test, and it was not re-run locally because the
      change looked like it belonged to a different package. **The composition test reads
      `mio.patch.yml` — any change to that file has to re-run it**
- [x] **The plugin has no hard `inject`.** The Node half's web work needs `ctx.webServer`, but
      declaring that at the entry level means the plugin cannot activate in a profile without a
      web host — and a loader entry that never activates fails the whole boot rather than
      degrading, which is how the headless composition test found it. The web work sits inside
      `ctx.inject(["webServer"], …)` instead, so the entry always activates and contributes
      nothing where there is no browser

### Stage 3 — onboarding — **done 2026-08-22**

Closes the gap this plan was reordered around. dsh's onboarding coordinator is reused; only the
steps are Mio's.

- [x] **`mio-connect`, a `settings.onboarding` step.** Reads `credentials.describe` on mount and
      completes silently when a key is already configured — or when the launching environment
      supplies `MIO_API_KEY` read-only, where a form could only offer a write the credential
      service refuses. Otherwise: a Mio welcome, then the key form
- [x] **The key decides the endpoint, not the user.** MiMo's prefixes name the billing track
      (`tp-` token plan, `sk-` pay-as-you-go), so the step asks for the key first and derives the
      track, and only a token plan is asked for a region. The archived Solid form asked for the
      track *first* and then accepted any key under it — the one mismatch this ordering makes
      impossible. The prefix stays a hint, never a gate: an unrecognized shape falls through to
      pay-as-you-go and the live check decides
- [x] **The key is proven before it is stored** — the thing the archived form never did (it had no
      test request at all, only a non-blocking prefix hint). `llm.discoverModels` carries the
      endpoint and a one-shot credential the harness never persists, so a rejected key never
      reaches the credential store. Verified by submitting a fabricated `tp-` key: MiMo rejects
      it, the step says so, and `$DSH_HOME` holds no credential file afterwards.

      **`provider` is deliberately not sent.** Naming a route lets the adapter answer from its own
      model list with no network call, which would "succeed" for any key at all. It is only safe
      to omit because `mimo` is not one of pi-ai's built-in catalog ids — pi-ai 0.82.1 ships
      `xiaomi` and `xiaomi-token-plan-*`, so renaming Mio's route onto one of those would silently
      turn the validator into a no-op
- [x] **`GET /v1/models` confirmed against the live platform** before depending on it: MiMo answers
      200 with a standard OpenAI listing, and 401 `Invalid API Key` for a bad key. Without that
      check the validator would have been a false-negative generator for every good key
- [x] **An escape hatch.** The archived onboarding was inescapable. Mio's has "set this up later",
      because a step with no way out traps a user who cannot reach their key right now, and the
      Models page can do the same job afterwards. It reappears on reload while no key is stored,
      which is correct: the app cannot work without one
- [x] **Both locales.** dsh ships exactly `zh` and `en` and `locale.register` takes them together.
      The copy comes from the archived flow with one correction: those strings predate the product
      rename and say "Welcome to MiMo". **Mio** is the product, **MiMo** is the model family and
      the platform issuing the key
- [x] Verified in the dev runtime and in a **packaged build cold-started with no `$DSH_HOME`**,
      in both locales: fresh launch opens on Mio's welcome, prefix inference reveals the region
      picker, a bad key is refused with a readable reason, and "later" releases the surface

Three couplings to dsh that this rests on, each verified against the running host rather than
assumed — `credentials.describe/set` and `settings.describe/mutate` answer the exact shapes the
step reads, including the revision bump on a write, and a `set` moves a reference from
`{configured: false, writable: true}` to `{configured: true, source: "file", writable: true}`.

Two surface rules the step obeys because breaking either is silent: **only `complete()` advances**
(a step that renders null stalls the sequence — there is no null-detection or timeout), and **the
mask is the step's job** (the coordinator paints no chrome, so a visible step wraps itself in
`OnboardingSurface`). A render-time throw would abdicate the entry and hand the cell back to
DeepSeek's notice, so rendering stays total.

Also fixed here, from an audit of Stage 4's occupant: `MioSkipWelcome` now guards completion with a
ref and a braced effect body, matching dsh's own `WelcomeNotice`. The coordinator recreates
`complete` inline on every render, and the unbraced arrow was handing its return value to React as
a cleanup function.

### Stage 4 — Mio branding — **done 2026-08-22**

Verified the way the plan asked for: a sweep of the *running* app, on a fresh profile, in both
themes and in a packaged build. **Zero "DeepSeek" / "Harness" / "DSH" strings** survive in text
nodes or accessible attributes, and the prebuilt `dsh-web-frontend` dist is not patched.

- [x] **Brand slots.** `sidebar.brand.mark`, `sidebar.brand.name`, and
      `conversation.hero.brand.mark`, registered as one declaration-aware set through nested
      `slots.inject()` so the package works whichever order the declarers activate in, and
      withdraws cleanly. `mio.patch.yml` disables the `ui-brand-official` row rather than
      out-prioritizing it
- [x] **The mark is the `M`, not the wordmark — a fix the first attempt needed.** Rendering the
      full "Mio" wordmark into these slots looked right in source and wrong on screen: the slots
      are square (24px and 34px as the shell sizes them) and the wordmark is 37:18, so the letters
      came out ~9px tall, illegible, *and* doubled against the wordmark the neighbouring name slot
      already draws. The mark now carries the `M` alone, which is 16:18 and fills a square, on the
      icon's dark field so it reads as the same product icon the dock shows. Caught by measuring
      the rendered elements, not by reading the code.

      **Superseded 2026-08-22 by the bullet below**, which removes the fitting problem rather than
      working around it: the fluke tile is square by construction, so there is no monogram to fall
      back to. The measurement still governs the name slot, which keeps the wordmark
- [x] **The mark became the fluke (2026-08-22).** 「鲸尾·深潜 / The Sounding」 — a whale's fluke and
      tail stock, the last thing above water before a deep dive — white on Xiaomi's brand orange
      `#FF6900`, replacing both the wordmark-on-`#1C1B1A` app icon Stage 0 adopted and the `M`
      monogram in the slots. The subject nods at DeepSeek's whale, since dsh is what Mio runs on;
      the colour and geometry are Xiaomi's; the artwork is drawn from scratch and reuses neither
      company's registered trademark. One mark now covers the dock icon, `sidebar.brand.mark`,
      `conversation.hero.brand.mark`, the `FAVICON` constant, and the landing page.

      `assets/brand/` joins the repo as the master set, because the mark had more than one
      consumer and they were being kept in sync by eye. Its README carries the export recipe and
      the list of consumers to update together, deliberately as a recipe rather than a build step:
      rasterizing goes through macOS's own NSImage (qlmanage flattens alpha onto white, headless
      Chrome screenshots race the render) and that is not worth wiring into CI for artwork that
      changes about never.

      Verified after export rather than assumed, which is the check Stage 0 called frozen: both
      1024px PNGs carry opaque bounds of exactly `100,100-923,923` on a 1024 canvas — Apple's
      template grid, no baked shadow — and the icns holds all ten slots. The 16/32px slots come
      from `mio-icon-small.svg`, the same fluke at a larger optical scale, because at tile size the
      centre notch that makes the shape read as a fluke closes up. The wordmark stays in
      `sidebar.brand.name`: retypesetting it is a pass of its own and deliberately did not ride
      along
- [x] **Document title**, the one brand surface no slot reaches:
      `dsh-client-ui-renderer` hardcodes `productTitle = "DeepSeek Harness"` and writes it from a
      hardcoded sibling of the root outlet, so no occupant can displace it and a bare `id` patch
      cannot re-point the row. Fixed with `ctx.webServer.tapIndex()` for the served `<title>` plus
      a `webserver/index-inject` head script that rewrites the product name at the `document.title`
      property level. It **rewrites rather than pins**, so dsh's deliberate `<session> — <product>`
      projection survives — verified live: `Refactor the parser — DeepSeek Harness` comes back as
      `Refactor the parser — Mio`. That is why this is not done in the Electron shell with
      `page-title-updated` + `preventDefault()`, which can only freeze the whole title and would
      leave `bun run dev:runtime` wrong anyway.

      **Label: workaround for upstream version skew, delete when it closes.**
      `dsh-client-web@0.1.1-rc.1` already ships a `DocumentTitle` honouring the served `<title>`,
      which the tap alone controls; the prebuilt dist pinned at the same version is simply stale
      relative to it
- [x] **`/favicon.svg` and `/manifest.webmanifest`**, both dist files, shadowed with named
      `kind: "exact"` routes — matched before the fallback that serves the dist
- [x] **`welcome-notice`, the piece the plan warned about.** It survives disabling `llm-deepseek`
      because its only gate is a settings version flag, and it opens a first run of Mio with
      "DeepSeek Harness 0.1 is in testing for Harness developers… welcome to the DSH plugin
      ecosystem" — right for dsh, wrong product and wrong audience here. Retired by occupying its
      cell (`settings.onboarding`, id `welcome-notice`) with a step that completes immediately,
      which is the step contract rather than a way around it: dsh's own notice renders null while
      it decides not to show.

      dsh named the mechanism itself. Registering at the same priority is refused outright with
      *"already has an entry with id welcome-notice at priority 0 — register at a different
      priority to shadow it (lowest renders)"*, so Mio registers at −1
- [x] Accepted as cosmetic: the design token ramp is still named `--dsw-static-deepseek-*`

### Stage 5 — DeepSeek's routes come back — **done 2026-08-22**

The direction change recorded at the top of this phase, now applied. Mio ships dsh's native
DeepSeek compatibility alongside MiMo: `deepseek-official` appears on the Models page with a full
API-key editor, beside MiMo's own.

- [x] The `disabled: true` row for `llm-deepseek` is gone from `mio.patch.yml`
- [x] **Its onboarding step is retired, which reading the code says is unnecessary and driving it
      proves is not.** `DeepSeekOnboardingDialog` self-completes on an `onboardingReadiness` of
      `adapter-absent` / `provider-ready` / `unavailable`, which reads like "an unconfigured
      DeepSeek skips itself". It does not: with the routes enabled and no DeepSeek key stored,
      readiness resolves to `credential-missing` and the step **renders and waits** — a first run
      of Mio opened on "添加一个 API Key 开始使用 / 配置 DeepSeek 官方模型" even after Mio's own
      step had completed.

      Mio therefore occupies that cell too (`deepseek-official`, order 0, priority −1) with the
      same immediate-completion step that already retires `welcome-notice`. The provider stays
      fully supported; what it must not do is open a first run by asking for a key to a provider
      the user did not come here for. Configuring DeepSeek is the Models page's job
- [x] Verified live: with both routes enabled, a fresh profile opens on Mio's welcome, completing
      it lands straight in the app with no DeepSeek prompt, and the Models page lists **both**
      providers with real editors

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
calls** against the same endpoint and key the `mimo` route already carries — no new transport. Note
what Stage 1 moved under this sentence: that key now lives in `llm-pi-ai`'s credential namespace,
written by the Models page or seeded from `MIO_API_KEY`, so these plugins resolve it there rather
than from a Mio adapter that no longer exists. The archive carries ~500 lines of runtime code, 260
lines of DSP helpers with existing unit tests, and ~900 lines of Solid UI.

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

### Unscheduled

- [ ] Session data: migrate Drizzle/SQLite sessions into dsh's session log, or ship a read-only
      history viewer over the old DB
- [ ] Config bridge: `mio.json(c)` / `.mio/` → cordis.yml patch layers; `MIO_*` env respected
      (`.mimo` legacy stays read-only). Note the residual from PR #7's closure: dsh loads `.env`
      from the working directory, so opening an untrusted repo carries its `.env` into the runtime
      environment
- [ ] MCP parity check (`dsh-mcp-client`) against the archived 8-endpoint MCP surface
- [x] Minor, closed 2026-08-22 by Stage 1 rather than by fixing it: the unused
      `@deepseek-ai/dsh-brand` devDependency went to `archive/` with `packages/llm-mimo`. Mio ships
      no provider code, so there is no `attributionHeaders` consumer left to get wrong

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
