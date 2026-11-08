import { createBins } from "./bins";

describe("createBins", () => {
  it("maps with floor(index * binCount / totalBlocks)", () => {
    const bins = createBins(10, 3);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(bins.binOf)).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it("rangeOf inverts binOf and covers every block exactly once", () => {
    const totalBlocks = 1000;
    const binCount = 37;
    const bins = createBins(totalBlocks, binCount);
    let covered = 0;
    for (let bin = 0; bin < binCount; bin += 1) {
      const { start, end } = bins.rangeOf(bin);
      expect(end).toBeGreaterThanOrEqual(start);
      for (let i = start; i < end; i += 1) expect(bins.binOf(i)).toBe(bin);
      if (start > 0) expect(bins.binOf(start - 1)).toBe(bin - 1);
      if (end < totalBlocks) expect(bins.binOf(end)).toBe(bin + 1);
      covered += end - start;
    }
    expect(covered).toBe(totalBlocks);
    expect(bins.rangeOf(0).start).toBe(0);
    expect(bins.rangeOf(binCount - 1).end).toBe(totalBlocks);
  });

  it("sizeOf equals range length", () => {
    const bins = createBins(10, 3);
    expect([0, 1, 2].map(bins.sizeOf)).toEqual([4, 3, 3]);
  });

  it("rebuild counts set blocks per bin in one pass", () => {
    const bins = createBins(10, 3);
    const set = new Set([0, 1, 4, 9]);
    bins.rebuild((i) => set.has(i));
    expect(Array.from(bins.counts)).toEqual([2, 1, 1]);
    bins.rebuild(() => false);
    expect(Array.from(bins.counts)).toEqual([0, 0, 0]);
  });

  it("rebuild on zero bins does not throw and leaves counts empty", () => {
    const bins = createBins(10, 0);
    expect(() => bins.rebuild(() => true)).not.toThrow();
    expect(bins.counts.length).toBe(0);
  });

  it("handles more bins than blocks", () => {
    const bins = createBins(3, 10);
    expect(bins.binOf(2)).toBe(6);
    expect(bins.sizeOf(0)).toBe(1);
    expect(bins.sizeOf(1)).toBe(0);
  });
});
