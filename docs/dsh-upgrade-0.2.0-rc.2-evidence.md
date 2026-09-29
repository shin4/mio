# dsh 0.2.0-rc.2 实施与验收记录

## 追加修正：V2.6 默认 1M 上下文

按用户要求，V2.6 Flash、Pro、可选 UltraSpeed 默认上下文改为 1,048,576 tokens，
与 [官方模型列表](https://mimo.mi.com/docs/zh-CN/quick-start/summary/model) 的 1M 声明一致。
输出预算仍为独立的 32,768 tokens。每个模型显式声明容量，避免保存的 provider 默认值遮蔽。
现有模型元数据修复插件补齐旧 V2.6 保存行中缺失的 contextWindow；显式模型容量和
非标准 provider 自定义上限保持不变。没有直接改动用户正式 profile。

修正后完整构建通过，Desktop **20/20** 回归通过（包含旧运行时兼容性用例）；5 个真实
Desktop profile 场景覆盖新配置、旧 256K 默认、UltraSpeed、显式模型上限与自定义
provider 上限。lint 0 errors / 43 warnings，`git diff --check` 通过。
日志：`.desktop-build/context-window-build.log`、`context-window-tests.log`、
`context-window-regression.log`、`context-window-lint.log`。以下保留此前升级验收记录。

日期：2026-09-29。状态：**本地实现与自动回归通过；发布资格未通过，禁止据此发布正式更新。**

验收合同：[升级 spec](dsh-upgrade-0.2.0-rc.2-spec.md)。分支 `codex/dsh-0.2-rc2`，
实施基线 Mio `991df1adc2804318807750574f6c4e875b411b9b`（0.4.5）。首次验收基于该基线上的升级工作区；最终提交以 PR head 为准。
没有创建 tag、上传安装包、修改生产 feed 或迁移/覆盖用户正式 profile。

## 已实现

- 精确锁定 `dsh-v0.2.0-rc.2` / `639ed015397290b3745d163aafe02ffee4aa3f84`。
  原始上游 pnpm lock SHA-256 为 `80fe05eae33582ae26839afd05f1965f9b0e4be11034ddf9797af6085d5ba9b1`。
- Mio 产品候选版本 `0.5.0-rc.1`；5 个 Mio composition/plugin 包与上游版本对齐。
  ASR/TTS 的 dsh 接口依赖转为 peer + devDependencies；Cordis 和 credentials 的真实模块路径一致。
- 对旧 overlay 做逐文件三方移植，冲突逐处解决；新版 CLI、登录 shell 环境、更新生命周期、
  Intel Node 和官方麦克风 entitlement 保留。删除旧版重复 entitlement 文件补丁。
- `product-analytics` 保持挂载、配置 `enabled: false`，保留 `appVersion` 必需字段。
  Session Log / session telemetry 仍按独立上游设置工作，不宣称所有网络请求都被关闭。
- 保留品牌、MiMo 接入、图片补全、隐藏默认 preset、ASR/TTS/media 插件；更新 welcome notice。
- 新 CLI 按产品配置生成 `mio` / `mio.cmd`；macOS receipt/backup 和 Windows registry/mutex
  使用 Mio 命名。保留上游所有权、指纹、确认、原文件备份和恢复算法。
- GUI 与 CLI 复用 `desktop/bundle/home.js`：默认仍为 Mio userData 下 `dsh-desktop`；
  显式 `MIO_HOME` 统一展开 `~`、规范化相对路径，空值拒绝。GUI 和 shell 各自的环境必须一致。
- 修复开发版 Launch Services 冷启动：生成 launcher 持久化 primary runtime 路径，避免只从
  终端父进程继承时可用。shell 字面参数和含空格、引号、`$(...)` 路径有实际执行回归。
- Windows PATH 测试改为验证生成后的 Mio PowerShell 脚本；发布资格 workflow 新增上游
  升级测试入口 `script/desktop/test-upgrade.mjs`，Windows 专属用例由 Windows runner 执行。

lockfile 仅加入 Mio workspace/依赖与替换 voice provider。pnpm 11.7.0 同时规范化了
pi-ai / http(s)-proxy-agent snapshot 的 `supports-color@9.4.0` peer 后缀；对应解析版本未变。
图标和安装器位图仍由 prepare/resources 生成，不写进源码 overlay。

## 本次实际验证

环境：macOS arm64，Node 24.18.0，pnpm 11.7.0，Bun 1.3.14。

| 检查 | 结果 | 可复现命令 / 本地日志 |
|---|---|---|
| 干净目标树应用 patch | 通过 | 在目标 SHA 的 pristine tree 执行 `git apply --check <patch>` |
| reverse-check、SHA/摘要与重复 prepare | 通过 | `node script/desktop/prepare.mjs` |
| 冻结安装、原生 addon、Host、client、Electron bundle、Web dist | 通过 | `node script/desktop/run.mjs build`；`.desktop-build/upgrade-build.log` / `build-record.json` |
| Mio lint | 0 errors，43 warnings | `bun run lint`；`.desktop-build/upgrade-lint.log`。warnings 不作为全仓清理任务 |
| Mio legacy 工作区 typecheck | 3/3 成功，缓存命中 | `bun run typecheck`；不替代上一行官方 Desktop 完整编译 |
| Desktop 回归 | **19/19 通过，无跳过** | 在 `desktop/` 执行下面命令；`.desktop-build/upgrade-tests.log` |
| 上游升级相关回归 | **501 通过，1 跳过** | `node script/desktop/test-upgrade.mjs`；`.desktop-build/upgrade-upstream-tests.log` |
| 原生开发版 UI | 通过所列步骤 | 中文深色欢迎页 → MiMo Key 表单 → 稍后配置 → 工作区 → 通用设置；显示 `0.5.0-rc.1` |

本机旧构建保留在 `.desktop-build/upstream-0.1.7-rc.2`，新构建为 `.desktop-build/upstream`。
旧版本比较用例显式要求一个已构建的旧源码树；未设置变量会跳过两项，不应把默认 CI 的
跳过视为历史兼容性验收成功。复现本次完整 Desktop 回归：

```sh
# 从 desktop/ 运行；路径指向独立保留、已构建的 0.4.5 源码组合。
MIO_BASELINE_ROOT=/absolute/path/to/upstream-0.1.7-rc.2 node --test test/*.test.ts
node ../script/desktop/test-upgrade.mjs
```

上游浏览器测试的 package roster 用 `require` 查找 workspace 自引用，测试入口提供
pnpm 的 `node_modules/.pnpm/node_modules` 为 `NODE_PATH`。这只作用于测试子进程，
不修改产品的依赖解析算法。唯一平台跳过项为真实 Windows registry/PATH 测试。

19 项 Desktop 测试覆盖：MiMo 历史 cassette 流式、Off/High、工具续接、错误与截断；
真实 Desktop profile / native welcome RPC；UltraSpeed 开关；保存模型补 image 与显式
text 输入不覆盖；隐藏默认 `minimal` 修复为 `standard`；ASR/TTS/media 本地回放；
产品身份/更新 feed；CLI/GUI home；checkout 防漂移；旧会话与 Schedule。

特别证据：

1. 旧运行时 + 旧 composition 在临时 home 生成真实会话；新版同 ID 续接，退出后再续接，
   请求包含旧对话；恢复完整升级前备份后旧版继续，确认不含新版追加消息。
   仅证明该普通 headless 会话路径，不替代 fork/subagent/历史 preset/附件全矩阵。
2. 旧 Desktop profile 创建 Schedule 任务；升级不启用 bundle 时服务缺席、任务文件字节不变；
   启用官方 bundle 后原 ID/内容/时间可列出、UI 插件挂载、自定义 17 天保留期生效，文件仍不变。
   没有证明跨版本实际到期投递及遗漏/重复投递全部场景。
3. 真实 `desktop` profile 同时挂载 product exporter 和 analytics；native RPC 返回 false；
   触发启动/更新事件并跑媒体操作，等待 shutdown drain 后本地 collector 请求数仍为 0。
4. CLI fixture 实际运行生成脚本，覆盖 cwd、Unicode/空参数、stdin、stderr、退出码、链接链；
   上游真实文件所有权测试覆盖安装、原内容恢复、过期确认、竞态和 receipt 异常。
   未在本机注册 `/usr/local/bin/mio`，未修改 Windows 用户 PATH。

## Spec 门槛与剩余工作

以下“本机通过”均不是三平台安装包放行：

| Gate | 状态 | 尚缺证据 |
|---|---|---|
| G01–G03 | 本机通过 | 三平台 frozen build / replay / 成品依赖身份 |
| G04 | 部分通过 | 有效 Key 保存/重启、实际 CN/SGP/AMS/PAYG 验证与失败隔离 |
| G05 | 部分通过 | 历史 ptc/minimal 会话实际恢复；已覆盖默认修复与显式 input |
| G06 | 部分通过 | 真麦克风授权/拒绝、真实 MiMo ASR/TTS/音视频、三平台 UI |
| G07 | 部分通过 | GUI 原地历史、fork/subagent、附件、MCP/第三方插件及 profile 失败恢复完整矩阵 |
| G08 | 部分通过 | 未来/逾期/暂停任务实际触发与跨重启恰好一次投递；已有任务恢复已验 |
| G09 | 本机策略/RPC/排空通过 | 完整浏览器事件矩阵、跨平台 Session Log 链路独立观察 |
| G10 | 部分通过 | 三平台成品 CLI、无系统 Node/pnpm、真实注册/并存、profile 锁与 SIGINT |
| G11 | 部分通过 | 已修复并验证开发 launcher；Finder/Dock 与 shell PATH/代理/Key 超时/取消全矩阵 |
| G12 | 部分通过 | 已验中文深色主要入口；英文/浅色/小窗口/模型搜索/计划审阅/三平台截图 |
| G13 | 未执行 | 双 Mac 签名公证及安装包、Intel Node/Office、Windows 真安装及成品 smoke |
| G14 | 部分通过 | 配置/feed 单测与数据备份回退已验；安装包覆盖安装/更新失败重试/生产更新待验 |

本机未提供 live probe 所需 `MIO_API_KEY`，也没有 macOS `.env.macos` 签名/公证配置；
本轮未调用真实模型。不得将历史 V2.5 cassette 通过描述为本次 V2.6 实测。
Windows x64 与 macOS x64 实机资格尚未执行，CI workflow 的新增步骤尚未远程运行。
开发版 .app 的启动与 Office runtime 自检不是签名安装包资格。

下一阶段：提供测试凭据与三平台构建环境 → 执行上述剩余矩阵 → 附签名/安装与 live
脱敏证据 → 全门槛通过后再决定 `0.5.0` 发布。现有发布脚本只接受稳定版本且会写 latest，
不能用它发布本候选版；当前生产仍为 0.4.5。
