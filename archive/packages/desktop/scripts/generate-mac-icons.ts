import { deflateSync, inflateSync } from "node:zlib"
import path from "node:path"
import { fileURLToPath } from "node:url"

type Color = {
  r: number
  g: number
  b: number
}

type PngImage = {
  width: number
  height: number
  data: Uint8Array
}

type IconLayer = {
  type: string
  name: string
  size: number
}

const channels = ["dev", "beta", "prod"] as const
type Channel = (typeof channels)[number]

const contentScale = 816 / 1024
const cornerRadiusScale = 190 / 1024
const cornerExponent = 2.2
const maskSamples = 8
const softShadow = { blurScale: 18 / 1024, offsetYScale: 26 / 1024, opacity: 0.28, passes: 2 }
const contactShadow = { blurScale: 7 / 1024, offsetYScale: 12 / 1024, opacity: 0.18, passes: 2 }
const bytesPerPixel = 4
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const shadowColor = { r: 0, g: 0, b: 0 }

const iconLayers: IconLayer[] = [
  { type: "icp4", name: "icon_16x16.png", size: 16 },
  { type: "ic11", name: "icon_16x16@2x.png", size: 32 },
  { type: "icp5", name: "icon_32x32.png", size: 32 },
  { type: "ic12", name: "icon_32x32@2x.png", size: 64 },
  { type: "ic07", name: "icon_128x128.png", size: 128 },
  { type: "ic13", name: "icon_128x128@2x.png", size: 256 },
  { type: "ic08", name: "icon_256x256.png", size: 256 },
  { type: "ic14", name: "icon_256x256@2x.png", size: 512 },
  { type: "ic09", name: "icon_512x512.png", size: 512 },
  { type: "ic10", name: "icon_512x512@2x.png", size: 1024 },
]

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

const selectedChannels = Bun.argv.slice(2).length === 0 ? channels : Bun.argv.slice(2).map(requireChannel)

for (const channel of selectedChannels) {
  const source = decodePng(await Bun.file(path.join(desktopDir, "icons", channel, "icon.png")).arrayBuffer())
  const palette = dominantColors(source)
  const markMask = buildColorMask(source, palette.mark)
  const layers = iconLayers.map((layer) => ({
    ...layer,
    png: encodePng(renderLayer(source, markMask, palette.background, palette.mark, layer.size)),
  }))

  await Bun.write(
    path.join(desktopDir, "icons", channel, "icon.icns"),
    writeIcns(layers.map((layer) => ({ type: layer.type, png: layer.png }))),
  )
  await Bun.write(path.join(desktopDir, "icons", channel, "dock.png"), requireLayer(layers, "icon_128x128@2x.png").png)
  console.log(`Generated smooth macOS icons for ${channel}`)
}

function requireChannel(input: string): Channel {
  if (channels.some((channel) => channel === input)) return input as Channel
  throw new Error(`Unknown icon channel: ${input}`)
}

function decodePng(input: ArrayBuffer): PngImage {
  const file = Buffer.from(input)
  if (!file.subarray(0, pngSignature.length).equals(pngSignature)) throw new Error("Expected a PNG file")

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
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`)

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

function dominantColors(image: PngImage) {
  const counts = new Map<string, number>()
  for (let index = 0; index < image.data.length; index += bytesPerPixel) {
    if (image.data[index + 3] === 0) continue
    const key = `${image.data[index]},${image.data[index + 1]},${image.data[index + 2]}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const colors = [...counts.entries()].sort((left, right) => right[1] - left[1])
  if (colors.length < 2) throw new Error("Expected icon.png to contain at least two visible colors")

  return {
    background: parseColor(colors[0][0]),
    mark: parseColor(colors[1][0]),
  }
}

function parseColor(key: string): Color {
  const parts = key.split(",").map((part) => Number(part))
  return { r: parts[0], g: parts[1], b: parts[2] }
}

function buildColorMask(image: PngImage, color: Color) {
  const mask = new Uint8Array(image.width * image.height)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const index = (y * image.width + x) * bytesPerPixel
      if (image.data[index + 3] === 0) continue
      if (image.data[index] !== color.r || image.data[index + 1] !== color.g || image.data[index + 2] !== color.b)
        continue
      mask[y * image.width + x] = 255
    }
  }
  return mask
}

function renderLayer(source: PngImage, markMask: Uint8Array, background: Color, mark: Color, size: number): PngImage {
  const data = new Uint8Array(size * size * bytesPerPixel)
  const innerSize = Math.round(size * contentScale)
  const offset = Math.floor((size - innerSize) / 2)
  const radius = size * cornerRadiusScale
  const bodyMask = buildBodyMask(size, offset, innerSize, radius)

  renderShadow(data, bodyMask, size, softShadow)
  renderShadow(data, bodyMask, size, contactShadow)
  renderBody(data, bodyMask, background, size)

  for (let y = offset; y < offset + innerSize; y++) {
    for (let x = offset; x < offset + innerSize; x++) {
      const sourceX = ((x + 0.5 - offset) / innerSize) * source.width - 0.5
      const sourceY = ((y + 0.5 - offset) / innerSize) * source.height - 0.5
      const alpha = sampleMask(markMask, source.width, source.height, sourceX, sourceY) * bodyMask[y * size + x]
      if (alpha === 0) continue
      compositeColor(data, (y * size + x) * bytesPerPixel, mark, alpha / 255)
    }
  }

  return { width: size, height: size, data }
}

function buildBodyMask(canvasSize: number, offset: number, size: number, radius: number) {
  const mask = new Float32Array(canvasSize * canvasSize)
  for (let y = offset; y < offset + size; y++) {
    for (let x = offset; x < offset + size; x++) {
      mask[y * canvasSize + x] = continuousCornerCoverage(x, y, offset, size, radius)
    }
  }
  return mask
}

function continuousCornerCoverage(x: number, y: number, offset: number, size: number, radius: number) {
  let coverage = 0
  for (let sampleY = 0; sampleY < maskSamples; sampleY++) {
    for (let sampleX = 0; sampleX < maskSamples; sampleX++) {
      if (
        insideContinuousRoundedRect(
          x + (sampleX + 0.5) / maskSamples,
          y + (sampleY + 0.5) / maskSamples,
          offset,
          size,
          radius,
        )
      ) {
        coverage += 1
      }
    }
  }
  return coverage / (maskSamples * maskSamples)
}

function insideContinuousRoundedRect(x: number, y: number, offset: number, size: number, radius: number) {
  const left = offset
  const top = offset
  const right = offset + size
  const bottom = offset + size

  if (x < left || y < top || x >= right || y >= bottom) return false

  const cornerX = x < left + radius ? left + radius : x >= right - radius ? right - radius : x
  const cornerY = y < top + radius ? top + radius : y >= bottom - radius ? bottom - radius : y
  const dx = Math.abs(x - cornerX)
  const dy = Math.abs(y - cornerY)

  if (dx === 0 || dy === 0) return true
  return Math.pow(dx / radius, cornerExponent) + Math.pow(dy / radius, cornerExponent) <= 1
}

function renderShadow(data: Uint8Array, mask: Float32Array, size: number, shadow: typeof softShadow) {
  const blurred = blurMask(mask, size, Math.max(1, Math.round(size * shadow.blurScale)), shadow.passes)
  const offsetY = Math.round(size * shadow.offsetYScale)

  for (let y = offsetY; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const opacity = blurred[(y - offsetY) * size + x] * shadow.opacity
      if (opacity === 0) continue
      compositeColor(data, (y * size + x) * bytesPerPixel, shadowColor, opacity)
    }
  }
}

function blurMask(mask: Float32Array, size: number, radius: number, passes: number) {
  let output = mask
  for (let pass = 0; pass < passes; pass++) output = boxBlur(output, size, radius)
  return output
}

function boxBlur(mask: Float32Array, size: number, radius: number) {
  return boxBlurVertical(boxBlurHorizontal(mask, size, radius), size, radius)
}

function boxBlurHorizontal(mask: Float32Array, size: number, radius: number) {
  const output = new Float32Array(mask.length)
  const kernelSize = radius * 2 + 1

  for (let y = 0; y < size; y++) {
    let sum = 0
    for (let x = -radius; x <= radius; x++) sum += readFloatMask(mask, size, x, y)
    for (let x = 0; x < size; x++) {
      output[y * size + x] = sum / kernelSize
      sum += readFloatMask(mask, size, x + radius + 1, y) - readFloatMask(mask, size, x - radius, y)
    }
  }

  return output
}

function boxBlurVertical(mask: Float32Array, size: number, radius: number) {
  const output = new Float32Array(mask.length)
  const kernelSize = radius * 2 + 1

  for (let x = 0; x < size; x++) {
    let sum = 0
    for (let y = -radius; y <= radius; y++) sum += readFloatMask(mask, size, x, y)
    for (let y = 0; y < size; y++) {
      output[y * size + x] = sum / kernelSize
      sum += readFloatMask(mask, size, x, y + radius + 1) - readFloatMask(mask, size, x, y - radius)
    }
  }

  return output
}

function readFloatMask(mask: Float32Array, size: number, x: number, y: number) {
  if (x < 0 || y < 0 || x >= size || y >= size) return 0
  return mask[y * size + x]
}

function renderBody(data: Uint8Array, bodyMask: Float32Array, background: Color, size: number) {
  for (let index = 0; index < bodyMask.length; index++) {
    if (bodyMask[index] === 0) continue
    compositeColor(data, index * bytesPerPixel, background, bodyMask[index])
  }
}

function sampleMask(mask: Uint8Array, width: number, height: number, x: number, y: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const xWeight = x - x0
  const yWeight = y - y0
  const top =
    readMask(mask, width, height, x0, y0) * (1 - xWeight) + readMask(mask, width, height, x0 + 1, y0) * xWeight
  const bottom =
    readMask(mask, width, height, x0, y0 + 1) * (1 - xWeight) + readMask(mask, width, height, x0 + 1, y0 + 1) * xWeight
  return Math.round(top * (1 - yWeight) + bottom * yWeight)
}

function readMask(mask: Uint8Array, width: number, height: number, x: number, y: number) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0
  return mask[y * width + x]
}

function compositeColor(data: Uint8Array, index: number, color: Color, opacity: number) {
  const baseOpacity = data[index + 3] / 255
  const outputOpacity = opacity + baseOpacity * (1 - opacity)
  if (outputOpacity === 0) return
  data[index] = Math.round((color.r * opacity + data[index] * baseOpacity * (1 - opacity)) / outputOpacity)
  data[index + 1] = Math.round((color.g * opacity + data[index + 1] * baseOpacity * (1 - opacity)) / outputOpacity)
  data[index + 2] = Math.round((color.b * opacity + data[index + 2] * baseOpacity * (1 - opacity)) / outputOpacity)
  data[index + 3] = Math.round(outputOpacity * 255)
}

function encodePng(image: PngImage) {
  const stride = image.width * bytesPerPixel
  const raw = Buffer.alloc(image.height * (stride + 1))
  for (let y = 0; y < image.height; y++) {
    const rawOffset = y * (stride + 1)
    raw[rawOffset] = 0
    raw.set(image.data.subarray(y * stride, (y + 1) * stride), rawOffset + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(image.width, 0)
  ihdr.writeUInt32BE(image.height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii")
  const chunk = Buffer.alloc(8 + data.length + 4)
  chunk.writeUInt32BE(data.length, 0)
  typeBuffer.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length)
  return chunk
}

function crc32(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function writeIcns(layers: { type: string; png: Buffer }[]) {
  const chunks = layers.map((layer) => {
    const header = Buffer.alloc(8)
    header.write(layer.type, 0, "ascii")
    header.writeUInt32BE(layer.png.length + 8, 4)
    return Buffer.concat([header, layer.png])
  })
  const header = Buffer.alloc(8)
  header.write("icns", 0, "ascii")
  header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4)
  return Buffer.concat([header, ...chunks])
}

function requireLayer(layers: (IconLayer & { png: Buffer })[], name: string) {
  const layer = layers.find((item) => item.name === name)
  if (layer) return layer
  throw new Error(`Missing generated icon layer: ${name}`)
}
