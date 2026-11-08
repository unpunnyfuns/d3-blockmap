import { normalizeRanges, rangesLength } from "./ranges";

const flat = (input: Parameters<typeof normalizeRanges>[0], total = 100) =>
  Array.from(normalizeRanges(input, total));

describe("normalizeRanges", () => {
  it("returns empty for empty input", () => {
    expect(flat([])).toEqual([]);
    expect(flat(new Uint32Array(0))).toEqual([]);
  });

  it("keeps a single range", () => {
    expect(flat([[2, 5]])).toEqual([2, 5]);
  });

  it("sorts by start", () => {
    expect(
      flat([
        [10, 12],
        [0, 3],
      ]),
    ).toEqual([0, 3, 10, 12]);
  });

  it("merges overlapping and touching ranges", () => {
    expect(
      flat([
        [0, 5],
        [3, 8],
      ]),
    ).toEqual([0, 8]);
    expect(
      flat([
        [0, 5],
        [5, 8],
      ]),
    ).toEqual([0, 8]);
    expect(
      flat([
        [0, 10],
        [2, 4],
      ]),
    ).toEqual([0, 10]);
  });

  it("clamps to [0, totalBlocks)", () => {
    expect(
      flat(
        [
          [-3, 4],
          [8, 20],
        ],
        10,
      ),
    ).toEqual([0, 4, 8, 10]);
  });

  it("drops empty, inverted, and non-integer tuples", () => {
    expect(
      flat([
        [5, 5],
        [7, 3],
        [1.5, 4],
        [Number.NaN, 3],
        [20, 15],
      ]),
    ).toEqual([]);
  });

  it("reads flat Uint32Array pairs and ignores an odd trailing element", () => {
    expect(flat(new Uint32Array([0, 2, 4, 6]))).toEqual([0, 2, 4, 6]);
    expect(flat(new Uint32Array([0, 2, 4]))).toEqual([0, 2]);
  });
});

describe("rangesLength", () => {
  it("sums range lengths", () => {
    expect(rangesLength(new Uint32Array([0, 3, 10, 12]))).toBe(5);
    expect(rangesLength(new Uint32Array(0))).toBe(0);
  });
});
