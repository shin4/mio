# Mio 品牌资产

图标主形是**「鲸尾·深潜 / The Sounding」**——鲸下潜前最后露出水面的尾鳍（含尾柄），
2026-08-22 定稿。题材向 DeepSeek 的「鲸」致意（Mio 的运行时是 dsh），色彩与几何取
小米的语言：品牌橙 `#FF6900`，瓷砖渐变 `#FF8A1F → #FF5E00`。图形为原创绘制，不复用
DeepSeek 与小米的注册商标图形。方向稿与三案对比存档见会话 Artifact「Mio 图标方向稿」。

## 文件

| 文件 | 用途 |
| --- | --- |
| `mio-mark.svg` | 裸标（透明底，1024 网格）——一切矢量使用的母版 |
| `mio-icon.svg` | macOS 瓷砖母版：1024 画布上居中的 824px 超椭圆（Apple 模板网格），不透明边界 100,100–923,923，无内嵌阴影 |
| `mio-icon-small.svg` | 16/32/64px 专用光学放大档（同一尾鳍，scale 0.80） |
| `banner.svg` / `banner.png` | README / Release 宣传横幅（1280×320，PNG 为 2× 导出） |
| `avatar.png` | 社媒 / GitHub 组织头像（1024²，满幅橙底，平台自行裁圆） |

## 同步的消费方（改标时一并更新）

- `packages/shell/resources/icon.{icns,ico,png}` — electron-builder 三平台图标（由本目录母版生成）。
- `packages/client-ui/src/client/Brand.tsx` — 应用内 `MioBrandMark`（内联转写，勿引资产文件）。
- `packages/client-ui/src/index.ts` — `FAVICON` 常量（dsh web 首页 `/favicon.svg`）。
- `docs/index.html` — 落地页 favicon data URI；`docs/assets/icon.png`（README 与 og:image 引用）。

## 再生成

栅格化用 macOS 原生 `NSImage`（保 alpha；qlmanage 会压平白底，无头 Chrome 截图有竞态，均不可用）：

```swift
// rasterize.swift — stdin 每行: <svg>\t<out.png>\t<px>
import AppKit
while let line = readLine() {
  let p = line.split(separator: "\t").map(String.init)
  guard p.count == 3, let px = Int(p[2]), let img = NSImage(contentsOfFile: p[0]),
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px,
      bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
      colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { continue }
  rep.size = NSSize(width: px, height: px)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  img.draw(in: NSRect(x: 0, y: 0, width: px, height: px), from: .zero, operation: .copy, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()
  try? rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: p[1]))
}
```

- **icns**：16/16@2x/32/32@2x 用 `mio-icon-small.svg`，128 及以上用 `mio-icon.svg`，
  按 `icon_<n>x<n>[@2x].png` 命名入 `icon.iconset/`，`iconutil -c icns icon.iconset -o icon.icns`。
- **ico**：16/32/48/64（small）+ 128/256（标准）的 PNG 直接打包为 PNG-compressed ICO
  （6 字节头 + 每图 16 字节目录项 + PNG 原文）。
- **linux / docs**：`mio-icon.svg` 出 1024px PNG。
- 校验：1024 档不透明边界应为 100,100–923,923；16 档中央 V 形豁口仍应可辨。

macOS 26 Liquid Glass 分层版（背景层 + 尾鳍层，Icon Composer 出 `.icon`）尚未制作，为可选后续。
