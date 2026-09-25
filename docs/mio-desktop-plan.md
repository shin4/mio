# Mio Desktop：官方 Desktop 产品化

更新：2026-09-25。状态：**实施中，开发入口已切换，尚未发布安装包**。

## 已确认的范围

- 使用官方 dsh **0.1.7-rc.2**：`dsh-v0.1.7-rc.2`，提交 `477b4f420553e8a52c2fbccc464d7561b239c443`。
- M2 调整为**在官方体验基础上优化**：保留官方欢迎页和工作区结构、导航、设置、工具、权限与恢复流程；仅适配 MiMo 接入及 Mio 品牌、配色、中英文文案。
- **取消 M3 数据迁移**。新数据目录初始化为空，不导入旧会话、工作区、设置或凭据。
- 首版只覆盖 macOS arm64/x64 和 Windows x64；Linux 后续补齐。
- **移除仓库三天发布年龄规则**。精确提交、冻结锁文件、可审查补丁与真实构建/回放仍是门槛。
- MiMo 使用上游 `llm-pi-ai` 的 `openai-completions`，不新增自研 provider 内核。

## 代码组织

| 路径 | 职责 |
|---|---|
| `desktop/upstream.lock.json` | 上游仓库、tag、完整提交、原始 pnpm 锁文件 SHA-256、工具链 |
| `desktop/product.json` | Mio 名称、appId、协议、数据目录和更新开关 |
| `desktop/bundle` | `@mio/desktop` 产品组合包；MiMo provider、V2.6 模型和默认项 |
| `desktop/brand` | `@mio/brand` Cordis 插件；官方 slot 中的标识、主题 token |
| `desktop/patches` | 官方 Desktop 产品接入补丁，含上游锁文件差异 |
| `script/desktop` | 固定检出、补丁校验、资源生成、构建/开发/打包入口 |
| `desktop/test` | 实际 rc.2 运行时的请求回放、Web 组合和原生欢迎 RPC 验证 |
| `.desktop-build` | 可再生检出、构建日志、开发数据、运行环境与构建记录，Git 忽略 |
| `packages/{shell,runtime,client-ui}` | 旧版实现，保留既有锁文件和回归验证；不与新 Desktop 混装 |

组合包与品牌插件分开：上游 profile 解析不把选中的组合包自身作为普通插件回退项；
品牌插件必须是组合包的依赖。实际 Web 组合测试覆盖这个边界。

准备脚本核对 origin、HEAD 和原始锁文件摘要；补丁只能完整应用或已完整应用，不允许模糊套用。
后续安装使用 frozen lockfile。品牌插件的 Cordis peer 解析到上游工作区，不携带第二份框架。

## MiMo 配置

| 项目 | 首版实现 |
|---|---|
| 协议 | `openai-completions`，上游 `thinkingFormat: deepseek` |
| 默认模型 | `mimo-v2.6-flash` |
| 可选配置 | `mimo-v2.6-pro`；Flash / Pro 已通过 CN Token Plan 实测，UltraSpeed 未获端点支持，由 `desktop/product.json` 的 `enableUltraSpeed` 构建开关控制，默认关闭 |
| 推理 | 两种语义：关闭／开启。沿用上游控件 ID `off`／`high`，当前界面标签为 Off／High；High 表示启用，不代表模型有强度档位 |
| wire | `thinking: {type: disabled/enabled}`；`supportsReasoningEffort: false`，不发送 `reasoning_effort` |
| 默认推理 | `high`（开启） |
| 凭据 | 官方 credentials 服务，引用名 `MIO_API_KEY`；不写入代码或产品配置 |
| 按量端点 | `https://api.xiaomimimo.com/v1` |
| Token Plan | `tp-` Key 显示 cn/sgp/ams 区域选择；保存对应 `token-plan-{region}.xiaomimimo.com/v1` |
| 保存 | 通过上游模型发现验证 Key/端点，再写入官方 settings 和 credentials |
| 预算 | 上下文 262144、输出 32768，属于保守应用预算，不表示模型规格上限 |

当前回放使用历史 V2.5 真实录制响应，验证新配置生成的 V2.6 请求、解析和工具续传。
**不能将回放通过解读为已验证真实 V2.6 账户可用性或完整模型能力。**
图像、语音和媒体能力不因换壳自动启用。

## Mio 体验边界

- 官方原生欢迎页：Mio 标识，中英文文案，“连接 MiMo”进入 Key 表单，“稍后配置”进入工作区。
- 主界面：通过 sidebar/hero 品牌 slots 和主题 token 叠加；保留官方布局。
- 欢迎页、主程序图标、Windows 托盘及安装器资源均使用 Mio 资产。
- 文档标题使用上游 `DSH_CLIENT_TITLE=Mio` 构建输入，不沿用旧版 HTTP 字符串替换。
- 内部 dsh 模块名称、技术诊断和归属信息保留；不把其他 provider 的真实名称替换为 MiMo。
- 官方平台账号能力仍属于上游，首屏主路径是 MiMo API Key。

## 数据、身份与更新

- 发行 appId：`io.github.shin4.mio.desktop`；外部协议 `mio://open`。
- 打包版 home：`app.getPath('userData')/dsh-desktop`；显式 `MIO_HOME` 可覆盖。
- 开发版：`.desktop-build/home` 与 `.desktop-build/electron-user-data`。
- 不扫描或导入旧 `userData/dsh`、旧 OpenCode 数据或官方 `~/.dsh`。
- 保留上游 app recovery；恢复 profile 时仍使用包含 Mio 组合包的模板。
- 当前 `updateOrigin: null`，不启用更新；Mio 的打包配置与运行时都拒绝使用官方更新源。
- 首轮内部构建保留上游版本 `0.1.7-rc.2`，不冒充 Mio 0.3.x 的可升级正式版。
  正式 Mio 版本编号和更新顺序验证留在发行阶段。

## 命令

需要 Node 24 和 pnpm 11.7.0；官方首次完整构建及文档运行环境准备需要网络与本机编译工具。
根工作区原有 Bun 工具链保留，官方生成工作区使用 pnpm。

```sh
bun run prepare:desktop
bun run build:desktop
bun run start:desktop  # 已构建时启动；首次会准备官方运行环境
bun run dev:desktop    # 完整构建后启动
cd desktop
node --test test/*.test.ts
```

直接用 `node script/desktop/run.mjs build` 也可，无需先安装旧 shell 依赖。
旧版仅通过 `bun run dev:legacy` 启动。

打包入口为 `bun run package:desktop mac-arm64`、`mac-x64`、`win-x64`（Windows 可加 `--unsigned`）。
沿用上游平台本地 `.env.macos`/`.env.windows` 与签名门槛；配置中的 appId 必须与产品清单一致。
**这些入口不等于已生成或已验证签名安装包。** macOS 发布仍要求开发者签名和公证材料。
不得调用上游 `upload:*` 将 Mio 上传到 DeepSeek 发布基础设施。

## 实施阶段与剩余验收

| 阶段 | 状态和退出条件 |
|---|---|
| M0 官方底座 | 已落固定来源、准备/构建入口、冻结锁文件；macOS arm64 完整工作区构建和原生启动验证 |
| M1 MiMo 组合 | V2.6 配置、两种推理语义、历史 cassette 回放已接入；真实 V2.6 各账户/区域请求仍需验收 |
| M2 官方体验优化 | 品牌插件、原生接入、中英文及图标落代码；用实际 Electron 窗口检查交互、明暗主题与显示边界 |
| M3 数据迁移 | **取消，不开发导入、迁移、备份转换器** |
| M4 发行 | 三平台编译 CI 已切换；实际安装包、签名/公证、Mio 版本策略和自有更新链尚未完成 |
| M5 退役旧链 | 根开发入口已切换；旧发布工作流改为手动 legacy，自动 tag 发布停用；发布验收完成后再删除旧实现 |

不为了完成这轮开发擅自发布安装包或生成更新 feed。安装器在 Windows、macOS x64 的实际运行结果由对应平台 CI/本机验收补齐。

## 来源

- [官方固定源码](https://github.com/deepseek-ai/deepseek-harness/tree/477b4f420553e8a52c2fbccc464d7561b239c443/apps/desktop)
- [MiMo Chat Completions](https://mimo.mi.com/docs/en-US/api/chat/openai-api)
- [MiMo Responses](https://mimo.mi.com/docs/en-US/api/chat/responses)
