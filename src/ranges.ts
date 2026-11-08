import { RANGE_PAIR } from "./constants";

export type BlockRangeTuple = readonly [start: number, end: number];
export type RangeInput = ArrayLike<BlockRangeTuple> | ArrayLike<number>;

type Pair = [number, number];

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

export const normalizeRanges = (input: RangeInput, totalBlocks: number): Uint32Array => {
  const clamped: Pair[] = [];
  for (const [rawStart, rawEnd] of readPairs(input)) {
    if (!Number.isInteger(rawStart) || !Number.isInteger(rawEnd)) continue;
    const start = Math.max(0, rawStart);
    const end = Math.min(totalBlocks, rawEnd);
    if (end > start) clamped.push([start, end]);
  }
  clamped.sort((a, b) => a[0] - b[0]);

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

export const rangesLength = (flat: Uint32Array): number => {
  let total = 0;
  for (let i = 0; i < flat.length; i += RANGE_PAIR) total += flat[i + 1] - flat[i];
  return total;
};
