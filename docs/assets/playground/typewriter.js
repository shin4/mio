/**
 * typewriter.js — tiny dependency-free typewriter effect.
 *
 * `sliceForTick(text, tick, charsPerTick)` is a pure function returning the
 * substring revealed at a given tick. `runTypewriter({ text, ... })` drives it
 * on an interval, calling `onUpdate` per tick and `onDone` once when complete.
 *
 * @module typewriter
 */

/**
 * Return the substring of `text` revealed at `tick`.
 *
 * Pure: no side effects. tick=0 yields "", negative tick clamps to 0, and a
 * tick beyond the text length yields the full text.
 *
 * @param {string} text - The full text being typed.
 * @param {number} tick - The tick index (0-based). Negative values clamp to 0.
 * @param {number} [charsPerTick=2] - Characters revealed per tick.
 * @returns {string} The revealed slice.
 */
export function sliceForTick(text, tick, charsPerTick = 2) {
  const safeTick = tick < 0 ? 0 : tick;
  const end = safeTick * charsPerTick;
  return text.slice(0, end);
}

/**
 * @typedef {Object} TypewriterParams
 * @property {string} text - The full text to type out.
 * @property {(slice: string) => void} [onUpdate] - Called each tick with the revealed slice.
 * @property {() => void} [onDone] - Called once when the full text is emitted.
 * @property {number} [charsPerTick=2] - Characters revealed per tick (clamped to >= 1).
 * @property {number} [tickMs=16] - Milliseconds between ticks.
 */

/**
 * @typedef {Object} TypewriterHandle
 * @property {() => void} cancel - Stop the typewriter and clear its interval.
 */

/**
 * Run the typewriter effect over `text`.
 *
 * Takes a single options object (the shared playground contract). Each tick
 * increments an internal counter and emits `sliceForTick(text, tick,
 * charsPerTick)` via `onUpdate`. When the emitted slice equals `text`, `onDone`
 * fires once and the interval is cleared so the run self-terminates.
 *
 * `charsPerTick` is clamped to at least 1 so a non-positive value can never
 * produce an interval that never completes.
 *
 * @param {TypewriterParams} params - Effect configuration (must include `text`).
 * @returns {TypewriterHandle} A handle exposing `cancel()`.
 */
export function runTypewriter({ text, onUpdate, onDone, charsPerTick = 2, tickMs = 16 } = {}) {
  const full = typeof text === "string" ? text : "";
  const step = charsPerTick >= 1 ? charsPerTick : 1;
  let tick = 0;
  let done = false;

  const id = setInterval(() => {
    tick += 1;
    const slice = sliceForTick(full, tick, step);
    onUpdate?.(slice);

    if (slice !== full) return;

    clearInterval(id);
    if (done) return;
    done = true;
    onDone?.();
  }, tickMs);

  return {
    cancel() {
      clearInterval(id);
    },
  };
}
