export const AppInfo = {
  id: "mio",
  projectConfigDir: ".mio",
  legacyProjectConfigDir: ".mimo",
  configBasename: "mio",
  legacyConfigBasename: "mimo",
  // schema/config.json is generated and committed by the schema-export step; this URL is intentional (pending that file landing on main).
  configSchema: "https://raw.githubusercontent.com/shin4/mio/main/schema/config.json",
  wellKnownConfigPath: ".well-known/mio",
  configFiles: ["mio.jsonc", "mio.json"] as const,
  legacyConfigFiles: ["mimo.jsonc", "mimo.json"] as const,
  desktopStore: {
    settings: "mio.settings",
    legacySettings: "mimo.settings",
    global: "mio.global.dat",
    legacyGlobal: "mimo.global.dat",
  },
} as const
