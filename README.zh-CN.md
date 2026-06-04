<div align="center">

<img src="docs/assets/icon.png" alt="MiMo-Code" width="76" height="76" />

# MiMo-Code

**为 MiMo 系列模型打造的原生桌面代码智能体。**

[English](./README.md) | 简体中文

[![License: MIT](https://img.shields.io/badge/License-MIT-ff6900.svg)](./LICENSE)
![Desktop: Windows · macOS](https://img.shields.io/badge/desktop-Windows%20%C2%B7%20macOS-121317.svg)

<img src="docs/assets/welcome.zh-CN.png" alt="MiMo-Code 欢迎界面" width="760" />

<img src="docs/assets/read-aloud.zh-CN.png" alt="MiMo-Code 朗读设置" width="760" />

</div>

---

MiMo-Code 是一款**围绕 MiMo 系列模型打造**的桌面代码智能体：不把 MiMo 当作通用的 OpenAI 兼容提供商，
而是让它成为运行时中的一等公民——构建于 OpenCode harness 之上，并以 MiMo 为先。

## 亮点

- **MiMo 原生** — 请求构造、模型选择与上下文打包都为 MiMo 调优，而非通用提供商的套壳。
- **多模态** — 原生的图像、PDF、视频理解，以及语音听写（ASR）与语音生成（TTS），支持 MiMo 全系列模型。
- **成本可控** — 稳定的前缀缓存输入带来高命中率，token 与成本清晰可见，并为每个任务选用最具性价比的可用模型。
- **桌面应用** — 基于 Electron 的 Windows 与 macOS 应用。**不计划提供终端界面（TUI）。**

## 下载

前往 [Releases](https://github.com/shin4/mimo-code/releases/latest) 页面下载最新的 Windows 与 macOS 安装包，也可从源码构建：

```bash
bun install
bun run dev:desktop
```

构建安装包：`bun run package:mac`、`bun run package:win`（Linux 也可通过 `bun run package:linux` 构建）。
完整开发环境请见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 连接 MiMo

前往 [platform.xiaomimimo.com](https://platform.xiaomimimo.com) 获取 API Key——按量付费（`sk-…`）
或订阅套餐（`tp-…`）——并在应用中填入。

## 许可证

[MIT](./LICENSE)。MiMo-Code 衍生自 [opencode](https://github.com/anomalyco/opencode)；归属与第三方声明见
[NOTICE.md](./NOTICE.md)。

> **声明：** MiMo-Code 是一个独立的、由社区维护的项目。它不是小米官方产品，与小米公司（Xiaomi Inc.）无附属、
> 赞助或背书关系。它仅作为第三方客户端连接 MiMo 模型平台。
