# 发布与构建（Release / CI）

MiMo-Code 桌面端通过两个 GitHub Actions 工作流构建：

| 工作流 | 文件 | 触发 | 作用 |
| --- | --- | --- | --- |
| `build-check` | `.github/workflows/build-check.yml` | PR、推送到 `main` | macOS(arm64) + Windows(x64) **未签名**的编译 + 打包冒烟测试，尽早发现构建/打包问题。不使用任何密钥。 |
| `release` | `.github/workflows/release.yml` | 推送 `v*` tag，或手动 `workflow_dispatch` | 构建并签名/公证 macOS(arm64) + Windows(x64) 安装包，发布到 GitHub Release，并附带自动更新元数据（`latest.yml` / `latest-mac.yml`）。 |

> 现有的 `ci.yml`（gitleaks + typecheck）保持不变。

构建矩阵当前为 **macOS arm64 + Windows x64**。如需新增 Intel macOS 或 Windows ARM64，见文末「扩展架构」。

---

## 发布一个版本

1. 确认改动已合并到 `main`。
2. 打 tag 并推送（版本号遵循语义化版本，**不要**手动改 `package.json`，CI 会自动写入）：

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. `release` 工作流会：
   - 先创建一个 **draft（草稿）** Release；
   - 并行构建 macOS / Windows，并把安装包 + 更新元数据上传到该 Release；
   - 全部成功后把 Release 从 draft 切换为正式发布。

也可以在 **Actions → release → Run workflow** 手动触发，填入版本号（不带 `v`）。

> 渠道固定为 `MIO_CHANNEL=prod`（appId `io.github.shin4.mimo.desktop`）。`dev` 渠道会禁用自动更新，不要用于正式发布。

---

## 需要配置的 GitHub Secrets

在仓库 **Settings → Secrets and variables → Actions** 添加。**全部为可选**：缺失时对应平台会产出「未签名」安装包，构建不会失败。

### macOS（签名 + 公证）

| Secret | 说明 |
| --- | --- |
| `CSC_LINK` | Developer ID Application 证书（`.p12`）的 **base64** 字符串 |
| `CSC_KEY_PASSWORD` | 导出 `.p12` 时设置的密码 |
| `APPLE_ID` | 你的 Apple ID 邮箱 |
| `APPLE_APP_SPECIFIC_PASSWORD` | App 专用密码（**不是** Apple ID 登录密码） |
| `APPLE_TEAM_ID` | 10 位 Team ID。设置后才会启用公证（notarization） |

只配 `CSC_LINK` + `CSC_KEY_PASSWORD` → 只签名不公证（仍会被 Gatekeeper 拦）。要让用户「双击即可打开」，五个都要配齐。

### Windows（暂不签名）

当前 Windows 安装包**未签名**（用户首次安装会看到 SmartScreen 提示）。要启用 Azure Trusted Signing，后续补上以下 Secret 即可，无需改工作流：

| Secret | 说明 |
| --- | --- |
| `AZURE_TRUSTED_SIGNING_ENDPOINT` | Trusted Signing 帐户的 endpoint |
| `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME` | 帐户名 |
| `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE` | 证书 profile 名 |

> Azure Trusted Signing 还需要 `az login` 的凭据（服务主体）。启用前请先告知，我会补上登录步骤。

---

## 生成 macOS 证书与密钥（首次发布前）

你已加入 Apple Developer Program，按以下步骤准备签名材料。

### 1. 创建 Developer ID Application 证书

桌面端在 App Store **之外**分发，必须用 **Developer ID Application** 证书（不是 "Mac App Distribution"）。

1. 钥匙串访问 → 证书助理 → 从证书颁发机构请求证书，保存 `CertificateSigningRequest.certSigningRequest`（CSR）。
2. 打开 <https://developer.apple.com/account/resources/certificates/list> → `+` → 选择 **Developer ID Application** → 上传上一步的 CSR → 下载 `.cer`。
3. 双击 `.cer` 导入钥匙串。

### 2. 导出为 .p12

1. 钥匙串访问 → 「我的证书」，找到刚导入的 *Developer ID Application: 你的名字 (TEAMID)*，展开能看到对应私钥。
2. 右键证书 → 「导出」→ 存为 `developer-id.p12`，设置一个密码（即 `CSC_KEY_PASSWORD`）。

### 3. 转成 base64（即 CSC_LINK）

```bash
base64 -i developer-id.p12 | pbcopy   # 已复制到剪贴板，直接粘到 CSC_LINK
```

### 4. 创建 App 专用密码（APPLE_APP_SPECIFIC_PASSWORD）

<https://account.apple.com> → 登录与安全 → App 专用密码 → 生成，形如 `abcd-efgh-ijkl-mnop`。

### 5. 找到 Team ID（APPLE_TEAM_ID）

<https://developer.apple.com/account> → Membership details → Team ID（10 位）。

配齐这 5 个 Secret 后，下一次 tag 触发的 `release` 即为已签名 + 已公证的安装包。

---

## 本地打包（无需 CI）

```bash
cd packages/desktop
MIO_CHANNEL=prod bun run package:mac     # 本机 macOS
MIO_CHANNEL=prod bun run package:win     # 从 macOS 交叉构建 Windows（package-win.ts）
```

本地默认不签名（未设 `CSC_LINK` / `APPLE_TEAM_ID`），产物在 `packages/desktop/dist/`。

---

## 工作原理要点

- **版本号来源**：`release` 用 `scripts/set-version.ts` 把 tag（去掉 `v`）写入 `packages/desktop/package.json`，electron-builder 据此打包；同一版本号通过 `MIO_VERSION` 注入 agent 构建，保持一致。
- **自动更新**：`electron-builder.config.ts` 的 `publish: github` 是必需的——它既生成 `latest*.yml`，又把 `app-update.yml` 打进 App，`electron-updater` 才能工作。各 job 用 `--publish always` 直接上传，因此**不需要** `finalize-latest-*.ts` 合并脚本（仅在单 OS 同时构建多架构时才需要）。
- **签名是「按需」的**：未配置密钥时 macOS 走 `CSC_IDENTITY_AUTO_DISCOVERY=false` 跳过签名、`notarize: false` 跳过公证；Windows 由 `sign-windows.ps1` 自行跳过。都不会让构建失败。
- **Windows 安装路径**：NSIS 已切换为引导式安装（`oneClick: false` + `allowToChangeInstallationDirectory: true`），用户可自选安装目录。

## 扩展架构（可选）

如需 Intel macOS / Windows ARM64：在 `release.yml` 增加 `macos-13`（Intel）/ 用 `package:win --arm64` 的 job；多架构同 OS 会产生多份 `latest*.yml`，此时再启用 `scripts/finalize-latest-yml.ts` 合并后上传。`scripts/finalize-latest-json.ts` 为遗留的 Tauri 更新清单，Electron 不使用，保持闲置即可。

---

## 应用标识符变更（一次性，随首个采用新命名空间的版本发布）

自该版本起，应用标识符从 `com.xiaomi.mimo.*` 迁移到自有命名空间 `io.github.shin4.mimo.*`
（prod `io.github.shin4.mimo.desktop`）。这等同于一个**全新的应用身份**，请在该版本的
Release Notes 中包含以下要点：

- **现有用户需手动重新安装**：macOS/Windows 都会把新版本视为新应用，自动更新不会从旧版本
  原地升级到新标识符。请下载并安装新版本；确认无误后可删除旧的 "MiMo Code Desktop"。
- **桌面端设置不会自动迁移**：服务器地址、窗口状态等桌面 shell 偏好（存于
  `appData/<appId>` 的 electron-store）会以新身份重新开始，需要重新设置一次。
- **会话与登录通常会保留**：Agent 的会话与认证数据存放在 XDG 数据目录（不随 appId 变化），
  不受本次重命名影响。
- 自动更新 feed 仍指向 `github.com/shin4/mimo-code` 的 Releases，未变化；后续版本将在新
  标识符下正常自动更新。

> 旧版 Tauri 用户的 `.dat` 数据仍可被导入：`migrate.ts` 保留了 `com.xiaomi.mimo.*` 作为
> 历史 Tauri 数据来源映射，新身份首次启动时会尝试导入。
