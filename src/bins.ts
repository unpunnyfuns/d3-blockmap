import type { BlockView } from "./view";

export type BlockRange = { start: number; end: number };

export type Bins = {
  readonly view: BlockView;
  readonly binCount: number;
  readonly counts: Uint32Array;
  binOf(index: number): number;
  rangeOf(bin: number): BlockRange;
  sizeOf(bin: number): number;
  rebuild(countInRange: (start: number, end: number) => number): void;
  addRange(start: number, end: number): void;
  recount(
    start: number,
    end: number,
    countInRange: (start: number, end: number) => number,
  ): number[];
};

export const createBins = (view: BlockView, binCount: number): Bins => {
  const { start: viewStart, end: viewEnd } = view;
  const length = viewEnd - viewStart;
  const counts = new Uint32Array(binCount);
  const binOf = (index: number): number => Math.floor(((index - viewStart) * binCount) / length);
  const rangeOf = (bin: number): BlockRange => ({
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
    rebuild: (countInRange) => {
      counts.fill(0);
      if (binCount === 0) return;
      for (let bin = 0; bin < binCount; bin += 1) {
        const { start, end } = rangeOf(bin);
        counts[bin] = countInRange(start, end);
      }
    },
    addRange: (rawStart, rawEnd) => {
      const start = Math.max(rawStart, viewStart);
      const end = Math.min(rawEnd, viewEnd);
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
    recount: (rawStart, rawEnd, countInRange) => {
      const start = Math.max(rawStart, viewStart);
      const end = Math.min(rawEnd, viewEnd);
      if (binCount === 0 || end <= start) return [];
      const first = binOf(start);
      const last = binOf(end - 1);
      const touched: number[] = [];
      for (let bin = first; bin <= last; bin += 1) {
        const range = rangeOf(bin);
        counts[bin] = countInRange(range.start, range.end);
        touched.push(bin);
      }
      return touched;
    },
  };
};
