export type BlockRange = { start: number; end: number };

export type Bins = {
  readonly binCount: number;
  readonly counts: Uint32Array;
  binOf(index: number): number;
  rangeOf(bin: number): BlockRange;
  sizeOf(bin: number): number;
  rebuild(has: (index: number) => boolean): void;
};

export const createBins = (totalBlocks: number, binCount: number): Bins => {
  const counts = new Uint32Array(binCount);
  const binOf = (index: number): number => Math.floor((index * binCount) / totalBlocks);
  const rangeOf = (bin: number): BlockRange => ({
    start: Math.ceil((bin * totalBlocks) / binCount),
    end: Math.ceil(((bin + 1) * totalBlocks) / binCount),
  });

  return {
    binCount,
    counts,
    binOf,
    rangeOf,
    sizeOf: (bin) => {
      const { start, end } = rangeOf(bin);
      return end - start;
    },
    rebuild: (has) => {
      counts.fill(0);
      for (let index = 0; index < totalBlocks; index += 1) {
        if (has(index)) counts[binOf(index)] += 1;
      }
    },
  };
};
