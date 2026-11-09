import { createBins } from "./bins";

const full = (totalBlocks: number) => ({ start: 0, end: totalBlocks });

describe("createBins", () => {
  it("maps with floor(index * binCount / totalBlocks)", () => {
    const bins = createBins(full(10), 3);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(bins.binOf)).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it("rangeOf inverts binOf and covers every block exactly once", () => {
    const totalBlocks = 1000;
    const binCount = 37;
    const bins = createBins(full(totalBlocks), binCount);
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
    const bins = createBins(full(10), 3);
    expect([0, 1, 2].map(bins.sizeOf)).toEqual([4, 3, 3]);
  });

  it("rebuild counts set blocks per bin in one pass", () => {
    const bins = createBins(full(10), 3);
    const set = new Set([0, 1, 4, 9]);
    const countInRange = (start: number, end: number): number => {
      let n = 0;
      for (let i = start; i < end; i += 1) if (set.has(i)) n += 1;
      return n;
    };
    bins.rebuild(countInRange);
    expect(Array.from(bins.counts)).toEqual([2, 1, 1]);
    bins.rebuild(() => 0);
    expect(Array.from(bins.counts)).toEqual([0, 0, 0]);
  });

  it("rebuild on zero bins does not throw and leaves counts empty", () => {
    const bins = createBins(full(10), 0);
    expect(() => bins.rebuild((start, end) => end - start)).not.toThrow();
    expect(bins.counts.length).toBe(0);
  });

  it("handles more bins than blocks", () => {
    const bins = createBins(full(3), 10);
    expect(bins.binOf(2)).toBe(6);
    expect(bins.sizeOf(0)).toBe(1);
    expect(bins.sizeOf(1)).toBe(0);
  });

  it("addRange within one bin adds the span length", () => {
    const bins = createBins(full(10), 3);
    bins.addRange(1, 3);
    expect(Array.from(bins.counts)).toEqual([2, 0, 0]);
  });

  it("addRange spanning two bins splits at the bin edge", () => {
    const bins = createBins(full(10), 3);
    bins.addRange(3, 5);
    expect(Array.from(bins.counts)).toEqual([1, 1, 0]);
  });

  it("addRange spanning all bins fills full middle bins", () => {
    const bins = createBins(full(10), 3);
    bins.addRange(0, 10);
    expect(Array.from(bins.counts)).toEqual([4, 3, 3]);
  });

  it("addRange matches rebuild for the same set", () => {
    const ranges: Array<[number, number]> = [
      [0, 7],
      [20, 21],
      [33, 60],
      [95, 100],
    ];
    const viaRange = createBins(full(100), 7);
    ranges.forEach(([s, e]) => viaRange.addRange(s, e));
    const viaRebuild = createBins(full(100), 7);
    const countInRange = (start: number, end: number): number => {
      let n = 0;
      for (let i = start; i < end; i += 1) {
        if (ranges.some(([s, e]) => i >= s && i < e)) n += 1;
      }
      return n;
    };
    viaRebuild.rebuild(countInRange);
    expect(Array.from(viaRange.counts)).toEqual(Array.from(viaRebuild.counts));
  });

  it("addRange with more bins than blocks matches rebuild over the same range", () => {
    const viaRange = createBins(full(3), 10);
    viaRange.addRange(0, 3);
    expect(viaRange.counts.reduce((sum, n) => sum + n, 0)).toBe(3);

    const viaRebuild = createBins(full(3), 10);
    viaRebuild.rebuild((start, end) => end - start);
    expect(Array.from(viaRange.counts)).toEqual(Array.from(viaRebuild.counts));
  });

  it("addRange is a no-op with zero bins or an empty span", () => {
    expect(() => createBins(full(10), 0).addRange(0, 10)).not.toThrow();
    const bins = createBins(full(10), 3);
    bins.addRange(4, 4);
    expect(Array.from(bins.counts)).toEqual([0, 0, 0]);
  });

  it("maps indices relative to a view offset", () => {
    const bins = createBins({ start: 100, end: 110 }, 3);
    expect([100, 103, 104, 106, 107, 109].map(bins.binOf)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(bins.rangeOf(1)).toEqual({ start: 104, end: 107 });
    expect(bins.sizeOf(0)).toBe(4);
    expect(bins.view).toEqual({ start: 100, end: 110 });
  });

  it("addRange clips to the view", () => {
    const bins = createBins({ start: 100, end: 110 }, 3);
    bins.addRange(95, 105);
    expect(Array.from(bins.counts)).toEqual([4, 1, 0]);
    bins.addRange(0, 50);
    bins.addRange(110, 200);
    expect(Array.from(bins.counts)).toEqual([4, 1, 0]);
  });

  it("rebuild asks for absolute ranges", () => {
    const bins = createBins({ start: 100, end: 110 }, 3);
    const asked: Array<[number, number]> = [];
    bins.rebuild((s, e) => {
      asked.push([s, e]);
      return 1;
    });
    expect(asked).toEqual([
      [100, 104],
      [104, 107],
      [107, 110],
    ]);
    expect(Array.from(bins.counts)).toEqual([1, 1, 1]);
  });

  it("binsTouching returns the touched bins and recountBins recomputes just those", () => {
    const bins = createBins(full(10), 3);
    const set = new Set([0, 1, 5]);
    const count = (s: number, e: number) => {
      let n = 0;
      for (let i = s; i < e; i += 1) if (set.has(i)) n += 1;
      return n;
    };
    expect(bins.binsTouching(1, 6)).toEqual([0, 1]);
    bins.recountBins(bins.binsTouching(1, 6), count);
    expect(Array.from(bins.counts)).toEqual([2, 1, 0]);
    set.add(9);
    expect(bins.binsTouching(9, 10)).toEqual([2]);
    bins.recountBins(bins.binsTouching(9, 10), count);
    expect(Array.from(bins.counts)).toEqual([2, 1, 1]);
  });

  it("binsTouching clips to the view and returns nothing for no overlap or zero bins", () => {
    const bins = createBins({ start: 100, end: 110 }, 2);
    expect(bins.binsTouching(0, 50)).toEqual([]);
    expect(bins.binsTouching(95, 103)).toEqual([0]);
    expect(bins.binsTouching(108, 200)).toEqual([1]);
    expect(createBins(full(10), 0).binsTouching(0, 10)).toEqual([]);
  });

  it("binsTouching(1, 6) on 10 blocks / 3 bins is [0, 1] and recountBins([0, 1], count) sets exactly those", () => {
    const bins = createBins(full(10), 3);
    bins.addRange(0, 10);
    const beforeLast = bins.counts[2];
    const count = (s: number, e: number) => (e > s ? 1 : 0);
    expect(bins.binsTouching(1, 6)).toEqual([0, 1]);
    bins.recountBins([0, 1], count);
    expect(Array.from(bins.counts)).toEqual([1, 1, beforeLast]);
  });
});
