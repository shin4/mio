import { Server } from "@/server/server"
import { cmd } from "./cmd"

export const GenerateCommand = cmd({
  command: "generate",
  describe: false,
  handler: async () => {
    process.stdout.write(JSON.stringify(await Server.openapi(), null, 2))
  },
})
