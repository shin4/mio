<div align="center">

<img src="docs/assets/icon.png" alt="Mio" width="76" height="76" />

# Mio — Desktop Agent for MiMo

**A native desktop coding agent for the MiMo model family.**

English | [简体中文](./README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/shin4/mio?color=ff6900&label=release)](https://github.com/shin4/mio/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-ff6900.svg)](./LICENSE)
![Desktop: macOS · Windows](https://img.shields.io/badge/desktop-macOS%20%C2%B7%20Windows-121317.svg)
![dsh Desktop 0.1.7-rc.2](https://img.shields.io/badge/dsh%20Desktop-0.1.7--rc.2-0E1B2E.svg)

<img src="docs/assets/welcome.png?v=0.4.0" alt="Mio 0.4.0 — Welcome screen with Connect MiMo" width="480" />

<img src="docs/assets/workspace.png?v=0.4.0" alt="Mio 0.4.0 — Workspace with MiMo V2.6 Flash selected" width="960" />

<sub>Mio 0.4.0: the native welcome screen and the workspace, defaulting to MiMo V2.6 Flash with thinking on.</sub>

</div>

---

## What is Mio?

Mio is a free, open-source **native desktop coding agent for the MiMo model family**, for macOS and
Windows. Since 0.4.0 it is the official
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) **Desktop** — its
workspace, settings, tools and session model, unchanged — with Mio's identity and a MiMo-first
configuration layered on top. Mio ships no fork of the model adapter: MiMo is configured through
dsh's own provider, and the product overlay is a reviewed patch set kept in [`desktop/`](desktop/README.md).

## What's new in 0.4.0

- **Official dsh Desktop 0.1.7-rc.2 foundation** — the native workspace, settings and tools, as upstream ships them.
- **MiMo V2.6 by default** — new sessions start on **MiMo V2.6 Flash** with thinking enabled; **V2.6 Pro** is one click away. Thinking can be switched off per session.
- **Native MiMo account setup** — paste an API key on the welcome screen. The key prefix picks the billing track; token plans choose a region (CN / SGP / AMS).
- **Mio identity** — Mio icons, theme and brand across the app, in Chinese and English.
- **Qualified installers** — macOS builds are Developer ID signed and notarized; every installer ships with SHA-256 checksums and qualification evidence.

Full notes: [Mio v0.4.0 release](https://github.com/shin4/mio/releases/tag/v0.4.0).

## Download

Get the latest installers from [Releases](https://github.com/shin4/mio/releases/latest):

| Platform | File | Signing |
| --- | --- | --- |
| macOS · Apple Silicon | `mio-0.4.0-mac-arm64.dmg` (or `.zip`) | Developer ID signed + notarized |
| macOS · Intel | `mio-0.4.0-mac-x64.dmg` (or `.zip`) | Developer ID signed + notarized |
| Windows x64 | `mio-0.4.0-win-x64-unsigned.exe` | **Unsigned** — expect a SmartScreen / unknown-publisher prompt |

Verify downloads against `SHA256SUMS.txt`; `mio-0.4.0-qualification.json` records the source
commit, hashes and signing state of each installer. Linux is not part of 0.4.0 and will follow separately.

### Upgrading from 0.3.x

- **Install manually** — automatic updates are disabled in this release.
- **Fresh data directory** — 0.4.0 does not migrate previous sessions, workspaces, settings or
  API keys. Reconnect your MiMo account on the welcome screen.

## Connect to MiMo

Get an API key from [platform.xiaomimimo.com](https://platform.xiaomimimo.com) and paste it into
**Connect MiMo** on first launch (or later from the Models page):

- **Pay-as-you-go** (`sk-…`) — no region choice needed.
- **Token plan** (`tp-…`) — pick your plan's region: CN, SGP or AMS.

| Model | Role | Thinking |
| --- | --- | --- |
| MiMo V2.6 Flash | Default for new sessions | Off / High (on by default) |
| MiMo V2.6 Pro | Harder tasks | Off / High |

`Off` and `High` map to MiMo's `thinking` switch (disabled / enabled); there are no graded effort
tiers. `mimo-v2.6-pro-ultraspeed` stays out of the release build — see
[Optional UltraSpeed model](desktop/README.md#optional-ultraspeed-model) if your account supports it.

## Build from source

Requires **Node 24**, **pnpm 11.7.0** and upstream's native toolchain (Xcode command line tools on
macOS). From the repository root:

```bash
bun install
bun run dev:desktop
```

`dev:desktop` prepares the pinned upstream source, applies the reviewed Mio overlay, builds and
starts the app. `build:desktop`, `start:desktop` and `package:desktop <mac-arm64|mac-x64|win-x64>`
run the steps separately. [desktop/README.md](desktop/README.md) covers verification, live
validation and the release pipeline; the pre-0.4.0 Electron shell remains reachable through
`bun run dev:legacy`. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full setup.

## 🔊 Hear it

The intro voice on the **[landing page](https://shin4.github.io/mio/#capabilities)** was synthesized
with MiMo TTS, not recorded by a voice actor. English voice *Chloe*, Chinese voice *冰糖*.
Voice dictation and speech are not part of the 0.4.0 desktop yet — they are being rebuilt as dsh plugins.

<details>
<summary>Transcript</summary>

> "The voice you're hearing right now was generated by Mio itself. It's a free, open-source desktop coding agent for the MiMo models — it reasons over your screenshots, PDFs and video, takes your prompts by voice, and reads its answers back. Built for Windows and macOS."

</details>

## FAQ

### What is Mio?

A free, MIT-licensed native desktop coding agent for the MiMo model family, for macOS and Windows.
Since 0.4.0 it is the official DeepSeek Harness Desktop with Mio's identity and MiMo defaults —
upstream's workspace, tools and settings, not a reimplementation of them.

### Why is it built on DeepSeek Harness?

The hard parts of a desktop agent — the tool loop, session persistence, model routing, the
workspace UI — already exist in dsh, and they are open source. Mio composes them instead of
forking them: a pinned upstream source, a reviewed overlay, and MiMo configuration through dsh's
own provider. Upstream improvements arrive by moving a version pin.

### Which MiMo models does it support?

MiMo V2.6 Flash (the default) and MiMo V2.6 Pro, each with thinking on or off. UltraSpeed is an
opt-in build flag for accounts that support it.

### Which platforms does Mio run on?

macOS on Apple Silicon and Intel (signed and notarized) and Windows x64 (unsigned in 0.4.0).
Linux will follow separately. There is no terminal (TUI) version planned.

### Will my 0.3.x sessions and settings carry over?

No. 0.4.0 starts with a fresh data directory and does not import earlier sessions, workspaces,
settings or keys. Reconnect your MiMo account on the welcome screen.

### Is Mio an official Xiaomi product?

No. Mio is an independent, community-maintained project. It is not affiliated with, sponsored by,
or endorsed by Xiaomi Inc., and it connects to the MiMo model platform purely as a third-party client.

### How much does it cost?

The app is free and MIT-licensed; you pay only for MiMo API usage on
[platform.xiaomimimo.com](https://platform.xiaomimimo.com), pay-as-you-go (`sk-…`) or token plan (`tp-…`).

## License

[MIT](./LICENSE). Mio composes [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(MIT) and its archived core is derived from [opencode](https://github.com/anomalyco/opencode); see
[NOTICE.md](./NOTICE.md) for attribution and third-party notices.

> **Disclaimer:** Mio is an independent, community-maintained project. It is not an official
> Xiaomi product and is not affiliated with, sponsored by, or endorsed by Xiaomi Inc. It connects to
> the MiMo model platform purely as a third-party client.
