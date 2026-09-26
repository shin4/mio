import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { root } from "../../script/desktop/prepare.mjs"

/** Landing-page clips MiMo ASR transcribed on 2026-06-08 (docs/assets/playground/demos.json). */
export const clips = {
  zh: "把这个函数改成异步的，并且等待网络请求返回。",
  en: "Make this function asynchronous and wait for the network request.",
}

/**
 * Convert a mono PCM16 WAV at any sample rate into the canonical 16 kHz recording voice input sends.
 * @param source - WAV bytes; chunks other than `fmt ` and `data` are skipped.
 * @returns canonical WAV bytes.
 */
export function canonical(source) {
  assert.equal(source.toString("ascii", 0, 4), "RIFF")
  const chunks = new Map()
  for (let offset = 12; offset + 8 <= source.length; ) {
    const size = source.readUInt32LE(offset + 4)
    chunks.set(source.toString("ascii", offset, offset + 4), { start: offset + 8, size })
    offset += 8 + size + (size % 2)
  }
  const format = chunks.get("fmt ")
  const data = chunks.get("data")
  assert.ok(format && data, "WAV lacks fmt or data")
  assert.equal(source.readUInt16LE(format.start), 1, "PCM expected")
  assert.equal(source.readUInt16LE(format.start + 2), 1, "mono expected")
  assert.equal(source.readUInt16LE(format.start + 14), 16, "16-bit expected")
  const ratio = source.readUInt32LE(format.start + 4) / 16000
  const available = Math.floor(Math.min(data.size, source.length - data.start) / 2)
  const samples = Math.floor(available / ratio)
  const wave = Buffer.alloc(44 + samples * 2)
  wave.write("RIFF", 0, "ascii")
  wave.writeUInt32LE(wave.length - 8, 4)
  wave.write("WAVEfmt ", 8, "ascii")
  wave.writeUInt32LE(16, 16)
  wave.writeUInt16LE(1, 20)
  wave.writeUInt16LE(1, 22)
  wave.writeUInt32LE(16000, 24)
  wave.writeUInt32LE(32000, 28)
  wave.writeUInt16LE(2, 32)
  wave.writeUInt16LE(16, 34)
  wave.write("data", 36, "ascii")
  wave.writeUInt32LE(samples * 2, 40)
  for (let index = 0; index < samples; index += 1) {
    wave.writeInt16LE(source.readInt16LE(data.start + Math.floor(index * ratio) * 2), 44 + index * 2)
  }
  return wave
}

/**
 * A landing-page clip resampled to the canonical 16 kHz mono PCM16 recording voice input sends.
 * @param language - `zh` or `en`.
 * @returns WAV bytes.
 */
export async function recording(language) {
  return canonical(await readFile(join(root, `docs/assets/playground/voice/make-async-${language}.wav`)))
}
