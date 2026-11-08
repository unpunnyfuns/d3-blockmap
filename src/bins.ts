export type BlockRange = { start: number; end: number };

export type Bins = {
  readonly binCount: number;
  readonly counts: Uint32Array;
  binOf(index: number): number;
  rangeOf(bin: number): BlockRange;
  sizeOf(bin: number): number;
  rebuild(has: (index: number) => boolean): void;
  addRange(start: number, end: number): void;
};

export const createBins = (totalBlocks: number, binCount: number): Bins => {
  const counts = new Uint32Array(binCount);
  const binOf = (index: number): number => Math.floor((index * binCount) / totalBlocks);
  const rangeOf = (bin: number): BlockRange => ({
    start: Math.ceil((bin * totalBlocks) / binCount),
    end: Math.ceil(((bin + 1) * totalBlocks) / binCount),
  });
  const sizeOf = (bin: number): number => {
    const { start, end } = rangeOf(bin);
    return end - start;
  };

  return {
    binCount,
    counts,
    binOf,
    rangeOf,
    sizeOf,
    rebuild: (has) => {
      counts.fill(0);
      if (binCount === 0) return;
      for (let index = 0; index < totalBlocks; index += 1) {
        if (has(index)) counts[binOf(index)] += 1;
      }
    },
    addRange: (start, end) => {
      if (binCount === 0 || end <= start) return;
      const first = binOf(start);
      const last = binOf(end - 1);
      if (first === last) {
        counts[first] += end - start;
        return;
      }
      counts[first] += rangeOf(first).end - start;
      for (let bin = first + 1; bin < last; bin += 1) counts[bin] += sizeOf(bin);
      counts[last] += end - rangeOf(last).start;
    },
  };
};
