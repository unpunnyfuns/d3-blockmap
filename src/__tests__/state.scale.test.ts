import { createBlockState } from "../state";

// Measured around 10ms; this bound only catches a regression to per-block work.
const PATHOLOGICAL_MS = 10_000;

describe("createBlockState at 100M blocks", () => {
  it("resizes and reports progress within a bounded time", () => {
    const totalBlocks = 100_000_000;
    const state = createBlockState(totalBlocks);
    state.replaceRanges([
      [0, 30_000_000],
      [50_000_000, 50_000_001],
      [99_999_000, 100_000_000],
    ]);

    const start = performance.now();
    state.resize(4000);
    const elapsedMs = performance.now() - start;

    expect(state.progress().completed).toBe(30_001_001);
    expect(state.countOf(0)).toBe(state.sizeOf(0));
    expect(state.countOf(3999)).toBeGreaterThan(0);
    expect(state.fraction(2001)).toBe(0);
    expect(elapsedMs, `resize took ${elapsedMs}ms`).toBeLessThan(PATHOLOGICAL_MS);

    const dirty = state.add([50_000_002]);
    expect(dirty.length).toBe(1);
    expect(state.progress().completed).toBe(30_001_002);
  });
});
