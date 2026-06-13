import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

const channel = (() => {
  const raw = process.env.MIO_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

// macOS signing/notarization are gated on credentials so unsigned dev/PR builds
// never fail. Set APPLE_TEAM_ID (+ APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD) to
// notarize, and CSC_LINK (+ CSC_KEY_PASSWORD) to code sign. With neither, set
// CSC_IDENTITY_AUTO_DISCOVERY=false to skip signing cleanly.
const appleTeamId = process.env.APPLE_TEAM_ID
const macSign = Boolean(process.env.CSC_LINK)

const getBase = (): Configuration => ({
  artifactName: "mio-desktop-${os}-${arch}.${ext}",
  // Publishing to GitHub Releases is what makes electron-builder emit the
  // electron-updater metadata (latest.yml / latest-mac.yml) and bake the
  // matching app-update.yml into the app. Without it auto-update is dead.
  publish: [{ provider: "github", owner: "shin4", repo: "mio" }],
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: ["out/**/*", "resources/**/*"],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    extendInfo: {
      NSMicrophoneUsageDescription: "Mio uses the microphone only when you start dictation.",
    },
    // electron-builder 26 schema requires mac.notarize to be a boolean. When
    // true, notarization reads APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD /
    // APPLE_TEAM_ID from the env. Gate on macSign since notarizing requires a
    // signed app, so a team id without a cert degrades to an unsigned build
    // instead of failing.
    notarize: macSign && Boolean(appleTeamId),
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: macSign,
  },
  protocols: {
    name: "Mio Desktop",
    schemes: ["mio"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    // Assisted installer (not one-click) so users can pick the install directory.
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    // AppImage only: it's the format electron-updater consumes (latest-linux*.yml),
    // and it avoids the fpm deb/rpm requirement for an author email / maintainer.
    // Re-add "deb"/"rpm" once a maintainer email is set (author.email or linux.maintainer).
    target: ["AppImage"],
  },
})

function getConfig() {
  const base = getBase()

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId: "io.github.shin4.mio.desktop.dev",
        productName: "Mio Desktop Dev",
        rpm: { packageName: "mio-desktop-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId: "io.github.shin4.mio.desktop.beta",
        productName: "Mio Desktop Beta",
        protocols: { name: "Mio Desktop Beta", schemes: ["mio"] },
        rpm: { packageName: "mio-desktop-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId: "io.github.shin4.mio.desktop",
        productName: "Mio Desktop",
        protocols: { name: "Mio Desktop", schemes: ["mio"] },
        rpm: { packageName: "mio-desktop" },
      }
    }
  }
}

export default getConfig()
