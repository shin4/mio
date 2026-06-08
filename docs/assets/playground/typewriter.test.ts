import { test, expect } from "bun:test";
import { runTypewriter, sliceForTick } from "./typewriter.js";

test("tick 0 returns empty string", () => {
  expect(sliceForTick("abcdef", 0, 2)).toBe("");
});

test("partial tick returns a mid slice", () => {
  expect(sliceForTick("abcdef", 1, 2)).toBe("ab");
});

test("charsPerTick math reveals tick * charsPerTick characters", () => {
  expect(sliceForTick("abcdef", 2, 2)).toBe("abcd");
});

test("tick beyond text length returns the full text", () => {
  expect(sliceForTick("abcdef", 100, 2)).toBe("abcdef");
});

test("negative tick clamps to 0 and returns empty string", () => {
  expect(sliceForTick("abcdef", -5, 2)).toBe("");
});

test("defaults charsPerTick to 2", () => {
  expect(sliceForTick("abcdef", 1)).toBe("ab");
});

// --- runTypewriter (contract: single options object, onUpdate, { cancel() }) ---

test("runTypewriter takes a single options object and reveals the full text", async () => {
  const updates: string[] = [];
  let doneCount = 0;
  await new Promise<void>((resolve) => {
    runTypewriter({
      text: "hello world",
      charsPerTick: 3,
      tickMs: 1,
      onUpdate: (s) => updates.push(s),
      onDone: () => {
        doneCount += 1;
        resolve();
      },
    });
  });
  expect(updates.at(-1)).toBe("hello world");
  expect(doneCount).toBe(1);
});

test("runTypewriter fires onDone exactly once and stops ticking", async () => {
  let doneCount = 0;
  let lastLen = 0;
  await new Promise<void>((resolve) => {
    runTypewriter({
      text: "abcd",
      charsPerTick: 2,
      tickMs: 1,
      onUpdate: (s) => {
        lastLen = s.length;
      },
      onDone: () => {
        doneCount += 1;
      },
    });
    setTimeout(resolve, 30);
  });
  expect(doneCount).toBe(1);
  expect(lastLen).toBe(4);
});

test("cancel() stops the run and prevents onDone", async () => {
  let doneCount = 0;
  let updateCount = 0;
  const handle = runTypewriter({
    text: "this text is long enough to need many ticks",
    charsPerTick: 1,
    tickMs: 1,
    onUpdate: () => {
      updateCount += 1;
    },
    onDone: () => {
      doneCount += 1;
    },
  });
  handle.cancel();
  const frozen = updateCount;
  await new Promise<void>((resolve) => setTimeout(resolve, 30));
  expect(doneCount).toBe(0);
  expect(updateCount).toBe(frozen);
});

test("non-positive charsPerTick is clamped so the run still completes", async () => {
  let doneCount = 0;
  await new Promise<void>((resolve) => {
    runTypewriter({
      text: "xy",
      charsPerTick: 0,
      tickMs: 1,
      onDone: () => {
        doneCount += 1;
        resolve();
      },
    });
    setTimeout(resolve, 50);
  });
  expect(doneCount).toBe(1);
});
