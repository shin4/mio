import { beforeEach, describe, expect, test } from "bun:test"
import { PersistTesting, removePersisted } from "@/utils/persist"
import type { Platform } from "./platform"
import { defaultSettings, type Settings } from "./settings"

const platform: Platform = {
  platform: "web",
  openLink() {},
  async restart() {},
  back() {},
  forward() {},
  async notify() {},
}

describe("settings defaults", () => {
  beforeEach(() => {
    removePersisted({ key: "settings.v3" }, platform)
    removePersisted({ key: "settings.ttsVoiceClone.v1" }, platform)
  })

  test("shows custom agents by default when no preference is stored", () => {
    expect(defaultSettings.general.showCustomAgents).toBe(true)
  })

  test("keeps custom agents hidden when the user turned them off", () => {
    const normalized = PersistTesting.normalize(
      defaultSettings,
      JSON.stringify({ general: { showCustomAgents: false } }),
    )
    const settings = JSON.parse(normalized ?? "{}") as Settings

    expect(settings.general.showCustomAgents).toBe(false)
  })
})
