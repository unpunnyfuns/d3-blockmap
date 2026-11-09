import { createBitset } from "./bitset";
import { createBins } from "./bins";
import type { Bins, BlockRange } from "./bins";
import { MAX_BLOCKS, RANGE_PAIR } from "./constants";
import { normalizeRanges, rangesLength } from "./ranges";
import type { RangeInput } from "./ranges";
import { clampView, fullView, sameView } from "./view";
import type { BlockView } from "./view";

export type Progress = { completed: number; total: number };

export type BlockState = {
  readonly totalBlocks: number;
  readonly binCount: number;
  readonly view: BlockView;
  resize(binCount: number): void;
  setView(view: BlockView): boolean;
  getView(): BlockView;
  add(indices: ArrayLike<number>): Uint32Array;
  replace(indices: ArrayLike<number>): void;
  replaceRanges(input: RangeInput): void;
  addRanges(input: RangeInput): Uint32Array;
  removeRanges(input: RangeInput): Uint32Array;
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
  if (totalBlocks > MAX_BLOCKS) {
    throw new RangeError(
      `totalBlocks must fit in an unsigned 32-bit integer (<= ${MAX_BLOCKS}), got ${totalBlocks}`,
    );
  }

  const bitset = createBitset(totalBlocks);
  let view: BlockView = fullView(totalBlocks);
  let bins: Bins = createBins(view, 0);

  const inView = (index: number): boolean => index >= view.start && index < view.end;

  const add = (indices: ArrayLike<number>): Uint32Array => {
    const hasBins = bins.binCount > 0;
    const dirty = new Set<number>();
    for (let i = 0; i < indices.length; i += 1) {
      const index = indices[i];
      if (!isValidIndex(index, totalBlocks) || !bitset.set(index)) continue;
      if (!hasBins || !inView(index)) continue;
      const bin = bins.binOf(index);
      bins.counts[bin] += 1;
      dirty.add(bin);
    }
    return dirty.size === 0 ? EMPTY_DIRTY : Uint32Array.from(dirty);
  };

  const applyRanges = (input: RangeInput, complete: boolean): Uint32Array => {
    const flat = normalizeRanges(input, totalBlocks);
    const dirty = new Set<number>();
    let delta = 0;
    for (let i = 0; i < flat.length; i += RANGE_PAIR) {
      const start = flat[i];
      const end = flat[i + 1];
      const present = bitset.countRange(start, end);
      if (complete) {
        bitset.fill(start, end);
        delta += end - start - present;
      } else {
        bitset.clearRange(start, end);
        delta -= present;
      }
      for (const bin of bins.recount(start, end, bitset.countRange)) dirty.add(bin);
    }
    bitset.setCount(bitset.count + delta);
    return dirty.size === 0 ? EMPTY_DIRTY : Uint32Array.from(dirty).sort();
  };

  return {
    totalBlocks,
    get binCount() {
      return bins.binCount;
    },
    get view() {
      return view;
    },
    resize: (binCount) => {
      bins = createBins(view, binCount);
      bins.rebuild(bitset.countRange);
    },
    setView: (next) => {
      if (!Number.isFinite(next.start) || !Number.isFinite(next.end)) return false;
      const clamped = clampView(next, totalBlocks);
      if (sameView(clamped, view)) return false;
      view = clamped;
      bins = createBins(view, bins.binCount);
      bins.rebuild(bitset.countRange);
      return true;
    },
    getView: () => ({ ...view }),
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
    addRanges: (input) => applyRanges(input, true),
    removeRanges: (input) => applyRanges(input, false),
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
