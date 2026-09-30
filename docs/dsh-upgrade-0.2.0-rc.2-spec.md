# Mio 0.4.5 → dsh 0.2.0-rc.2 升级 Spec

日期：2026-09-29。状态：**已进入实施，候选版尚未完成发布资格验证**。
实际结果见 [实施证据](dsh-upgrade-0.2.0-rc.2-evidence.md)；本文件保留设计与验收合同。

本文是本次升级的实施与验收依据，受 [AGENTS.md](../AGENTS.md) 和
[MIGRATION.md](../MIGRATION.md) 的架构约束。本文的目标版本、默认选择和退出条件属于设计；
下文描述的是目标与必需门槛；已通过、部分通过及未执行的验证以实施证据为准。
后续执行结果须另附源码 SHA、命令、平台、产物和证据，不能把此 spec 当作升级通过记录。

## 1. 目标与范围

将 Mio 0.4.5 所用的官方 dsh Desktop 从 `0.1.7-rc.2` 升级到精确的 `0.2.0-rc.2`，
继续使用上游 Desktop、Cordis 插件体系、会话引擎、权限机制和 `llm-pi-ai`。
保留 Mio 现有 MiMo 接入、图片、语音、媒体工具、品牌、数据目录和更新链。

本次计划的产品版本是 `0.5.0-rc.1` 内测候选版，最终发布为 `0.5.0`。
Mio 版本与 dsh 版本独立；上游仍为 RC，不能将 Mio 正式发布描述成上游内核已稳定。
后续若改用其他 dsh tag，必须更新本 spec 的基线、差异和验证结果，不能只换版本号。

### 1.1 必须保持的产品行为

- 应用名 `Mio`、appId `io.github.shin4.mio.desktop`、协议 `mio://open` 不变。
- 打包版仍使用 `app.getPath('userData')/dsh-desktop`；显式 `MIO_HOME` 覆盖规则不变。
- MiMo 默认模型为 `mimo-v2.6-flash`，可选 `mimo-v2.6-pro`；UltraSpeed 仍默认关闭。
- V2.6 Flash/Pro/UltraSpeed 默认上下文为 1,048,576 tokens；旧保存配置继承的 256K 默认值修复，显式自定义上限保留。
- thinking 仍为 Off/High 两态，分别发送 disabled/enabled，不发送 `reasoning_effort`。
- MiMo PAYG 与 CN/SGP/AMS Token Plan 配置、凭据引用 `MIO_API_KEY` 保留。
- ASR、TTS、音视频理解仍由 Mio 插件提供；不恢复归档 provider 或旧 shell。
- 保留已有图片能力修复与隐藏 preset 处理；历史 `ptc` / `minimal` 会话仍可恢复。
- 自动更新仍使用 Mio GitHub Release feed，不接入 DeepSeek COS 或强制更新服务。
- 平台仍为 macOS arm64、macOS x64、Windows x64；Windows 沿用明确标注的未签名发行。

### 1.2 非目标

- 不导入 OpenCode、legacy shell、官方 `~/.dsh` 的历史数据；不开发会话格式转换器。
- 不清空现有 0.4.x 数据，不重置 Key、模型、主题或用户主动设置的输入类型。
- 不修改 `archive/`，不升级 legacy `packages/{runtime,client-ui,shell}` 的依赖树。
- 不新增自研 provider、调度器、权限系统、插件安装器或更新服务。
- 不扩展 Linux、模型能力或账户支持声明；异步问答等新实验功能保持上游默认状态。
- 不为本次内测扩建公开 RC 更新通道，不引入已取消的“三天发布年龄”规则。

“无数据迁移”指不导入旧架构数据；它不免除现有 **0.4.5 原地升级兼容性**验收。
本次只保留已有配置修复，并采用上游给出的配置升级操作。

## 2. 精确基线与供应链

| 项目 | 当前 | 目标 |
|---|---|---|
| Mio 产品版本 | `0.4.5` | 内测 `0.5.0-rc.1`；正式 `0.5.0` |
| Mio 评估提交 | `991df1adc2804318807750574f6c4e875b411b9b` | 实施与资格构建时记录实际提交 |
| dsh tag | `dsh-v0.1.7-rc.2` | `dsh-v0.2.0-rc.2` |
| dsh commit | `477b4f420553e8a52c2fbccc464d7561b239c443` | `639ed015397290b3745d163aafe02ffee4aa3f84` |
| 原始 `pnpm-lock.yaml` SHA-256 | `5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa` | `80fe05eae33582ae26839afd05f1965f9b0e4be11034ddf9797af6085d5ba9b1` |
| 上游 package manager | `pnpm@11.7.0` | `pnpm@11.7.0` |
| Mio 构建工具链 | Node 24；根工作区 Bun 1.3.14 | 保持；资格记录补充实际 patch 版本 |
| 上游 Node engines | 以固定源为准 | `^22.19.0 \|\| >=24.0.0` |
| pi-ai | `0.85.1` | `0.87.1`，保留上游配套 patch 与锁文件解析结果 |

目标锁文件摘要来自目标 commit 的原始文件，不是应用 Mio 补丁后的文件。
实施时重新计算并比对；另记录叠加 Mio 依赖后的锁文件摘要。
共享 dsh/Cordis 包继续解析宿主副本；Mio 插件的 dsh 接口依赖使用 peerDependencies，
必要时加 devDependencies，不允许带入第二份运行时。核对 ASR/TTS 现有声明时也遵守该规则。

所有源变更必须进入 `desktop/`、`script/desktop/` 或 `desktop/patches/` 的受审输入。
`.desktop-build/upstream` 仅是生成工作区，不是维护入口。
保留既有 checkout 的未归档工作；发现不匹配时沿用准备脚本的拒绝行为，不自动 reset/clean。

## 3. 已完成评估与破坏性变更清单

已完成：读取两个精确 tag 的源码、核对当前产品组合、在无 Mio 改动的目标源码上运行
`git apply --check`、计算目标原始锁文件摘要。未完成：新版安装、构建、运行回放、真实 API、
旧 profile 恢复、签名安装包和自动更新。

| ID | 结论 | 影响 | 本 spec 的处理 |
|---|---|---|---|
| C01 | 已确认：36 个补丁文件中 11 个不能直接应用 | 准备脚本立即失败，无法靠更改 pin 完成升级 | 逐块重做补丁并检查全部 36 个文件，见第 4 节 |
| C02 | 已确认：Schedule 从 Web 组合移入可选 bundle | 旧 `id` 覆盖项找不到原行；工具/页面消失，提醒停止投递；任务仍在磁盘 | 采用上游重新启用 bundle 的流程，明确披露中断窗口，见 5.3 |
| C03 | 已确认：Desktop 新增默认启用的产品事件采集 | 现有反馈关闭配置不覆盖它，原样升级会新增面向 DeepSeek 的产品事件请求 | 用官方 Config 关闭采集，保留 RPC 服务，见 5.2 |
| C04 | 已确认：新 CLI 启动器硬编码官方可执行文件名 | Mio 安装包内启动器会指向不存在的程序；默认 dsh home 也与 Mio 不同 | 仅适配产品身份、home 与命令注册，见第 6 节 |
| C05 | 已确认：pi-ai 及目录升级；MiMo 损坏尚未证实 | 部分第三方旧模型 ID 移除；MiMo wire/续传需重验 | 保留显式模型声明与 compat，通过真实适配器验收 |
| C06 | 已确认：旧 `transcriptView: normal` 解释改变 | 从 standard 变成 detailed；Desktop 未配置时仍是 standard | 采用上游语义，不自动改用户保存值；升级说明提供选择 standard 的操作 |
| C07 | 已确认：欢迎声明版本改变 | 浏览器访问同一 Host 可能重新显示官方声明 | 审查内容后同步到 `2026-09-28.1`，保留 Mio 关闭官方 onboarding 的策略 |
| C08 | 已确认：上游补录音 entitlement 和 Intel Node 签名修复 | Mio 旧 entitlement 补丁与新版打包配置重叠 | 采用上游实现、删除重复补丁，验证最终签名 |
| C09 | 已确认：macOS 启动读取登录 shell 环境 | GUI 的 PATH、代理和环境 Key 来源变化 | 保留上游机制，验证产品 home 不漂移，见 6.3 |
| C10 | 条件性：第三方插件可能不兼容 0.2 | 版本约束或 peer 不满足时，上游兼容性检查可能拒绝加载/操作 | 保留拒绝与诊断，不自动豁免版本或强装 |

源码比较中，`session-format`、V3→V4、JSONL 持久化、credentials-local、settings、
speech-to-text、tools、fs 和 agent-preset-registry 的 `src/` 未变。
这支持“暂不需要专用数据迁移或重写 Mio 插件”的判断，**不证明新版本写出的每一种事件
都能被旧版本读取**。UI/theme、调度及其他事件生产者仍有变化，回退必须配套旧数据备份。

## 4. 补丁与构建方案

### 4.1 已确认冲突文件及处理意图

下表路径相对上游源码根；冲突来自实际 `git apply --check`，不代表每项都有 API 破坏。

| 上游文件 | 重做要求 |
|---|---|
| `apps/desktop-host/package.json` | 保留新版 CLI 入口、Koffi 和新增依赖；重新叠加 Mio 产品依赖闭包 |
| `apps/desktop/scripts/electron-builder-config.mjs` | 保留 Mio 身份、GitHub feed、Windows unsigned 规则；使用上游 entitlement 文件 |
| `apps/desktop/src/client/WelcomePage.tsx` | 迁移 MiMo Key/区域输入，保留新版原生布局与接口 |
| `apps/desktop/src/locale.ts` | 合并 Mio 中英文文案、新更新提示和命令管理文案 |
| `apps/desktop/src/main.ts` | 重新接入产品身份、home、协议、更新、CLI 和新版启动环境；保留上游生命周期 |
| `apps/desktop/src/update-coordinator.ts` | 保留 Mio updateOrigin 条件，同时保留新版下载结果回调与退出协调 |
| `apps/desktop/src/welcome-backend.ts` | 保留 MiMo discovery/settings/credentials 流程，补齐新版 analytics RPC 合约 |
| `apps/desktop/src/welcome-window.ts` | 合并窗口调用接口，验证欢迎页尺寸、区域选择和麦克风路径 |
| `packages/experimental/voice-input-bundle/locale/zh.json` | 重新叠加 MiMo ASR 文案 |
| `packages/experimental/voice-input-bundle/package.json` | 保留新版包元数据，重组 MiMo ASR 依赖，保持官方录音/编码/UI |
| `pnpm-lock.yaml` | 从目标原始锁文件生成 Mio importer/依赖差异，不搬运旧版整个 lock |

其余可应用的补丁也必须做语义审查，重点包括 `project-manager.ts` 的启动/恢复 bundle、
Host 临时端口、预设过滤、Hero 品牌、客户端产品版本、安装器、烟雾测试和上游 workspace 清单。
“补丁能应用”不能替代生成包内容核对。

### 4.2 生成过程和退出条件

1. 使用固定目标源码与原始锁文件，重放 Mio 产品意图，不使用 fuzz/reject 自动拼接。
2. 删除 Mio 的 `resources/entitlements.mac.plist` 重复实现，改用上游 `scripts/macos-entitlements.plist`；保留 Mio 用途文案。
3. 重新审查所有 `desktop/*/package.json`，使产品包与目标 workspace 版本一致，保持宿主 peer 单例。
4. 在受控准备环境生成锁文件差异；后续本机、CI、打包均使用 frozen install。
5. 新增生成输出时同时更新 `prepare.mjs` 的精确文件白名单和 `run.mjs` 输入哈希集合。
6. 干净 checkout 可完整应用补丁，reverse-check 成功；重复 prepare 幂等；意外源改动仍被拒绝。
7. 最终依赖树、Host/CLI 产物和 ASAR 中都包含所需 Mio 包；不存在 0.1.7 与 0.2 的活动运行时混装。

沿用上游构建脚本和其自带校验；Mio 源码遵守 Node/erasable syntax 规则。
根工作区 `bun run typecheck` 不能替代生成 Desktop 的完整构建和上游类型检查。

## 5. 产品组合与旧配置

### 5.1 MiMo、品牌、语音和媒体

保留 `desktop/bundle/mio.patch.yml` 中的 `openai-completions` 路由以及以下配置：

```yaml
compat:
  thinkingFormat: deepseek
  supportsReasoningEffort: false
  maxTokensField: max_completion_tokens
  requiresReasoningContentOnAssistantMessages: true
```

Flash/Pro 显式声明 `input: [text, image]`，上下文/输出应用预算保持 262144/32768。
不因目录升级推断新模型能力。真实请求必须证明 thinking、图片和工具结果续传仍符合 MiMo wire。
`saved-model-input.js` 继续只补缺失的 input；显式 `[text]`、自定义模型及其他 provider 不被改写。

保留 `hidden-presets.js`，设置页/新会话选择器的隐藏列表继续一致；历史 preset 注册不能删除。
品牌使用原有 slots 和主题 tokens；新增上游 UI 检查中英文、深浅色和小窗口，不重做布局。
ASR 使用官方采集/编码/授权 UI，TTS 保留声音与播放生命周期，媒体工具继续通过官方 fs/权限边界。
新上游没有充分覆盖上述 MiMo 专属能力的证据，本轮不删除这些插件。

### 5.2 产品事件采集和声明

产品默认策略：**不启用新版新增的 Desktop 产品事件采集**。使用官方配置，不 fork exporter。
在 Mio bundle 对已存在的 `product-analytics` 行配置 `enabled: false`，保留 `appVersion` 等必要字段；
例如以下意图须由渲染后的有效配置验收，而非假定嵌套配置会自动深合并：

```yaml
- id: product-analytics
  config:
    enabled: false
    appVersion: !!js process.env.DSH_CLIENT_VERSION
```

保留 `productAnalytics` 和其依赖服务的装载，确保 welcome 的 `enabled/report/watchPolicy` 调用有效。
不要以 `disabled: true` 同时拆掉 RPC 服务来关闭采集。后端关闭后，启动、欢迎页、发送、模型切换、
插件开关及退出都不应产生产品事件外发。以真实 Desktop profile 和本地 HTTP collector 验证；
仅测 Web profile 无效，因为上游本来就只在 Desktop 启用该链路。

反馈相关三个行仍关闭。`session-telemetry-otel`、`session-log-deepseek`、产品 analytics 是不同链路；
不得把此配置描述成“禁止所有网络”或“关闭所有会话日志上传”。保留既有会话日志配置语义，
核对新增日志设置 UI 与其效果，并分别记录 MiMo 路由、用户主动选择 DeepSeek API 路由的行为。
不要把旧文档里对 legacy runtime 的离线测量当作新 Desktop 的证据。

审查新版官方声明内容后同步 `welcomeNoticeVersion`；继续关闭官方 Key onboarding，
保持 browser 与 Desktop 两条入口的 Mio 接入体验。不得以更新确认值代替数据行为检查。

### 5.3 自动化兼容策略

采用上游官方可选包 `@deepseek-ai/dsh-experimental-schedule-bundle`，不新建兼容调度插件，
不为所有用户默认开启自动化，不自动改写旧 patch 或提醒数据。

| 旧状态 | 升级后的预期 | 操作 |
|---|---|---|
| 未启用自动化 | 继续关闭 | 无操作 |
| 用 `schedule/time-context/ui-schedule` 的旧覆盖项开启过 | 新 bundle 未开启前不投递；可出现 entry not found 警告 | 完全退出旧版、升级后，在插件管理“官方”分组开启“自动化任务”，重启并核对 |
| 含 `deliveryHistoryDays` 等自定义设置 | 原覆盖项保留 | bundle 插入原 ID 后重新生效；不要删除这些配置 |
| 曾显式关闭某些 Schedule 行 | 继续尊重其禁用项 | 启用 bundle 时由用户检查开关，不自动覆盖 |

release notes 和升级文档必须显著写明：**已有自动化需要重新启用；升级至完成操作期间不保证投递**。
仅开启新 bundle 并不证明历史漏触发会补发；错过触发点的处理、暂停状态、任务 ID、原会话关联和
投递记录以新版官方实现为准，测试记录实际行为。不得重写任务、复制投递记录或自行补投。

验收使用旧版真实产生的 profile/任务数据：开启 bundle 后列表恢复，未来任务按预期投递，
不会重复执行已确认的投递。只设置 `disabled: false` 的冗余旧覆盖项可由用户按官方文档删除。
本次不承诺自动化无缝升级；依赖不中断提醒的安装应先完成独立验收再升级。

### 5.4 其他设置和第三方插件

- `transcriptView: normal` 采用上游 detailed 解释；不主动重写磁盘值。需旧效果时选择 standard。
- 用户保存的 compact/standard/detailed/verbose 保持；无配置 Desktop 仍为 standard。
- 保留自定义 provider、endpoint、模型、输入类型和 reasoning 选择；失效目录 ID 给出可操作诊断，
  不静默改为 MiMo 或将请求发送到另一 provider。
- 保留上游插件版本兼容检查和拒绝行为；不自动执行 allow-version、修改豁免记录或强装依赖。
- 不因某个可选插件失败而清空 profile。恢复流程仍挂载 Mio bundle；验证关键功能可恢复后才发布。

## 6. Desktop CLI、环境与打包

### 6.1 CLI 产品适配

保留上游 Electron Node 模式、内置 pnpm、Windows 控制台信号处理和插件管理实现。
对外命令使用 **`mio` / `mio.cmd`**，菜单为“管理 mio 命令…”。这属于产品载体适配，
不修改 dsh CLI 分派器、插件兼容算法或 profile 锁机制；内部技术诊断可保留 dsh 名称。

在 `desktop/product.json` 增加单一产品字段 `cliCommand: "mio"`，由准备脚本验证为安全的
小写命令名（首字母为字母，其余仅字母/数字/连字符）。应用名、协议、home 使用已有字段，
不在不同 launcher/脚本中各写一套常量。新增产物需进入精确白名单和构建证据。

必须同步处理以下产品边界，不只修改 launcher：

- macOS/Windows 启动器目标可执行文件、公开脚本名、打包复制与 smoke checks。
- 命令检测（`command -v` / Windows PATH）、菜单/状态文案和 worker 的文件名断言。
- macOS 目标 `/usr/local/bin/mio` 及独立所有权/备份文件；Windows PATH 所有权注册表项和互斥身份。
- 不能共用官方 dsh 的所有权记录、覆盖其 launcher，或在移除 Mio 命令时删除官方 PATH 项。
- 保留上游确认、指纹复核、备份/恢复、管理员提权取消、并发替换保护；特权 worker 目标继续由
  受审产品常量决定，不能允许任意运行时路径输入扩大写入权限。
- 安装器不自动注册命令。仍由用户在菜单安装/修复/移除；卸载前如何移除写入用户文档。

### 6.2 CLI 和 GUI 的 home 一致性

上游普通 CLI 默认 `~/.dsh`，不能直接用于 Mio。Mio 产品启动边界必须在调用普通 CLI 前设置
与 GUI 一致的 `DSH_HOME`：显式 `MIO_HOME` 优先，否则使用本产品的 userData/dataDirectory。
继承的官方 `DSH_HOME` 不能使已安装的 Mio CLI 默认访问官方安装数据。
若默认 userData 无法可靠解析，应明确报错并允许使用 `MIO_HOME`，不能退回 `~/.dsh`。

GUI 继续以 Electron 的 userData 为依据；CLI 在 Electron Node 模式的路径解析须按平台校验，
覆盖 macOS Application Support、Windows 重定向 APPDATA、空格/中文路径。
共用产品路径规则，不改变上游 `dsh-home-paths` 的全局默认行为。
`MIO_HOME` 的解析在读取任何 profile/凭据前完成，不把账户 Key、绝对用户路径写入可发布证据。
相对 `MIO_HOME` 以用户主目录为基准，不能依赖 GUI 或 CLI 的启动工作目录。

验收命令至少包括 `mio --version`、`mio plugin --profile desktop list` 和一次安装/移除测试插件。
`--version` 允许显示委托运行时的 `0.2.0-rc.2`，不篡改依赖兼容性所用的 dsh 版本；
应用 About/设置/安装器继续显示 Mio 产品版本。文档说明两者区别。
GUI 未初始化 desktop profile 时，CLI 沿用上游拒绝；GUI 运行时，沿用 profile 写锁拒绝修改。

不增加 CLI 进程热接管或更新期运行时保留机制。沿用上游边界：更新/卸载前应结束 CLI 命令，
关闭 GUI 不等于 CLI 已退出。必须验证该限制下正常退出、SIGINT 和更新不残留锁。

### 6.3 登录 shell 环境

保留新版 macOS 一次性登录 shell 读取及超时/取消/回退机制，Windows 仍跳过。
Mio home 在读取前按产品规则确定，并以同一有效 `DSH_HOME` 交给所有 Host；
不能因后读入的 shell 中另有 `MIO_HOME` 或 `DSH_HOME` 造成 GUI 与 Host 操作不同 profile。
GUI 和 CLI 在相同的显式启动配置下必须得到相同 home；不同环境中的显式覆盖不会自动同步。

明确行为：GUI 的 home 覆盖来自应用启动环境；只修改 shell 启动文件里的 home 不构成 GUI 搬家。
终端 CLI 会继承该 shell 已导出的 `MIO_HOME`；如需与 GUI 共用自定义 home，二者都需以同一覆盖值启动。
shell 中导出的 `MIO_API_KEY`、PATH、代理可按上游规则供 Host 使用，凭据优先级仍由上游决定。
用户改动 shell 文件后需要重启应用。通过受控 shell 验证环境优先级和失败回退，不能记录真实 Key。

### 6.4 平台打包

- 使用上游 `scripts/macos-entitlements.plist`；删除 Mio 重复 entitlement 文件/引用。
- 同时验证 Electron 主应用麦克风权限和 Intel 内置 Node 所需 entitlement；不能只检查主 app。
- 继续验证原生 addon、Office、PTY、ASAR 路径和全新安装的 CLI，无系统 Node/pnpm 也能工作。
- 维持 Developer ID、签名、公证、staple、Gatekeeper 检查；Windows 维持 unsigned 标识和 SHA-512 feed 校验。
- 欢迎页、About、安装器、任务栏/托盘、协议、文件命名和 UI 版本都使用 Mio 身份。
- 保留官方更新准备、退出/重启及命令注册操作协调；上报关闭不应阻塞下载结果或错误反馈。

## 7. 数据保留、升级和回退

### 7.1 验证数据与运行边界

第一组数据由 0.4.5 在隔离环境真实生成，包含会话、工具结果、分支/子 agent、图片、设置、
语音偏好、MCP、第三方插件以及自动化。第二组可使用经授权的实际用户数据副本。
不修改原始 home，不把真实历史发送给模型来证明“能恢复”；静态恢复与脱敏/合成续聊分开验证。

| 数据 | 升级要求 |
|---|---|
| session 日志、附件、workspace 关联 | 旧会话可打开；新回合正常追加；不用清库或修改旧日志来消除错误 |
| credentials、provider endpoints | Key 继续可解析；401 等失败不覆盖已有有效凭据；区域和自定义地址保持 |
| profile bundles、patch、插件列表 | 不丢失自定义项；保留明确拒绝和诊断；Schedule 按 5.3 处理 |
| 图片模型列表 | 没有 input 的旧列表补全；用户显式值保持 |
| preset 默认和历史 | 隐藏默认按已有插件规则恢复；历史 preset 不失去注册 |
| 主题/语言/声音/转录语言 | 保留，且前后端可见状态一致 |
| Schedule 数据 | 任务与投递历史保留；重新开启后的语义单独验收 |

记录副本升级前后文件清单与哈希；只解释预期设置修复、正常日志追加及上游正常维护写入，
不能要求整个 home 哈希完全不变，也不能对未经解释的文件丢失或批量重写放行。

### 7.2 候选测试和正式切换

1. 完全退出应用、Host 和 CLI，确认没有写入进程；私下备份整个 Electron userData 及 active home，
   包括隐藏文件。默认 home 已包含在 userData 中；外置 `MIO_HOME` 需要单独备份。
2. 保留 0.4.5 安装包及校验和；记录实际 userData、home、平台和架构，不发布含隐私的路径清单。
3. 对副本运行候选版，使用独立浏览器/Electron userData，避免另一个应用实例共享 cookie、锁和设置。
4. 完成第 8 节矩阵和自动化重新启用操作；记录恢复与新回合结果。
5. 正式升级仍使用同一 appId/home；首次成功打开不等于完成验收，必须确认 Key、历史与一次完整工具回合。

本次不新增自动备份产品功能；备份属于候选验证和已知回退操作。升级说明给出可执行的退出、
备份、覆盖安装、检查及回退步骤，并明确正式包未内置自动备份。

### 7.3 回退

触发条件：启动/恢复失败、Key 或设置丢失、MiMo 核心 wire 回归、签名/Office/麦克风异常、
错误更新源、非预期采集、无法解除的 profile 锁，或无法解释的数据修改。

回退顺序：停止新版及 CLI → 将升级后的 userData/home 另存 → 恢复 0.4.5 安装包及完整升级前
userData/home → 启动并核对原有会话/Key。不要直接让旧版读取新版已写入的唯一数据副本，
也不要手工混合日志代际。单独检查 updater 下载缓存与待安装状态，确认退出/重启不会再次应用新包。
新版新增会话留在另存副本中，本轮不承诺向旧版合并。

若已安装新 `mio` 命令，降级前从新版菜单移除；降级后修复残留 PATH/链接遵守已有所有权规则，
不能删除同名第三方命令。若生产发布失败，先按第 10 节停止继续分发，再执行受影响安装的回退。

## 8. 验证矩阵与证据

每条必须有 passed/failed/blocked/not-run 状态；blocked/not-run 不能作为通过。
优先复用现有真实实现测试，不新增只对实现字符串做断言的测试来代替行为验证。
外部 API/collector 可用本地 HTTP fixture；不 mock dsh 的 provider、settings、session 或 CLI 实现。

| Gate | 场景 | 通过标准 | 证据与执行范围 |
|---|---|---|---|
| G01 | 来源、补丁与依赖 | tag/SHA/原始摘要正确；干净应用/reverse-check/重复 prepare；冻结安装；共享 peers 单例 | 三平台构建日志、补丁审查、build-record |
| G02 | 构建与质量 | 完整上游 Desktop build；Mio lint/typecheck/既有回归通过；受影响上游测试通过 | CI + 本机；根工作区检查不能替代 Desktop build |
| G03 | MiMo cassette 回放 | thinking on/off、reasoning_content 续传、工具碎片、错误、截断不执行危险残缺工具 | `composition.test.ts`，三平台 |
| G04 | Web 与 native welcome | 默认/UltraSpeed 两种组合；Key 验证保存重启；CN/SGP/AMS/PAYG 路由；失败不污染凭据；认证/reload 正常 | `web.test.ts`/`web-probe.mjs`、实际 Electron |
| G05 | 旧图片配置与 presets | 0.4.3/0.4.5 风格保存配置补 input；显式 input 不变；隐藏默认修复；历史 preset 可恢复 | 真实 profile 集成测试 |
| G06 | 语音与媒体 | 麦克风授权/拒绝/重开；ASR 语言；TTS 声音/预览/停止；媒体路径/权限/尺寸限制；PDF 拒绝 | 现有 Web 测试、live probes、三平台 UI |
| G07 | 历史与用户配置 | 第 7 节数据矩阵通过；打开、追加、退出再恢复；MCP/第三方插件兼容与失败恢复 | 0.4.5 生成的数据副本、脱敏摘要 |
| G08 | Schedule | 关闭态不启用；旧启用态按文档恢复；任务/历史不丢；未来触发；暂停/过期/重启语义及重复投递检查 | 真正的旧/新 runtime + 隔离模型端点 |
| G09 | 新行为与外发 | analytics RPC 可用且默认 enabled=false；驱动各事件并等待批处理/退出后 collector 为零；日志链路分别记录 | 真实 desktop profile、渲染配置与本地 collector |
| G10 | CLI | 无系统 Node/pnpm 可用；命令安装/修复/移除；官方并存；正确 home；profile 锁；未初始化拒绝；SIGINT | 三平台安装包；受控用户/VM 中验证注册 |
| G11 | GUI 环境 | Finder/Dock 和终端启动；PATH/代理/Key 优先级；home 不漂移；shell 超时/取消/失败回退 | macOS arm64/x64；Windows 跳过探测验证 |
| G12 | UI 回归 | 中英文、深浅色、小窗口；欢迎/设置/模型搜索/计划审阅/品牌；无错误官方登录入口 | 三平台截图/操作记录；不改原生布局 |
| G13 | 安装与签名 | 双 mac 签名公证/麦克风；Intel 内置 Node/Office；Windows 真安装/unsigned；Host/CLI/PTY 启动退出 | `verify-release.mjs` 和上游 packaged smoke |
| G14 | 更新与回退 | 版本独立、双架构 feed、取消/失败/重试/重启；0.4.5 数据保留；旧包+备份恢复通过 | 见第 10 节，区分发布前与生产链验证 |

### 8.1 真实 MiMo 验证范围

Flash/Pro 至少重复已有 CN Token Plan 的真实覆盖：thinking on/off、真实工具调用和结果续传、
图片、语音与一次音视频工具回合。Cassette 仍是历史 V2.5 响应，不能据此宣称 V2.6 已实测。
不修改录制来掩盖升级回归；必要的新 cassette 从真实 API 重新捕获并去除凭据。

PAYG/SGP/AMS 用真实 welcome/路由与本地 HTTP 验证配置正确；有可用账户时补 live。
若没有账户，记录为“配置路径已验、真实账户未验”，不扩大支持声明；缺少原已支持的 CN 核心
live 验证则阻断正式发布。UltraSpeed 仍不因开关测试通过而标记真实可用。

### 8.2 执行入口

以下为实施阶段命令，不是本次已执行结果。所有 runtime 测试从 package/desktop 目录运行。

```sh
# 仓库根目录：准备、构建及 Mio 检查。
bun run prepare:desktop
bun run build:desktop
bun run lint
bun run typecheck

# desktop/ 目录：真实集成回归。
node --test test/*.test.ts

# desktop/ 目录：在受控环境提供凭据后，单独运行 opt-in live probes。
node --expose-internals test/live-probe.mjs
node --expose-internals test/image-live-probe.mjs
node --expose-internals test/voice-live-probe.mjs
```

媒体 live probe 继续按 `desktop/README.md` 提供合成 samples。上游 CLI、command-management、
login-shell、signing、pi-ai compat、analytics 等受影响测试从各包目录，按目标源码的官方
Vitest 配置执行；不从 Mio 根目录执行测试，不直接调用 tsc，也不跳过上游构建检查。

公开证据沿用 `build-record.json`、各平台 `qualification.json` 和最终合并资格报告，增加本次
Gate 的执行命令、状态和说明。凭据、Cookie、真实历史、完整环境、home 副本保留在本地，不能上传 CI artifact。
新增 live 结果使用单独的本次升级证据路径；不能覆盖旧验证记录后丢失原始适用版本。

## 9. 工作分解与文件范围

| 阶段 | 工作与预期文件 | 依赖 | 退出条件 |
|---|---|---|---|
| P0 基线与回退准备 | 固定目标源；记录 0.4.5 包/数据样本；列全补丁与现有插件 | 本 spec | 来源和隔离验证目录可复现，旧数据可独立恢复 |
| P1 上游重整 | `desktop/upstream.lock.json`、`desktop/patches/*`、`desktop/*/package.json`、prepare/run 输入 | P0 | G01；原生工作区全量构建 |
| P2 产品适配 | `desktop/bundle/mio.patch.yml`、CLI 产品字段及受审载体补丁、欢迎/更新/签名 | P1 | G03–G06、G09–G12 的可执行测试具备并通过对应环境 |
| P3 兼容与文档 | profile/会话/Schedule/插件测试；`desktop/test/*`；README/MIGRATION/VALIDATION/升级说明 | P2 | G07/G08；所有条件性破坏有明确操作和验证 |
| P4 RC 资格 | `product.json=0.5.0-rc.1`；release 测试；三平台资格构建；内测回退 | P3 | 所有发布前 Gate 通过；RC 仅通过 artifacts 分发 |
| P5 正式资格与发布 | `product.json=0.5.0`；`desktop/releases/v0.5.0.md`；重新构建资格包 | P4 | 正式树/产物完全匹配；发布后生产更新核验 |

改动边界：新增能力优先使用上游插件/Config；MiMo 专属插件仍从产品 bundle 挂载。
CLI 的产品名/home/包装属于已有 Desktop 载体补丁，不借此修改 CLI 核心或上游共享 home 语义。
如发现核心 API 不兼容，先记录最小复现和上游接口变化，再调整 spec，不能在生成目录留下临时 fork。

文档在相应阶段同步 `AGENTS.md`、`MIGRATION.md`、`desktop/README.md`、`desktop/patches/README.md`、
`desktop/VALIDATION.md`、根中英文 README 与发行说明。旧 `docs/mio-desktop-plan.md` 的历史“尚未发布”
状态不得再被当作 0.4.5 的现状；保留历史时加明确时间/适用范围。本次写 spec 不提前把 pin 标成已升级。

估算：P0–P3 约 2–4 个工作日，P4–P5 约 1–2 个工作日；合计 3–6 个工作日，
不含签名/平台资源等待、缺少真实账户或上游阻断修复。发现 profile 或 CLI 边界需重做时重新估算。

## 10. 内测、发布和自动更新

### 10.1 现有发布链限制

`script/desktop/prepare.mjs` 接受 `-rc.N` 版本，但 `script/desktop/publish-release.mjs`
只接受 `x.y.z`，且最终使用 `--latest`。因此本 spec **不通过现有 publish workflow 发布 RC**。
内测使用 `official-desktop-release` 的三平台资格 artifacts，下载后在隔离 home 手动安装。
现有 artifacts 保留 7 天；内测前在私有受控位置保存对应包和证据，避免资格文件过期。

RC 不创建公开 release/tag，不上传可被生产读取的 feed；其内置 updateOrigin 保留正式源以检验包配置。
验证 RC 时不把“正式源没有更高版本”误解成更新链已验收。新建公开 RC 通道不在本 spec 范围内。

### 10.2 发布前可以证明什么

- 用真实 updater/上游测试边界和隔离 HTTP feed 验证元数据、正确架构、SHA-512、下载、失败重试及状态。
  测试源只存在于验收环境，不放宽产品 updateOrigin 校验或修改生产签名包来绕过配置。
- 用签名/实际安装包完成 0.4.5 → 新版的手动覆盖安装，验证 userData、home、Key、会话和回退。
- 生产 `releases/latest/download` 在发布前仍指向旧版，不能在此阶段声称已完成真实生产自动更新。
  若实际旧版 updater 的网络路径未在隔离环境跑通，须明确标记其验收范围，发布后核验不能省略。

### 10.3 正式发布顺序

1. RC 验收完成后将产品版本设为 `0.5.0`，同步版本断言、README、说明和验证记录。
2. 对最终源树重新运行三平台 `official-desktop-release`；RC 包不能重命名后当正式包使用。
3. 审查 qualification/build-record 的 source tree、commit、dsh SHA、hash、架构、签名状态和 feed payload。
4. 最终 `main` tree 必须与资格 run 完全一致。后续即便只改文档，当前 publisher 的树校验也会拒绝旧资格；
   应重新资格构建，不能绕过此校验或拼接不同 run 的安装包。
5. 使用 `publish-qualified-desktop` 指向合格 run；沿用 draft → 上传核对 → 正式 latest 的现有顺序。
6. 发布后立即在保留的 0.4.5 验证安装上运行生产“检查更新”：双 Mac 架构、Windows x64 各确认
   版本、下载、重启安装和一次恢复续聊。保存实际 resolved feed/包哈希及结果，不含认证信息。
7. 再验证 0.5.0 重复检查无重复升级、断网/失败可恢复，网页下载指向本次正确平台包。

发布说明必须包含：内核仍是 RC、自动化重新启用、旧 normal 展示变化、CLI 安装与更新前退出限制、
数据保留/备份/回退、已验证账户范围、Windows unsigned。不要声称默认全自动兼容所有旧插件或旧模型。

### 10.4 发布故障处理

出现生产更新或数据阻断后暂停继续推广。按发布处置权限将 latest 恢复到已验证的旧 release，
或将新 release 暂退为 draft，并实测 `releases/latest/download` 已返回旧 feed；只改网页不算停止分发。
不删除/覆写版本 tag 或替换同一版本包。先确认生产 feed 回切，再按第 7.3 节回退受影响安装，
并验证恢复的 0.4.5 不会再次下载或应用故障版本。
GitHub latest 回切不会使已安装的新版本自动降级；修复版本必须使用新的 Mio 版本并重新资格验证。

## 11. 发布阻断条件与完成定义

以下任一情况阻断正式发布：

- 不能从固定输入复现构建、需要 fuzz patch 或非冻结依赖；出现重复 dsh/Cordis 实例。
- MiMo 核心回放/live、旧 profile 续聊、Key 保留、图片修复或工具权限边界失败。
- analytics 默认仍采集、welcome 因关闭服务失效，或最终配置/网络行为无法解释。
- CLI 指向错误可执行文件/home、覆盖官方命令、绕过 profile 锁或无法正常退出。
- 三平台任一资格失败；Mac 签名/麦克风/Intel Office 失败；Windows 安装后 runtime 不可用。
- Schedule 数据或明确设置丢失，或文档没有披露重新启用和中断窗口。
- 正式版本与资格产物/源树不匹配，更新元数据指向错误架构、源或未经资格验证的包。
- 已知严重回归尚未关闭，或第 7.3 节实际回退演练未通过。

正式发布前完成定义：所有 G01–G14 的发布前部分通过，限定账户缺口明确记录，
文档与实际版本一致，最终三平台包通过资格验证。
整个升级任务的完成定义还包括：发布后生产自动更新验证通过、证据留存、没有未处理的阻断项。
本 spec 创建本身不代表这些工作已经完成。

## 12. 来源与可追溯性

本地现状以 [产品清单](../desktop/product.json)、[上游锁定](../desktop/upstream.lock.json)、
[产品组合](../desktop/bundle/mio.patch.yml)、[受审补丁](../desktop/patches/0001-mio-desktop.patch)、
[准备脚本](../script/desktop/prepare.mjs)、[发布脚本](../script/desktop/publish-release.mjs)、
[安装包验证](../script/desktop/verify-release.mjs) 和 [v0.4.5 说明](../desktop/releases/v0.4.5.md) 为准。
以下上游源码链接固定到目标 commit，发布说明仅用于辅助理解，不替代源码与运行证据。

- [0.2.0-rc.1 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.1)
- [0.2.0-rc.2 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2)
- [Schedule 升级说明](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/upgrade-guide/v0.1.7-rc.2/schedule-optional-bundle/guide.zh.md)
- [transcriptView 升级说明](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/upgrade-guide/v0.1.7-rc.2/transcript-view-legacy-normal/guide.zh.md)
- [Web/Desktop 组合](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/bundle/web-app/cordis.patch.yml)
- [产品 analytics 策略](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/product-analytics/src/index.ts)
- [产品事件 exporter 配置](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/host/product-telemetry-otel/src/index.ts)
- [会话日志 provider 扩展](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/session/session-log-deepseek/src/index.ts)
- [CLI 载体设计](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/.agents/notes/implemented/feature/2026-09-27-desktop-cli-runtime.zh.md)
- [CLI 入口](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop-host/src/cli.ts)
- [登录 shell 环境设计](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/.agents/notes/implemented/feature/2026-09-28-desktop-login-shell-environment.zh.md)
- [pi-ai compat 边界](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/llm/llm-pi-ai/src/catalog.ts)
- [macOS 主应用 entitlement](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/scripts/macos-entitlements.plist)
- [macOS Intel Node entitlement](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/scripts/node-x64-entitlements.plist)
