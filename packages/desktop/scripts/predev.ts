import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.MIO_CHANNEL ?? "dev"}`

await $`cd ../agent && bun script/build.ts`
