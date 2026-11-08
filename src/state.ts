import { createBitset } from "./bitset";
import { createBins } from "./bins";
import type { Bins, BlockRange } from "./bins";
import { RANGE_PAIR } from "./constants";
import { normalizeRanges, rangesLength } from "./ranges";
import type { RangeInput } from "./ranges";

export type Progress = { completed: number; total: number };

export type BlockState = {
  readonly totalBlocks: number;
  readonly binCount: number;
  resize(binCount: number): void;
  add(indices: ArrayLike<number>): Uint32Array;
  replace(indices: ArrayLike<number>): void;
  replaceRanges(input: RangeInput): void;
  has(index: number): boolean;
  fraction(bin: number): number;
  countOf(bin: number): number;
  sizeOf(bin: number): number;
  rangeOf(bin: number): BlockRange;
  progress(): Progress;
};

const EMPTY_DIRTY = new Uint32Array(0);

const isValidIndex = (index: number, totalBlocks: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < totalBlocks;

export const createBlockState = (totalBlocks: number): BlockState => {
  if (!Number.isInteger(totalBlocks) || totalBlocks < 1) {
    throw new RangeError(`totalBlocks must be a positive integer, got ${totalBlocks}`);
  }

  const bitset = createBitset(totalBlocks);
  let bins: Bins = createBins(totalBlocks, 0);

  const add = (indices: ArrayLike<number>): Uint32Array => {
    const hasBins = bins.binCount > 0;
    const dirty = new Set<number>();
    for (let i = 0; i < indices.length; i += 1) {
      const index = indices[i];
      if (!isValidIndex(index, totalBlocks) || !bitset.set(index)) continue;
      if (!hasBins) continue;
      const bin = bins.binOf(index);
      bins.counts[bin] += 1;
      dirty.add(bin);
    }
    return dirty.size === 0 ? EMPTY_DIRTY : Uint32Array.from(dirty);
  };

  return {
    totalBlocks,
    get binCount() {
      return bins.binCount;
    },
    resize: (binCount) => {
      bins = createBins(totalBlocks, binCount);
      bins.rebuild(bitset.has);
    },
    add,
    replace: (indices) => {
      bitset.clear();
      bins.counts.fill(0);
      add(indices);
    },
    replaceRanges: (input) => {
      const flat = normalizeRanges(input, totalBlocks);
      bitset.clear();
      bins.counts.fill(0);
      for (let i = 0; i < flat.length; i += RANGE_PAIR) {
        bitset.fill(flat[i], flat[i + 1]);
        bins.addRange(flat[i], flat[i + 1]);
      }
      bitset.setCount(rangesLength(flat));
    },
    has: bitset.has,
    fraction: (bin) => {
      const size = bins.sizeOf(bin);
      return size === 0 ? 0 : bins.counts[bin] / size;
    },
    countOf: (bin) => bins.counts[bin],
    sizeOf: (bin) => bins.sizeOf(bin),
    rangeOf: (bin) => bins.rangeOf(bin),
    progress: () => ({ completed: bitset.count, total: totalBlocks }),
  };
};
