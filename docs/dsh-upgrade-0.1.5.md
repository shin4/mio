# DSH 0.1.5 upgrade

Mio moves from `0.1.1-rc.2` to the exact npm release `0.1.5-rc.2`.
On 2026-09-14, npm `latest` was `0.1.5-rc.1` and `next` was `0.1.5-rc.2`;
both were published on September 10 and clear the three-day install gate.
The source remains upstream's published npm artifacts.

## Compatibility changes

- Onboarding uses the generated `ClientRemote` types, positional calls and direct
  `RemoteResult` values. Both `remote` and its three capability namespaces must be
  injected. The former `connection.api` no longer exists.
- All 232 resolved dsh packages share the release pin. Five additional peer roots
  (`attachment`, `jobs`, `session-persistence`, `session-query`, `settings`) and
  `cordis-plugin-group@1.0.2` prevent the old tree from surviving the upgrade.
  The client plugin shares the host's Cordis `4.0.2` and API Remotes package.
- The shell retains the full launch URL for its window but redacts tokens from
  logs and error tails. The host exchanges the URL for an HttpOnly, SameSite=Strict
  cookie with a 303 redirect. Cookies are bound to host and port.
- Staging disables dependency lifecycle scripts explicitly and runs only dsh's
  shipped `ensure-spawn-helper.mjs`, which restores the executable bit on the
  prebuilt node-pty helper. Native binaries still come from published packages.
- Multi-version transitive dependencies are pinned per parent; staging fails if
  npm resolves a package version absent from the workspace lock. This fixes a
  reproduced packaged-web crash caused by unreviewed `negotiator@1.1.0`.
- Packaging uses an ordinary `Resources/app` tree (`asar: false`). node-pty's
  unconditional asar rewrite otherwise doubles the unpacked suffix and its native
  helper cannot start. No dsh or node-pty source is patched.
- Keep `TITLE_GUARD`: the published `dsh-client-ui-layout` still supplies a hardcoded
  `DeepSeek Harness` product title. Mio's three brand slots, onboarding slot,
  `tapIndex`, asset routes and lazy module wrapper remain supported.

## Data migration and rollback

V3 logs cannot be read by the old runtime. Migration preserves old files and
publishes successor generations, but that does not make reverting the app alone
a complete rollback: turns created after the upgrade remain V3-only.

Before upgrading an existing installation:

1. Quit Mio and confirm its runtime has stopped.
2. Copy the entire active `DSH_HOME`, including hidden files, settings, credentials,
   profiles and sessions, to a private backup. Keep the matching old application.
3. Boot the new application against another copy, never the backup or live home.
   Open and resume representative sessions, including tool and subagent histories.
4. If validation fails, retain the old app and original home. To roll back after
   a cutover, stop the new app and restore the old app plus the complete pre-upgrade
   home. Keep post-upgrade files separately; do not merge generations manually.

Local validation on 2026-09-14 found no sessions in Mio's development or packaged
homes. A separate existing DSH home provided 14 compressed V0 logs. On a temporary
copy, the real new persistence implementation opened and flushed 8 sessions,
creating 8 successor files (14 original files became 22 files in the copy).
The other 6 failed closed with:

```text
subagent/descriptor 0 uses unsupported descriptor version 2;
source v0 artifact remains unchanged
```

All 14 original files retained their SHA-256 hashes. No original home was upgraded,
and no historical content was sent to a model. These are real older DSH histories,
not proof that every `0.1.1-rc.2` session has the same outcome. Do not bypass this
upstream refusal or advertise universal history compatibility. Affected users must
keep the old runtime for those histories until an upstream migration supports them.

## Validation

Run commands from the named package directories:

- Repository: `bun run typecheck`, `bun run lint`.
- `packages/client-ui`: `bun run build`, `bun run test`.
- `packages/runtime`: `bun run test` (real headless composition, unchanged live
  cassettes, tool-result continuation, truncation, auth failure and dependency tree).
- `packages/shell`: `bun run test` (real runtime token exchange, reload, brand assets
  and listener shutdown), `bun run stage`, and an unsigned local app build.

Validated locally: 19 tests passed (10 client UI, 7 runtime, 2 shell); all three
packages typecheck; lint reports 38 pre-existing warnings and no errors. The final
npm staging audit passes, and the unsigned macOS arm64 app cold-starts with a clean
page console, cookie-backed reload and Mio onboarding. Its bundled Electron Node
starts node-pty successfully (`mio-pty-ok`, exit 0). Normal application close
leaves neither shell nor runtime running. Signing/notarization and non-arm64
builds were not exercised locally.

The Electron smoke check uses a temporary `DSH_HOME` and browser data directory.
Verify the welcome screen, token-plan region picker, invalid-key rejection without
credential persistence, configure-later, Models page, cookie-backed reload, and quit.
The generated macOS arm64 app must also boot from `Resources/app` and run its bundled
runtime; a successful packaging command alone is insufficient.

Release gates still requiring external evidence: successful live MiMo answer and
read/write round-trip with a valid credential, and the existing four-platform
build-check matrix. Local cassette replay is not a substitute for either gate.

## Upstream references

- [0.1.5-rc.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)
- [0.1.5-rc.1 changes and compatibility notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.1)
- [V3 migration contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/session/session-format-v2-to-v3/README.md)
