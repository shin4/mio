import { beforeEach, describe, expect, test } from "bun:test"
import { DEFAULT_SERVER_URL_KEY, readDefaultServerUrl, writeDefaultServerUrl } from "./default-server-url"

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  clear() {
    this.values.clear()
  }

  get length() {
    return this.values.size
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

const storage = new MemoryStorage()

beforeEach(() => {
  storage.clear()
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  })
})

describe("default server URL storage", () => {
  test("uses the MiMo key without reading the upstream opencode key", () => {
    localStorage.setItem("opencode.settings.dat:defaultServerUrl", "http://legacy.example")

    expect(DEFAULT_SERVER_URL_KEY).toBe("mio.settings.dat:defaultServerUrl")
    expect(readDefaultServerUrl()).toBeNull()
  })

  test("writes and clears the default server URL", () => {
    writeDefaultServerUrl("http://localhost:4096")
    expect(localStorage.getItem(DEFAULT_SERVER_URL_KEY)).toBe("http://localhost:4096")

    writeDefaultServerUrl(null)
    expect(localStorage.getItem(DEFAULT_SERVER_URL_KEY)).toBeNull()
  })
})
