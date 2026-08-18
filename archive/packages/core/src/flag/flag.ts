import { Config } from "effect"

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  // Getter (not a captured value) so tests can repoint the MiMo provider at a
  // local TestLLMServer at runtime via process.env.MIO_BASE_URL.
  // (MIO_ is the app-namespace prefix; this var points at the MiMo model endpoint — that's intentional.)
  get MIO_BASE_URL() {
    return process.env["MIO_BASE_URL"]
  },
  MIO_MODEL: process.env["MIO_MODEL"],
  MIO_AUTO_HEAP_SNAPSHOT: truthy("MIO_AUTO_HEAP_SNAPSHOT"),
  MIO_GIT_BASH_PATH: process.env["MIO_GIT_BASH_PATH"],
  get MIO_CONFIG() {
    return process.env["MIO_CONFIG"]
  },
  // Getter (not captured at module load) so tests can set it at runtime —
  // config loading reads it per-call when seeding/loading config content.
  get MIO_CONFIG_CONTENT() {
    return process.env["MIO_CONFIG_CONTENT"]
  },
  MIO_DISABLE_AUTOUPDATE: truthy("MIO_DISABLE_AUTOUPDATE"),
  MIO_DISABLE_PRUNE: truthy("MIO_DISABLE_PRUNE"),
  MIO_DISABLE_AUTOCOMPACT: truthy("MIO_DISABLE_AUTOCOMPACT"),
  MIO_FAKE_VCS: process.env["MIO_FAKE_VCS"],
  MIO_SERVER_PASSWORD: process.env["MIO_SERVER_PASSWORD"],
  MIO_SERVER_USERNAME: process.env["MIO_SERVER_USERNAME"],
  MIO_DB: process.env["MIO_DB"],
  MIO_WORKSPACE_ID: process.env["MIO_WORKSPACE_ID"],

  MIO_EXPERIMENTAL_FILEWATCHER: Config.boolean("MIO_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  MIO_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("MIO_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),

  get MIO_DISABLE_PROJECT_CONFIG() {
    return truthy("MIO_DISABLE_PROJECT_CONFIG")
  },
  get MIO_CONFIG_DIR() {
    return process.env["MIO_CONFIG_DIR"]
  },
  get MIO_PURE() {
    return truthy("MIO_PURE")
  },
  get MIO_PERMISSION() {
    return process.env["MIO_PERMISSION"]
  },
  get MIO_PLUGIN_META_FILE() {
    return process.env["MIO_PLUGIN_META_FILE"]
  },
  get MIO_CLIENT() {
    return process.env["MIO_CLIENT"] ?? "desktop"
  },
}
