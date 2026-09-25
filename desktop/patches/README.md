# Reviewed upstream overlay

Base: `dsh-v0.1.7-rc.2`, `477b4f420553e8a52c2fbccc464d7561b239c443`.

`0001-mio-desktop.patch` covers:

- Product identity, private data home, external protocol, native Chinese/English wording.
- Native MiMo credential setup using upstream discovery, settings and credentials RPCs.
- The product bundle in Desktop startup/recovery and the host's shipped dependency closure.
- Ephemeral loopback port, so another dsh instance does not collide with Mio.
- Official packaging integration, Mio artifact names, disabled updater, and installer text.
- Workspace package declarations and the matching pnpm lockfile delta.

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
