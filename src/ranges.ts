/**
 * Normalises caller-supplied block ranges into one canonical form: a flat
 * Uint32Array of sorted, non-overlapping [start, end) pairs. Everything
 * downstream can then assume that shape; this module does no state keeping.
 */

import { RANGE_PAIR } from "./constants";

export type BlockRangeTuple = readonly [start: number, end: number];
export type RangeInput = ArrayLike<BlockRangeTuple> | ArrayLike<number>;

type Pair = [number, number];

/**
 * Two accepted input shapes: a flat [s, e, s, e, ...] list (typically a
 * typed array straight off the wire) or an array of [start, end] tuples.
 * A typed array is always flat; otherwise a numeric first element decides.
 */
const isFlatPairs = (input: RangeInput): input is ArrayLike<number> =>
  ArrayBuffer.isView(input) || typeof input[0] === "number";

const readPairs = (input: RangeInput): Pair[] => {
  const pairs: Pair[] = [];

  if (isFlatPairs(input)) {
    const pairCount = Math.floor(input.length / RANGE_PAIR);
    for (let i = 0; i < pairCount; i += 1) {
      pairs.push([input[i * RANGE_PAIR], input[i * RANGE_PAIR + 1]]);
    }
    return pairs;
  }

  for (let i = 0; i < input.length; i += 1) {
    const tuple = input[i];
    pairs.push([tuple[0], tuple[1]]);
  }
  return pairs;
};

/**
 * Drops non-integer and empty ranges, clamps to [0, totalBlocks), then sorts
 * by start and merges anything that overlaps or touches. Merging matters
 * because replaceRanges trusts that shape: it sums the range lengths for the
 * progress total and adds each range into the bin counts arithmetically, so
 * an overlap would be counted twice.
 */
export const normalizeRanges = (input: RangeInput, totalBlocks: number): Uint32Array => {
  const clamped: Pair[] = [];
  for (const [rawStart, rawEnd] of readPairs(input)) {
    if (!Number.isInteger(rawStart) || !Number.isInteger(rawEnd)) continue;
    const start = Math.max(0, rawStart);
    const end = Math.min(totalBlocks, rawEnd);
    if (end > start) clamped.push([start, end]);
  }
  clamped.sort((a, b) => a[0] - b[0]);

  // merged holds the flat result, so its last element is the previous end;
  // a start at or below it extends that pair instead of opening a new one.
  const merged: number[] = [];
  for (const [start, end] of clamped) {
    const lastIndex = merged.length - 1;
    if (merged.length > 0 && start <= merged[lastIndex]) {
      merged[lastIndex] = Math.max(merged[lastIndex], end);
    } else {
      merged.push(start, end);
    }
  }
  return Uint32Array.from(merged);
};

// Total blocks covered; only correct for normalized (non-overlapping) input.
export const rangesLength = (flat: Uint32Array): number => {
  let total = 0;
  for (let i = 0; i < flat.length; i += RANGE_PAIR) total += flat[i + 1] - flat[i];
  return total;
};
