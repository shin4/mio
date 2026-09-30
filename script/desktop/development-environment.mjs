/** Environment shared by the official build and development launchers. */
import { join } from "node:path"
import { resolveMioHome } from "../../desktop/bundle/home.js"
import { root } from "./prepare.mjs"

export function developmentEnvironment(product, env = process.env) {
  return {
    ...env,
    DSH_CLIENT_TITLE: product.name,
    // Normalize before upstream changes cwd or persists the development .app launcher.
    DSH_HOME: env.MIO_HOME === undefined ? join(root, ".desktop-build", "home") : resolveMioHome(product, env),
    DSH_DESKTOP_USER_DATA_DIR: join(root, ".desktop-build", "electron-user-data"),
    DSH_DESKTOP_OPEN_DEVTOOLS: env.DSH_DESKTOP_OPEN_DEVTOOLS ?? "0",
    // No publication delay: dependency identities are controlled by the committed lockfile.
    npm_config_minimum_release_age: "0",
  }
}
