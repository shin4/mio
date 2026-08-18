import { resolveChannel } from "./utils"

const arg = process.argv[2]
const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

const appId = channel === "prod" ? "io.github.shin4.mio.desktop" : `io.github.shin4.mio.desktop.${channel}`
const productName = channel === "prod" ? "Mio" : `Mio ${channel.charAt(0).toUpperCase() + channel.slice(1)}`
const summary = `MiMo-exclusive desktop AI coding agent${channel !== "prod" ? ` (${channel})` : ""}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="io.github.shin4">
    <name>Mio</name>
  </developer>

  <description>
    <p>
      Mio is a desktop coding agent powered by Xiaomi MiMo models.
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <url type="bugtracker">https://github.com/shin4/mio/issues</url>
  <url type="homepage">https://github.com/shin4/mio</url>
  <url type="vcs-browser">https://github.com/shin4/mio</url>
</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)
console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)
