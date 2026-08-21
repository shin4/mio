import { $ } from "bun"
import { inflateSync } from "node:zlib"
import path from "node:path"
import { fileURLToPath } from "node:url"

type PngImage = {
  width: number
  height: number
  data: Uint8Array
}

type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const channels = ["dev", "beta", "prod"] as const
const bytesPerPixel = 4
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const expectedDockRows = new Map([
  [26, { minX: 70, maxX: 185 }],
  [27, { minX: 62, maxX: 193 }],
  [28, { minX: 58, maxX: 197 }],
  [29, { minX: 55, maxX: 200 }],
  [30, { minX: 52, maxX: 203 }],
  [34, { minX: 45, maxX: 210 }],
  [42, { minX: 36, maxX: 219 }],
  [58, { minX: 28, maxX: 227 }],
])

const extractedDir = (await $`mktemp -d /tmp/mio-icon-geometry.XXXXXX`.text()).trim()

for (const channel of channels) {
  await $`iconutil -c iconset -o ${path.join(extractedDir, `${channel}.iconset`)} ${path.join(
    desktopDir,
    "icons",
    channel,
    "icon.icns",
  )}`

  const dock = await decodePng(path.join(desktopDir, "icons", channel, "dock.png"))
  const large = await decodePng(path.join(extractedDir, `${channel}.iconset`, "icon_512x512@2x.png"))

  assertImageSize(dock, 256, 256, `${channel}/dock.png`)
  assertImageSize(large, 1024, 1024, `${channel}/icon_512x512@2x.png`)
  assertBounds(opaqueBounds(dock), { minX: 26, minY: 26, maxX: 229, maxY: 229 }, `${channel}/dock.png opaque bounds`)
  assertBounds(
    opaqueBounds(large),
    { minX: 104, minY: 104, maxX: 919, maxY: 919 },
    `${channel}/icon_512x512@2x.png opaque bounds`,
  )
  assertShadowInsideCanvas(alphaBounds(dock), dock, `${channel}/dock.png`)
  assertShadowInsideCanvas(alphaBounds(large), large, `${channel}/icon_512x512@2x.png`)
  assertDockRows(dock, channel)
}

console.log("macOS icon geometry matches Apple-system template targets")

async function decodePng(filePath: string): Promise<PngImage> {
  const file = Buffer.from(await Bun.file(filePath).arrayBuffer())
  if (!file.subarray(0, pngSignature.length).equals(pngSignature)) throw new Error(`Expected PNG file: ${filePath}`)

  let offset = pngSignature.length
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  while (offset < file.length) {
    const length = file.readUInt32BE(offset)
    offset += 4
    const type = file.toString("ascii", offset, offset + 4)
    offset += 4
    const data = file.subarray(offset, offset + length)
    offset += length + 4

    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    }
    if (type === "IDAT") idatChunks.push(data)
    if (type === "IEND") break
  }

  if (bitDepth !== 8 || colorType !== 6)
    throw new Error(`Unsupported PNG format for ${filePath}: bitDepth=${bitDepth}, colorType=${colorType}`)

  return {
    width,
    height,
    data: unfilterPng(inflateSync(Buffer.concat(idatChunks)), width, height),
  }
}

function unfilterPng(raw: Buffer, width: number, height: number) {
  const stride = width * bytesPerPixel
  const output = new Uint8Array(height * stride)
  let offset = 0

  for (let y = 0; y < height; y++) {
    const filter = raw[offset]
    offset += 1
    const row = raw.subarray(offset, offset + stride)
    offset += stride

    for (let x = 0; x < stride; x++) {
      const left = x >= bytesPerPixel ? output[y * stride + x - bytesPerPixel] : 0
      const up = y > 0 ? output[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= bytesPerPixel ? output[(y - 1) * stride + x - bytesPerPixel] : 0
      output[y * stride + x] = (row[x] + filterValue(filter, left, up, upLeft)) & 0xff
    }
  }

  return output
}

function filterValue(filter: number, left: number, up: number, upLeft: number) {
  if (filter === 0) return 0
  if (filter === 1) return left
  if (filter === 2) return up
  if (filter === 3) return Math.floor((left + up) / 2)
  if (filter === 4) return paeth(left, up, upLeft)
  throw new Error(`Unsupported PNG filter: ${filter}`)
}

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}

function assertImageSize(image: PngImage, width: number, height: number, label: string) {
  if (image.width === width && image.height === height) return
  throw new Error(`${label} expected ${width}x${height}, got ${image.width}x${image.height}`)
}

function opaqueBounds(image: PngImage) {
  return boundsForAlpha(image, 250)
}

function alphaBounds(image: PngImage) {
  return boundsForAlpha(image, 1)
}

function boundsForAlpha(image: PngImage, threshold: number) {
  const bounds = emptyBounds()
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * bytesPerPixel + 3] < threshold) continue
      bounds.minX = Math.min(bounds.minX, x)
      bounds.minY = Math.min(bounds.minY, y)
      bounds.maxX = Math.max(bounds.maxX, x)
      bounds.maxY = Math.max(bounds.maxY, y)
    }
  }
  return bounds
}

function emptyBounds(): Bounds {
  return { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: -1, maxY: -1 }
}

function assertBounds(actual: Bounds, expected: Bounds, label: string) {
  if (
    actual.minX === expected.minX &&
    actual.minY === expected.minY &&
    actual.maxX === expected.maxX &&
    actual.maxY === expected.maxY
  )
    return
  throw new Error(`${label} expected ${formatBounds(expected)}, got ${formatBounds(actual)}`)
}

function assertShadowInsideCanvas(bounds: Bounds, image: PngImage, label: string) {
  if (bounds.minX > 0 && bounds.minY > 0 && bounds.maxX < image.width - 1 && bounds.maxY < image.height - 1) return
  throw new Error(`${label} shadow alpha is clipped at canvas edge: ${formatBounds(bounds)}`)
}

function assertDockRows(image: PngImage, channel: string) {
  for (const [y, expected] of expectedDockRows) {
    const actual = opaqueRowBounds(image, y)
    if (Math.abs(actual.minX - expected.minX) <= 1 && Math.abs(actual.maxX - expected.maxX) <= 1) continue
    throw new Error(
      `${channel}/dock.png row ${y} expected x=${expected.minX}-${expected.maxX} +/-1, got x=${actual.minX}-${actual.maxX}`,
    )
  }
}

function opaqueRowBounds(image: PngImage, y: number) {
  const bounds = { minX: Number.POSITIVE_INFINITY, maxX: -1 }
  for (let x = 0; x < image.width; x++) {
    if (image.data[(y * image.width + x) * bytesPerPixel + 3] < 250) continue
    bounds.minX = Math.min(bounds.minX, x)
    bounds.maxX = Math.max(bounds.maxX, x)
  }
  return bounds
}

function formatBounds(bounds: Bounds) {
  if (bounds.maxX < 0) return "empty"
  return `${bounds.minX},${bounds.minY}-${bounds.maxX},${bounds.maxY}`
}
