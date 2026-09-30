/** Resolve the product home before either the GUI Host or the installed CLI opens a profile. */
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

/** @param product - Validated product identity. @param env - Launch environment. @param userData - Electron's resolved userData, when available. */
export function resolveMioHome(product, env = process.env, userData) {
  if (env.MIO_HOME !== undefined) {
    if (!env.MIO_HOME.trim()) throw new Error("MIO_HOME must not be empty")
    const home = env.MIO_HOME.replace(/^~(?=$|[/\\])/, homedir())
    // Finder and terminal launches have different working directories.
    return resolve(homedir(), home)
  }
  if (userData !== undefined) return join(userData, product.dataDirectory)
  const appData = process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support")
    : process.platform === "win32" ? env.APPDATA : undefined
  if (!appData || !isAbsolute(appData)) throw new Error("Cannot resolve Mio application data; set MIO_HOME explicitly")
  return join(appData, product.name, product.dataDirectory)
}
