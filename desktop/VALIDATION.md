# Desktop implementation validation — 2026-09-25

Environment: macOS arm64, Node 24.18.0, pnpm 11.7.0.
Upstream: `dsh-v0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`.

## Passed locally

- Pristine upstream full build, then full Mio build through `node script/desktop/run.mjs build`.
  The final build includes upstream host/client compilation, native addon, Web and Electron bundles.
- Fixed-source patch application and reverse-check in a fresh temporary tree; repeated prepare is idempotent.
- Frozen pnpm installation; the only lock additions are the two local Mio packages and Host dependency.
- Product and brand npm tarballs contain their declared files and LICENSE; brand Cordis peer packs to `~4.0.4`.
- Six integration tests (`cd desktop && node --test test/*.test.ts`): recorded answer, provider error,
  tool continuation, truncated response, explicit thinking-off request, and real Web/welcome RPC composition.
- `oxlint script/desktop desktop`: zero warnings/errors. Both repository and patched source `git diff --check` pass.
- Actual Electron development startup and repeated startup; upstream office-runtime dependency/round-trip checks pass.
- Native welcome at 600×700: Chinese and English, Mio mark, connection entry, empty-key disabled state,
  malformed environment-assignment rejection, Token Plan region selection, PAYG hides region,
  return and skip. SVG decode and settled foreground colors checked; controls fit the window.
- Main window at 1280×820: Mio sidebar and hero slots, default MiMo V2.6 Flash, Chinese/light and
  English/dark presentation, official language/theme settings. No page overflow observed.
- Official model menu offers Default (reset), Off and High; adapter metadata exposes only off/high.
  Requests use `thinking.type`, with no `reasoning_effort` field.
- Test application exits through Electron `app.quit()`; the wrapper receives a successful exit.

The first UI check exposed a missing brand plugin caused by mounting a composition bundle as
its own plugin. Splitting out `@mio/brand` fixed it; the Web integration test now checks discovery.

## Live CN Token Plan verification (2026-09-25)

Used the previously supplied key with a fresh temporary Desktop Web profile, the actual
compiled native welcome backend and official `ctx.llm.stream()` adapter. The temporary
credential store was removed afterward. No archived adapter or replay responses were used.

- Welcome authentication, real `/models` credential validation, settings mutation, credential
  save, persisted file presence and subsequent metadata read passed.
- Flash and Pro: Off returned `MIO_OK` without reasoning; High returned `9.8` with separate
  reasoning blocks. High is the enabled label, not a proved intensity tier.
- Flash requested `get_weather` for Paris; the synthetic result `Sunny, 22°C` was supplied
  through upstream tool-message construction; continuation returned `Paris: **Sunny, 22°C**.`
- Actual request fields: Off sends `thinking.type=disabled`, High sends `enabled`, with no
  `reasoning_effort`; assistant `reasoning_content` survives tool continuation.
- This account's `/models` lists Flash and Pro, but not `mimo-v2.6-pro-ultraspeed`. The latter
  returned HTTP 400 `Not supported model mimo-v2.6-pro-ultraspeed` and is now gated by `desktop/product.json` → `enableUltraSpeed` (default `false`).
  This finding is specific to the tested CN Token Plan endpoint/account.
- Final six generation requests passed. Credential-free evidence: `desktop/live-validation.json`.

The probe verifies the welcome backend, not credential entry through the Electron UI. Tool
execution is synthetic and does not qualify filesystem tools or an entire agent session.

## Not yet qualified

- PAYG, SGP/AMS, other accounts and Electron UI credential-entry happy path; live coverage above
  is limited to the tested CN Token Plan account and Flash/Pro routes.
- Windows x64 / macOS x64 execution. The three-target CI is defined but has not been run remotely.
- Signed/notarized installers, installer execution, release-version policy or end-to-end updates.
  Update origin remains null; no automatic update source is shipped.
- Legacy data migration: explicitly out of scope, no importer implemented.

Screenshots and command logs for this local run are under ignored `.desktop-build/qa` and
`.desktop-build/*.log`; they are local evidence, not published release artifacts.

## UltraSpeed configuration regression

Both switch states are exercised against fresh real Desktop Web profiles. The default
configuration excludes UltraSpeed; enabling includes it with off/high metadata. Both retain
Flash as the default and pass native welcome RPC checks. This does not claim a successful
UltraSpeed API call on the previously tested account.

## PR review regressions

- A private Git index reconstructs HEAD plus reviewed patches. Actual source edits inside or
  outside patched files and unexpected untracked source files are rejected without changing the
  checkout's real index. Only exact regenerated output paths are exempt; installer dimensions
  come from the pinned Git blobs.
- Feed-disabled macOS arm64/x64 packaging skips update configuration, verification and update
  artifact requirements. Filesystem orchestration fixtures verify ZIP/DMG promotion without
  update metadata; they do not qualify Apple signing or notarization. All ten tests pass locally.
