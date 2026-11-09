/**
 * Maps the current view's block range onto one bin per canvas column and
 * keeps a completed-block count per bin. Pure index arithmetic plus a
 * Uint32Array: no DOM, no colours, no knowledge of how bins are painted.
 */

import type { BlockRange } from "./ranges";
import type { BlockView } from "./view";

export type Bins = {
  readonly binCount: number;
  readonly counts: Uint32Array;
  binOf(index: number): number;
  rangeOf(bin: number): BlockRange;
  sizeOf(bin: number): number;
  rebuild(countInRange: (start: number, end: number) => number): void;
  addRange(start: number, end: number): void;
  binsTouching(start: number, end: number): number[];
  recountBins(bins: Iterable<number>, countInRange: (start: number, end: number) => number): void;
};

/**
 * Discrete mode, fewer blocks in the view than columns: the block `block`
 * places from the view's start covers columns [discreteColumn(block),
 * discreteColumn(block + 1)). The same floor split for both ends is what lets
 * consecutive blocks tile the row with no gaps.
 */
export const discreteColumn = (block: number, length: number, binCount: number): number =>
  Math.floor((block * binCount) / length);

/**
 * Inverse of discreteColumn, counted from the view's start: the block under a
 * column is the number of block boundaries that fit within the first
 * `column + 1` columns, minus one. Floor and ceil must agree like this or the
 * tooltip names a neighbour of the block the renderer painted there.
 */
export const discreteBlock = (column: number, length: number, binCount: number): number =>
  Math.ceil(((column + 1) * length) / binCount) - 1;

/**
 * Callers may hand in ranges that extend past the zoomed-in view; intersect
 * first so bin arithmetic never sees an out-of-range index.
 */
const clipToView = (
  rawStart: number,
  rawEnd: number,
  viewStart: number,
  viewEnd: number,
): BlockRange => [Math.max(rawStart, viewStart), Math.min(rawEnd, viewEnd)];

export const createBins = (view: BlockView, binCount: number): Bins => {
  const { start: viewStart, end: viewEnd } = view;
  const length = viewEnd - viewStart;
  const counts = new Uint32Array(binCount);

  // Bins divide the view evenly in real terms, so boundaries rarely land on
  // integers and bin sizes differ by one block.
  const binOf = (index: number): number => Math.floor(((index - viewStart) * binCount) / length);

  /**
   * Exact inverse of binOf. Because binOf floors, bin b holds every index
   * whose scaled position is in [b, b + 1); the smallest integer at or above
   * b * length / binCount is its first block, hence ceil on both ends. Using
   * floor here would overlap neighbouring bins by a block.
   */
  const rangeOf = (bin: number): BlockRange => [
    viewStart + Math.ceil((bin * length) / binCount),
    viewStart + Math.ceil(((bin + 1) * length) / binCount),
  ];

  const sizeOf = (bin: number): number => {
    const [start, end] = rangeOf(bin);
    return end - start;
  };

  return {
    binCount,
    counts,
    binOf,
    rangeOf,
    sizeOf,

    // Full recount from the bitset, used after a resize or a view change.
    rebuild: (countInRange) => {
      counts.fill(0);
      if (binCount === 0) return;

      for (let bin = 0; bin < binCount; bin += 1) {
        const [start, end] = rangeOf(bin);
        counts[bin] = countInRange(start, end);
      }
    },

    /**
     * Adds a wholly-new range's blocks to the bin counts without consulting
     * the bitset: the first and last bins get the part of themselves the
     * range covers, the bins between get their full size.
     */
    addRange: (rawStart, rawEnd) => {
      const [start, end] = clipToView(rawStart, rawEnd, viewStart, viewEnd);
      if (binCount === 0 || end <= start) return;

      const first = binOf(start);
      const last = binOf(end - 1);

      if (first === last) {
        counts[first] += end - start;
        return;
      }

      counts[first] += rangeOf(first)[1] - start;
      for (let bin = first + 1; bin < last; bin += 1) counts[bin] += sizeOf(bin);
      counts[last] += end - rangeOf(last)[0];
    },

    // Which bins a range overlaps, so callers can mark exactly those dirty.
    binsTouching: (rawStart, rawEnd) => {
      const [start, end] = clipToView(rawStart, rawEnd, viewStart, viewEnd);
      if (binCount === 0 || end <= start) return [];

      const first = binOf(start);
      const last = binOf(end - 1);
      const touched: number[] = [];
      for (let bin = first; bin <= last; bin += 1) touched.push(bin);
      return touched;
    },

    recountBins: (bins, countInRange) => {
      for (const bin of bins) {
        const [start, end] = rangeOf(bin);
        counts[bin] = countInRange(start, end);
      }
    },
  };
};
