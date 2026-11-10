/**
 * The model: which blocks are complete (bitset), how they fold into the
 * current view's bins, and which bins changed. Deliberately free of DOM, D3
 * and canvas imports so it stays portable - it could run in a worker and
 * post dirty-bin arrays back to the renderer unchanged.
 */

import { createBitset } from "./bitset";
import { createBins } from "./bins";
import type { Bins } from "./bins";
import { MAX_BLOCKS, RANGE_PAIR } from "./constants";
import { normalizeRanges, rangesLength } from "./ranges";
import type { BlockRange, RangeInput } from "./ranges";
import { fullView, sameView } from "./view";
import type { BlockView } from "./view";

export type Progress = { completed: number; total: number };

/**
 * Dirty arrays are ascending and deduplicated.
 */
export type BlockState = {
  readonly totalBlocks: number;
  readonly binCount: number;
  resize(binCount: number): void;
  setView(view: BlockView): boolean;
  getView(): BlockView;
  add(indices: ArrayLike<number>): Uint32Array;
  remove(indices: ArrayLike<number>): Uint32Array;
  replace(indices: ArrayLike<number>): void;
  replaceRanges(input: RangeInput): void;
  addRanges(input: RangeInput): Uint32Array;
  removeRanges(input: RangeInput): Uint32Array;
  has(index: number): boolean;
  fraction(bin: number): number;
  countOf(bin: number): number;
  countRange(start: number, end: number): number;
  rangeOf(bin: number): BlockRange;
  progress(): Progress;
};

// Shared immutable "nothing changed" result, so the common case allocates no
// array at all.
const EMPTY_DIRTY = new Uint32Array(0);

const isValidIndex = (index: number, totalBlocks: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < totalBlocks;

export const createBlockState = (totalBlocks: number): BlockState => {
  if (!Number.isInteger(totalBlocks) || totalBlocks < 1) {
    throw new RangeError(`totalBlocks must be a positive integer, got ${totalBlocks}`);
  }

  // The bitset addresses bytes with `index >>> BYTE_SHIFT`, and the unsigned
  // shift coerces its operand to a uint32: an index past 2^32 - 1 would wrap
  // round and corrupt an unrelated block, so reject it up front.
  if (totalBlocks > MAX_BLOCKS) {
    throw new RangeError(
      `totalBlocks must fit in an unsigned 32-bit integer (<= ${MAX_BLOCKS}), got ${totalBlocks}`,
    );
  }

  const bitset = createBitset(totalBlocks);
  let view: BlockView = fullView(totalBlocks);

  // Bins are created empty: binCount is unknown until the container has been
  // measured, so nothing can be binned before the first resize.
  let bins: Bins = createBins(view, 0);

  const inView = (index: number): boolean => index >= view.start && index < view.end;

  /**
   * Incremental add of individual indices. bitset.set reports whether the bit
   * actually flipped, so an already-complete block costs no bin update and
   * does not report its bin dirty. A Set then Uint32Array.from().sort() gives
   * the ascending, deduplicated result the renderer expects; typed-array sort
   * is numeric, so no comparator is needed.
   */
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

    return dirty.size === 0 ? EMPTY_DIRTY : Uint32Array.from(dirty).sort();
  };

  /**
   * Incremental remove of individual indices, the mirror of add. The bitset
   * has no single-bit clear, so a one-block clearRange is used and the
   * running count is written back; a bit that was not set is skipped, so it
   * costs no bin update and reports nothing dirty.
   */
  const remove = (indices: ArrayLike<number>): Uint32Array => {
    const hasBins = bins.binCount > 0;
    const dirty = new Set<number>();

    for (let i = 0; i < indices.length; i += 1) {
      const index = indices[i];
      if (!isValidIndex(index, totalBlocks) || !bitset.has(index)) continue;

      bitset.clearRange(index, index + 1);
      bitset.setCount(bitset.count - 1);
      if (!hasBins || !inView(index)) continue;

      const bin = bins.binOf(index);
      bins.counts[bin] -= 1;
      dirty.add(bin);
    }

    return dirty.size === 0 ? EMPTY_DIRTY : Uint32Array.from(dirty).sort();
  };

  /**
   * Shared body of addRanges and removeRanges. Incoming ranges may overlap
   * bits that are already in the target state, so the change per bin cannot
   * be derived from the range bounds alone - hence countRange before each
   * mutation for the global delta, and a recount of every touched bin from
   * the bitset afterwards. The alternative, recounting all bins, would cost a
   * full pass over millions of blocks per update.
   */
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

      for (const bin of bins.binsTouching(start, end)) dirty.add(bin);
    }

    bins.recountBins(dirty, bitset.countRange);
    bitset.setCount(bitset.count + delta);

    return dirty.size === 0 ? EMPTY_DIRTY : Uint32Array.from(dirty).sort();
  };

  return {
    totalBlocks,
    get binCount() {
      return bins.binCount;
    },
    // Column count changed: the bin boundaries move, so rebuild from the
    // bitset rather than trying to redistribute the old counts.
    resize: (binCount) => {
      bins = createBins(view, binCount);
      bins.rebuild(bitset.countRange);
    },

    // Takes a view legalView has already checked, so the façade validates once
    // per request rather than again at commit. Returns whether anything moved,
    // so callers can skip a repaint.
    setView: (next) => {
      if (sameView(next, view)) return false;

      view = { ...next };
      bins = createBins(view, bins.binCount);
      bins.rebuild(bitset.countRange);
      return true;
    },

    // A copy, because `view` is live and handed to external callbacks.
    getView: () => ({ ...view }),

    add,
    remove,

    replace: (indices) => {
      bitset.clear();
      bins.counts.fill(0);
      add(indices);
    },

    /**
     * Ranges are already merged and disjoint, so each one's blocks are new to
     * the bitset: bins.addRange can add sizes arithmetically and the total is
     * just the summed range lengths, with no counting pass.
     */
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

    // Coverage in [0, 1], which is what the colour scale is indexed by.
    fraction: (bin) => {
      const size = bins.sizeOf(bin);
      return size === 0 ? 0 : bins.counts[bin] / size;
    },

    countOf: (bin) => bins.counts[bin],

    // Straight from the bitset, so it answers for blocks outside the view
    // too; the cost grows with the length of the range.
    countRange: (start, end) => bitset.countRange(start, end),
    rangeOf: (bin) => bins.rangeOf(bin),
    progress: () => ({ completed: bitset.count, total: totalBlocks }),
  };
};
