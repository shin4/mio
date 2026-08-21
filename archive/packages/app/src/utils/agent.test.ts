import { describe, expect, test } from "bun:test"
import { dict as en } from "@/i18n/en"
import { dict as zh } from "@/i18n/zh"
import { dict as zht } from "@/i18n/zht"
import { agentDisplayLabel } from "./agent"

const translate = (dict: Record<string, string>) => (key: string) => dict[key] ?? key

describe("agentDisplayLabel", () => {
  test("localizes built-in primary agent labels", () => {
    expect(agentDisplayLabel("build", translate(en))).toBe("Action")
    expect(agentDisplayLabel("plan", translate(en))).toBe("Plan")
    expect(agentDisplayLabel("build", translate(zh))).toBe("执行")
    expect(agentDisplayLabel("plan", translate(zh))).toBe("计划")
    expect(agentDisplayLabel("build", translate(zht))).toBe("執行")
    expect(agentDisplayLabel("plan", translate(zht))).toBe("計劃")
  })

  test("keeps custom agent names unchanged", () => {
    expect(
      agentDisplayLabel("reviewer", () => {
        throw new Error("custom agents should not request translations")
      }),
    ).toBe("reviewer")
  })

  test("defines labels in English and Chinese dictionaries", () => {
    expect(en["agent.label.build"]).toBe("Action")
    expect(en["agent.label.plan"]).toBe("Plan")
    expect(zh["agent.label.build"]).toBe("执行")
    expect(zh["agent.label.plan"]).toBe("计划")
    expect(zht["agent.label.build"]).toBe("執行")
    expect(zht["agent.label.plan"]).toBe("計劃")
  })
})
