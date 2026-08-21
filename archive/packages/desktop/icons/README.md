# Desktop Icons

macOS packaged icons use `icon.icns` from the selected channel folder via Electron Builder. Runtime Dock icons on macOS use `dock.png` through `app.dock.setIcon()`.

The macOS artwork follows Apple Human Interface Guidelines and Icon Composer as the visual reference. Electron still consumes flattened `icon.icns` and `dock.png` files, so the generator approximates the platform rounded enclosure and shadow in static PNG layers instead of requiring Xcode or Icon Composer in the build.

To regenerate macOS icons, run this from `packages/desktop`:

```bash
bun ./scripts/generate-mac-icons.ts
bun ./scripts/copy-icons.ts dev
bun ./scripts/check-mac-icon-geometry.ts
```

The generator creates inset icon layers from each channel's `icon.png`, rebuilds the rounded background with continuous-corner supersampling, adds a scaled static shadow, writes `icon.icns`, and copies the generated `icon_128x128@2x.png` layer to `dock.png`. The rounded-square body is tuned against Apple system app icons such as Music, Notes, and Passwords so the 256 px Dock layer has a 204 px opaque body and matching top-corner row widths. Keep `dock.png` synced with the ICNS layer so development Dock icons match packaged app icons.

Do not commit full-bleed macOS icon assets. The visible square artwork should be inset inside the 1024 px canvas; otherwise the app appears larger than normal macOS apps.

Because the generated files include shadow alpha outside the visible square artwork, validate icon size by the opaque body bounds and corner row widths, not by the full alpha bounds.

Do not directly scale the hard-edged source PNG for macOS rounded corners. That reintroduces visible stair-stepping on the icon mask.
