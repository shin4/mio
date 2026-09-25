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
 * A landing-page clip resampled to the canonical 16 kHz mono PCM16 recording voice input sends.
 * @param language - `zh` or `en`.
 * @returns WAV bytes.
 */
export async function recording(language) {
  const source = await readFile(join(root, `docs/assets/playground/voice/make-async-${language}.wav`))
  assert.equal(source.readUInt32LE(24), 24000)
  const samples = Math.floor((source.length - 44) / 2 / 1.5)
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
    wave.writeInt16LE(source.readInt16LE(44 + Math.floor(index * 1.5) * 2), 44 + index * 2)
  }
  return wave
}
