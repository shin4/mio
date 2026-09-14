// A deterministic local tool matching the live cassette's declared schema.
import { defineTool } from "@deepseek-ai/dsh-tools"
export const inject = ["tools"]
export function apply(ctx) {
  ctx.tools.register(
    defineTool({
      name: "get_weather",
      description: "Get the current weather for a city.",
      parameters: { city: { type: "string", required: true } },
      output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
      async execute(args) {
        if (args.city !== "Paris") throw new Error(`Unexpected city: ${args.city}`)
        return JSON.stringify({ forecast: "sunny", temperature_c: 22 })
      },
    }),
  )
}
