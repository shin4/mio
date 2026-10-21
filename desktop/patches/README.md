# Reviewed upstream overlay

Base: `dsh-v0.2.1-rc.2`, `687f282e8625c6b8d11ff58211a90524be2e4317`.

`0001-mio-desktop.patch` covers:

- Product identity, private data home, external protocol, native Chinese/English wording.
- Agent-preset choosing surfaces (`ui-agent-preset`: Settings cards and the new-session picker)
  drop `ptc` and `minimal`. They stay registered so sessions recorded under them still resume; the
  registry has no hide option, so only the client roster reads filter them.
- Empty-conversation hero (`ui-conversation`; no slot or locale override reaches it): a bilingual
  headline in every locale — 「于深处写下光」 with "Write Light into the Deep" as a new `hero.subline`
  line beneath it — and the badge 「基于 DeepSeek Harness」/ "Built on DeepSeek Harness", plain
  descriptive attribution per upstream `BRAND_GUIDELINES`.
- Browser builds embed the Mio version (`apps/desktop/mio-product.json`, generated) as
  `DSH_CLIENT_VERSION`, so Settings → General shows Mio's version rather than the runtime's.
- Native MiMo credential setup using upstream discovery, settings and credentials RPCs.
- The product bundle in Desktop startup/recovery and the host's shipped dependency closure.
- Official packaging integration, Mio artifact names, GitHub Releases updater, and installer text.
- Workspace package declarations and the matching pnpm lockfile delta.
- Voice input: the official voice-input bundle recomposed around `@mio/asr` (MiMo ASR, no
  local SenseVoice), shipped enabled in new Desktop profiles, and packed with the product.
  macOS signs the app with `com.apple.security.device.audio-input`; without it the hardened
  runtime blocks the microphone and the system never prompts.
- Packing `@mio/tts` and `@mio/media` with the product (their composition lives in `desktop/bundle`).

Upstream now supplies loopback/random ports and the `build:official` packaging entry; their old
overlay hunks are removed. Runtime preparation follows the new upstream stage order.
The installed-CLI smoke supplies `MIO_HOME` as well as `DSH_HOME` so both product and upstream
commands share the isolated test profile.

No agent, session format, permissions or provider adapter internals are changed.
Generated product constants, plugin packages and icons are copied by `prepare.mjs`;
installer bitmaps are rendered by `resources.mjs`. Keep these generated files out of patches.

The root `.gitattributes` pins patch files to LF, including Windows checkouts with
`core.autocrlf=true`. Upstream also enforces LF; a CRLF patch fails exact context matching.
Blank context lines retain the single space required by unified-diff syntax.

Upgrade procedure: change the exact upstream lock deliberately, review each patch hunk against
the new source, update the lockfile delta, build all three targets, replay requests and boot
Electron. Remove an overlay hunk when upstream supplies a configurable equivalent. Never
fuzz-apply a patch or silently reset unexpected changes in the generated checkout.
