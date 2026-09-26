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

## What's new in 0.4.1

- **Voice input with MiMo ASR** — the mic button in the composer records your request and MiMo ASR
  (`mimo-v2.5-asr`) turns it into a draft you can edit before sending. Language is detected
  automatically, or pinned to Chinese.
- **Read aloud with MiMo TTS** — every finished reply gets a speaker button next to Copy. Mio reads
  the prose with `mimo-v2.5-tts`, skips code blocks, and plays one reply at a time.
- **Pick the voice** — **Settings → General → Read-aloud voice** offers MiMo's nine preset voices
  (冰糖, 茉莉, 苏打, 白桦, Mia, Chloe, Milo, Dean and the default) with a preview button.
- Both use the MiMo account you already connected, including your Token Plan region. There is no
  extra key and no local model download.

0.4.0 moved Mio onto the official dsh Desktop 0.1.7-rc.2, with MiMo V2.6 Flash as the default and
native MiMo account setup. Full notes: [v0.4.1](https://github.com/shin4/mio/releases/tag/v0.4.1) ·
[v0.4.0](https://github.com/shin4/mio/releases/tag/v0.4.0).

## Download

Get the latest installers from [Releases](https://github.com/shin4/mio/releases/latest):

| Platform | File | Signing |
| --- | --- | --- |
| macOS · Apple Silicon | `mio-0.4.1-mac-arm64.dmg` (or `.zip`) | Developer ID signed + notarized |
| macOS · Intel | `mio-0.4.1-mac-x64.dmg` (or `.zip`) | Developer ID signed + notarized |
| Windows x64 | `mio-0.4.1-win-x64-unsigned.exe` | **Unsigned** — expect a SmartScreen / unknown-publisher prompt |

Verify downloads against `SHA256SUMS.txt`; `mio-0.4.1-qualification.json` records the source
commit, hashes and signing state of each installer. Linux will follow separately.

### Upgrading

- **Install manually** — automatic updates are still disabled.
- **From 0.4.0** — install over it; sessions, settings and your MiMo key are kept. Read aloud is
  on right away. Voice input starts switched off in profiles created by 0.4.0: turn on
  **Plugins → Voice input** once.
- **From 0.3.x** — 0.4 uses a fresh data directory and does not migrate previous sessions,
  workspaces, settings or API keys. Reconnect your MiMo account on the welcome screen.

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

## Voice

Voice runs on the MiMo account you connected. Recordings and reply text go to the MiMo API.
Nothing is transcribed or synthesized on your machine.

- **Speak a request** — click the mic in the composer, talk (up to 60 seconds), then stop. The
  transcript lands in the draft and is not sent until you send it. **Plugins → Voice input**
  shows the recognizer (MiMo ASR) and the language: *Detect automatically* (recommended, also for
  English) or *Chinese*.
- **Hear a reply** — click the speaker under a reply to read it aloud; click again to stop.
  Headings, emphasis and links are read as plain prose, and code blocks are skipped.
- **Choose the voice** — **Settings → General → Read-aloud voice**. *Preview* plays a short line in
  the selected voice, in Chinese or English to match that voice.

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
with MiMo TTS, not recorded by a voice actor. English voice *Chloe*, Chinese voice *冰糖*. Since
0.4.1 the desktop app listens and speaks with the same models — see [Voice](#voice).

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
opt-in build flag for accounts that support it. Voice uses `mimo-v2.5-asr` for input and
`mimo-v2.5-tts` for read aloud, on the same account.

### Which platforms does Mio run on?

macOS on Apple Silicon and Intel (signed and notarized) and Windows x64 (unsigned).
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
