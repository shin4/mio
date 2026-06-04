<div align="center">

<img src="docs/assets/icon.png" alt="MiMo-Code" width="76" height="76" />

# MiMo-Code

**A native desktop coding agent for the MiMo model family.**

English | [简体中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-ff6900.svg)](./LICENSE)
![Desktop: Windows · macOS](https://img.shields.io/badge/desktop-Windows%20%C2%B7%20macOS-121317.svg)

<img src="docs/assets/welcome.png" alt="MiMo-Code — Welcome screen" width="760" />

<img src="docs/assets/read-aloud.png" alt="MiMo-Code — Read-aloud settings" width="760" />

</div>

---

MiMo-Code is a desktop coding agent built **around the MiMo series models**. Instead of treating
MiMo as a generic OpenAI-compatible provider, it makes MiMo a first-class participant in the agent
runtime — built on the OpenCode harness and adapted to be MiMo-first.

## Highlights

- **MiMo-native** — request shaping, model selection, and context packaging tuned for MiMo, not a generic provider skin.
- **Multimodal** — native image, PDF, and video understanding, plus audio dictation and speech synthesis (TTS).
- **Cost-aware** — stable prefix-cache inputs for high cache-hit rates, visible token & cost accounting, and selection of the cheapest capable model for each task.
- **Desktop apps** — Windows & macOS, built on Electron. **No TUI planned.**

## Download

Prebuilt Windows and macOS apps are coming soon. For now, build from source:

```bash
bun install
bun run dev:desktop
```

Installer builds: `bun run package:mac` and `bun run package:win` (Linux is also buildable with
`bun run package:linux`). See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full setup.

## Connect to MiMo

Get an API key from [platform.xiaomimimo.com](https://platform.xiaomimimo.com) — pay-as-you-go
(`sk-…`) or a token plan (`tp-…`) — and add it in the app.

## License

[MIT](./LICENSE). MiMo-Code is derived from [opencode](https://github.com/anomalyco/opencode); see
[NOTICE.md](./NOTICE.md) for attribution and third-party notices.

> **Disclaimer:** MiMo-Code is an independent, community-maintained project. It is not an official
> Xiaomi product and is not affiliated with, sponsored by, or endorsed by Xiaomi Inc. It connects to
> the MiMo model platform purely as a third-party client.
