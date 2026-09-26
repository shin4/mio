<div align="center">

<img src="docs/assets/icon.png" alt="Mio" width="76" height="76" />

# Mio

**为 MiMo 系列模型打造的原生桌面代码智能体。**

[English](./README.md) | 简体中文

[![Release](https://img.shields.io/github/v/release/shin4/mio?color=ff6900&label=release)](https://github.com/shin4/mio/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-ff6900.svg)](./LICENSE)
![Desktop: macOS · Windows](https://img.shields.io/badge/desktop-macOS%20%C2%B7%20Windows-121317.svg)
![dsh Desktop 0.1.7-rc.2](https://img.shields.io/badge/dsh%20Desktop-0.1.7--rc.2-0E1B2E.svg)

<img src="docs/assets/welcome.zh-CN.png?v=0.4.0" alt="Mio 0.4.0 欢迎界面：连接 MiMo" width="480" />

<img src="docs/assets/workspace.zh-CN.png?v=0.4.0" alt="Mio 0.4.0 工作区，默认选中 MiMo V2.6 Flash" width="960" />

<sub>Mio 0.4.0：原生欢迎界面与工作区，默认 MiMo V2.6 Flash、推理开启。</sub>

</div>

---

## Mio 是什么？

Mio 是一款面向 **MiMo 模型家族**的免费开源原生桌面代码智能体，支持 macOS 与 Windows。自 0.4.0 起，它直接采用官方
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）**Desktop**——工作区、设置、工具与会话模型
保持上游原样——再叠加 Mio 的品牌与 MiMo 优先的配置。Mio 不 fork 模型适配器：MiMo 通过 dsh 自带的 provider 配置接入，
产品层是一组经过审阅的补丁，存放在 [`desktop/`](desktop/README.md)。

## 0.4.1 新变化

- **MiMo ASR 语音输入** — 点输入框里的麦克风说出需求，MiMo ASR（`mimo-v2.5-asr`）会把它转成草稿，确认后再发送。
  识别语言默认自动判断，也可固定为中文。
- **MiMo TTS 朗读** — 每条完成的回复旁（复制按钮边）多了一个朗读按钮。Mio 用 `mimo-v2.5-tts` 朗读正文，跳过代码块，
  同一时间只播放一条；长回复从开头读起，最多约 4,000 字。
- **自选音色** — **设置 → 通用设置 → 朗读音色**提供 MiMo 的 9 种预置音色（默认、冰糖、茉莉、苏打、白桦、Mia、Chloe、
  Milo、Dean），并可试听。
- 两者都使用你已连接的 MiMo 账号，包括订阅套餐所选地域。无需额外的 Key，也不下载本地模型。

0.4.0 已将 Mio 迁移到官方 dsh Desktop 0.1.7-rc.2，默认使用 MiMo V2.6 Flash，并支持原生的 MiMo 账号接入。完整说明见
[v0.4.1](https://github.com/shin4/mio/releases/tag/v0.4.1) · [v0.4.0](https://github.com/shin4/mio/releases/tag/v0.4.0)。

## 下载

前往 [Releases](https://github.com/shin4/mio/releases/latest) 获取最新安装包：

| 平台 | 文件 | 签名 |
| --- | --- | --- |
| macOS · Apple Silicon | `mio-0.4.1-mac-arm64.dmg`（或 `.zip`） | Developer ID 签名 + 公证 |
| macOS · Intel | `mio-0.4.1-mac-x64.dmg`（或 `.zip`） | Developer ID 签名 + 公证 |
| Windows x64 | `mio-0.4.1-win-x64-unsigned.exe` | **未签名** — 安装时会出现 SmartScreen / 未知发布者提示 |

可用 `SHA256SUMS.txt` 校验下载；`mio-0.4.1-qualification.json` 记录了每个安装包的源码提交、哈希与签名状态。
Linux 版本后续单独提供。

### 升级

- **手动安装** — 仍未启用自动更新。
- **从 0.4.0 升级** — 直接覆盖安装，会话、设置和 MiMo Key 都会保留。朗读立即可用；由 0.4.0 创建的配置默认未开启语音输入，
  请在**插件 → 语音输入**中开启一次。
- **从 0.3.x 升级** — 0.4 使用全新的数据目录，不迁移旧的会话、工作区、设置或 API Key，请在欢迎页重新连接 MiMo 账号。

## 连接 MiMo

前往 [platform.xiaomimimo.com](https://platform.xiaomimimo.com) 获取 API Key，首次启动时在 **连接 MiMo** 中粘贴
（也可以稍后在模型页填写）：

- **按量付费**（`sk-…`）— 无需选择地域。
- **订阅套餐**（`tp-…`）— 选择套餐所在地域：CN、SGP 或 AMS。

| 模型 | 定位 | 推理 |
| --- | --- | --- |
| MiMo V2.6 Flash | 新会话默认 | Off / High（默认开启） |
| MiMo V2.6 Pro | 更难的任务 | Off / High |

`Off` 与 `High` 对应 MiMo 的 `thinking` 开关（关闭 / 开启），不存在分级的推理强度。`mimo-v2.6-pro-ultraspeed`
不包含在发行版中——如账号支持，参见[可选的 UltraSpeed 模型](desktop/README.md#optional-ultraspeed-model)。

## 语音

语音功能使用你已连接的 MiMo 账号：录音和回复文本会发送到 MiMo API，本机不做转写或合成。

- **说出需求** — 点输入框里的麦克风开始说话（最长 60 秒），再点停止。转写结果会放进草稿，不会自动发送。
  在**插件 → 语音输入**中可以看到识别服务（MiMo ASR）和识别语言：*自动识别*（推荐，英文也用它）或*中文*。
- **收听回复** — 点回复下方的朗读按钮开始朗读，再点一次停止。标题、强调和链接按普通文字朗读，代码块会跳过。长回复会从开头按整句读，最多约 4,000 字。
- **选择音色** — **设置 → 通用设置 → 朗读音色**。点*试听*会用所选音色读一句示例，中文音色读中文，英文音色读英文。

## 从源码构建

需要 **Node 24**、**pnpm 11.7.0** 以及上游要求的原生工具链（macOS 上为 Xcode 命令行工具）。在仓库根目录执行：

```bash
bun install
bun run dev:desktop
```

`dev:desktop` 会准备锁定版本的上游源码、应用经过审阅的 Mio 补丁层，然后构建并启动应用。`build:desktop`、
`start:desktop` 与 `package:desktop <mac-arm64|mac-x64|win-x64>` 可分步执行。验证、真实接口校验与发布流程见
[desktop/README.md](desktop/README.md)；0.4.0 之前的 Electron 壳仍可通过 `bun run dev:legacy` 运行。
完整开发环境请见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 🔊 听一段

**[入口页](https://shin4.github.io/mio/#capabilities)** 上的介绍语音由 MiMo TTS 合成，而不是请人配音。英文音色 *Chloe*，
中文音色 *冰糖*。自 0.4.1 起，桌面版也用同样的模型听写和朗读，详见[语音](#语音)。

<details>
<summary>文稿</summary>

> “你现在听到的这段声音，就是 Mio 自己生成的。它是一款面向 MiMo 模型家族的原生桌面编程助手——看得懂你的截图、PDF 和视频，能听你用语音说需求，也能把答案读给你听。免费、开源，支持 Windows 和 macOS。”

</details>

## 常见问题

### 什么是 Mio？

Mio 是一款免费、采用 MIT 许可证的原生桌面代码智能体，面向 MiMo 模型家族，支持 macOS 与 Windows。自 0.4.0 起，
它就是带有 Mio 品牌与 MiMo 默认配置的官方 DeepSeek Harness Desktop——沿用上游的工作区、工具与设置，而非重新实现。

### 为什么基于 DeepSeek Harness？

桌面智能体最难的部分——工具循环、会话持久化、模型路由、工作区界面——dsh 都已具备，而且开源。Mio 选择组合而不是 fork：
锁定版本的上游源码、经过审阅的补丁层，以及通过 dsh 自带 provider 完成的 MiMo 配置。上游的改进只需移动版本锁即可获得。

### 支持哪些 MiMo 模型？

MiMo V2.6 Flash（默认）与 MiMo V2.6 Pro，均可开启或关闭推理。UltraSpeed 是面向支持该模型账号的可选构建开关。
语音输入使用 `mimo-v2.5-asr`，朗读使用 `mimo-v2.5-tts`，均走同一个账号。

### Mio 能在哪些平台运行？

macOS（Apple Silicon 与 Intel，已签名并公证）与 Windows x64（未签名）。Linux 后续单独提供，不计划提供终端界面（TUI）。

### 0.3.x 的会话和设置会保留吗？

不会。0.4.0 使用全新的数据目录，不导入此前的会话、工作区、设置或 Key。请在欢迎页重新连接 MiMo 账号。

### Mio 是小米官方产品吗？

不是。Mio 是一个独立的、由社区维护的项目，与小米公司（Xiaomi Inc.）无附属、赞助或背书关系，仅作为
第三方客户端连接 MiMo 模型平台。

### 费用如何？

应用本身免费且采用 MIT 许可证，你只需为 [platform.xiaomimimo.com](https://platform.xiaomimimo.com) 上的
MiMo API 用量付费——按量付费（`sk-…`）或订阅套餐（`tp-…`）。

## 许可证

[MIT](./LICENSE)。Mio 基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）
组合而成，其归档内核衍生自 [opencode](https://github.com/anomalyco/opencode)；归属与第三方声明见
[NOTICE.md](./NOTICE.md)。

> **声明：** Mio 是一个独立的、由社区维护的项目。它不是小米官方产品，与小米公司（Xiaomi Inc.）无附属、
> 赞助或背书关系。它仅作为第三方客户端连接 MiMo 模型平台。
