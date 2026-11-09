/**
 * Maps the current view's block range onto one bin per canvas column and
 * keeps a completed-block count per bin. Pure index arithmetic plus a
 * Uint32Array: no DOM, no colours, no knowledge of how bins are painted.
 */

import type { BlockView } from "./view";

export type BinRange = { start: number; end: number };

export type Bins = {
  readonly view: BlockView;
  readonly binCount: number;
  readonly counts: Uint32Array;
  binOf(index: number): number;
  rangeOf(bin: number): BinRange;
  sizeOf(bin: number): number;
  rebuild(countInRange: (start: number, end: number) => number): void;
  addRange(start: number, end: number): void;
  binsTouching(start: number, end: number): number[];
  recountBins(bins: Iterable<number>, countInRange: (start: number, end: number) => number): void;
};

/**
 * Callers may hand in ranges that extend past the zoomed-in view; intersect
 * first so bin arithmetic never sees an out-of-range index.
 */
const clipToView = (
  rawStart: number,
  rawEnd: number,
  viewStart: number,
  viewEnd: number,
): BinRange => ({
  start: Math.max(rawStart, viewStart),
  end: Math.min(rawEnd, viewEnd),
});

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
  const rangeOf = (bin: number): BinRange => ({
    start: viewStart + Math.ceil((bin * length) / binCount),
    end: viewStart + Math.ceil(((bin + 1) * length) / binCount),
  });

  const sizeOf = (bin: number): number => {
    const { start, end } = rangeOf(bin);
    return end - start;
  };

  return {
    view,
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
        const { start, end } = rangeOf(bin);
        counts[bin] = countInRange(start, end);
      }
    },

    /**
     * Adds a wholly-new range's blocks to the bin counts without consulting
     * the bitset: the first and last bins get the part of themselves the
     * range covers, the bins between get their full size.
     */
    addRange: (rawStart, rawEnd) => {
      const { start, end } = clipToView(rawStart, rawEnd, viewStart, viewEnd);
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

    // Which bins a range overlaps, so callers can mark exactly those dirty.
    binsTouching: (rawStart, rawEnd) => {
      const { start, end } = clipToView(rawStart, rawEnd, viewStart, viewEnd);
      if (binCount === 0 || end <= start) return [];

      const first = binOf(start);
      const last = binOf(end - 1);
      const touched: number[] = [];
      for (let bin = first; bin <= last; bin += 1) touched.push(bin);
      return touched;
    },

    recountBins: (bins, countInRange) => {
      for (const bin of bins) {
        const range = rangeOf(bin);
        counts[bin] = countInRange(range.start, range.end);
      }
    },
  };
};
