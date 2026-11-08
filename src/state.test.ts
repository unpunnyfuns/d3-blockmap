import { createBlockState } from "./state";

describe("createBlockState", () => {
  it("rejects invalid totalBlocks", () => {
    expect(() => createBlockState(0)).toThrow(RangeError);
    expect(() => createBlockState(1.5)).toThrow(RangeError);
  });

  it("rejects totalBlocks beyond the 32-bit limit", () => {
    expect(() => createBlockState(2 ** 32)).toThrow(RangeError);
  });

  it("starts with no bins and no progress", () => {
    const state = createBlockState(100);
    expect(state.binCount).toBe(0);
    expect(state.progress()).toEqual({ completed: 0, total: 100 });
  });

  it("add increments bins and returns distinct dirty bins", () => {
    const state = createBlockState(10);
    state.resize(3);
    const dirty = state.add([0, 1, 4, 9]);
    expect(Array.from(dirty).sort()).toEqual([0, 1, 2]);
    expect([0, 1, 2].map(state.countOf)).toEqual([2, 1, 1]);
    expect(state.fraction(0)).toBe(0.5);
  });

  it("skips duplicates, out of range, and non-integers", () => {
    const state = createBlockState(10);
    state.resize(3);
    state.add([2]);
    const dirty = state.add([2, -1, 10, 2.5, Number.NaN]);
    expect(dirty.length).toBe(0);
    expect(state.progress().completed).toBe(1);
  });

  it("accepts Uint32Array input", () => {
    const state = createBlockState(10);
    state.resize(5);
    state.add(new Uint32Array([0, 2, 4, 6, 8]));
    expect(state.progress().completed).toBe(5);
    expect([0, 1, 2, 3, 4].map(state.countOf)).toEqual([1, 1, 1, 1, 1]);
  });

  it("tracks completion without bins and rebuilds on resize", () => {
    const state = createBlockState(10);
    state.add([0, 1, 4, 9]);
    expect(state.progress().completed).toBe(4);
    state.resize(3);
    expect([0, 1, 2].map(state.countOf)).toEqual([2, 1, 1]);
    state.resize(2);
    expect([0, 1].map(state.countOf)).toEqual([3, 1]);
  });

  it("replace clears previous state", () => {
    const state = createBlockState(10);
    state.resize(2);
    state.add([0, 1, 2]);
    state.replace([9]);
    expect(state.progress().completed).toBe(1);
    expect([0, 1].map(state.countOf)).toEqual([0, 1]);
    expect(state.has(0)).toBe(false);
    expect(state.has(9)).toBe(true);
  });

  it("exposes rangeOf and sizeOf", () => {
    const state = createBlockState(10);
    state.resize(3);
    expect(state.rangeOf(1)).toEqual({ start: 4, end: 7 });
    expect(state.sizeOf(1)).toBe(3);
  });

  it("replaceRanges sets bins, progress and membership", () => {
    const state = createBlockState(10);
    state.resize(3);
    state.replaceRanges([
      [0, 2],
      [4, 7],
    ]);
    expect([0, 1, 2].map(state.countOf)).toEqual([2, 3, 0]);
    expect(state.progress()).toEqual({ completed: 5, total: 10 });
    expect(state.has(1)).toBe(true);
    expect(state.has(2)).toBe(false);
    expect(state.has(6)).toBe(true);
    expect(state.has(7)).toBe(false);
  });

  it("replaceRanges clears previous state and accepts flat pairs", () => {
    const state = createBlockState(10);
    state.resize(2);
    state.add([0, 1, 2, 3]);
    state.replaceRanges(new Uint32Array([8, 10]));
    expect([0, 1].map(state.countOf)).toEqual([0, 2]);
    expect(state.progress().completed).toBe(2);
    expect(state.has(0)).toBe(false);
  });

  it("add after replaceRanges dedupes against the ranges", () => {
    const state = createBlockState(10);
    state.resize(3);
    state.replaceRanges([[0, 2]]);
    const dirty = state.add([1, 2]);
    expect(Array.from(dirty)).toEqual([0]);
    expect(state.countOf(0)).toBe(3);
    expect(state.progress().completed).toBe(3);
  });

  it("replaceRanges with an empty input clears previous state", () => {
    const state = createBlockState(10);
    state.resize(3);
    state.replaceRanges([[0, 7]]);
    state.replaceRanges([]);
    expect(state.progress().completed).toBe(0);
    expect([0, 1, 2].map(state.countOf)).toEqual([0, 0, 0]);
    expect(state.has(0)).toBe(false);
  });

  it("replaceRanges before resize is rebuilt correctly on resize", () => {
    const state = createBlockState(10);
    state.replaceRanges([
      [0, 2],
      [4, 7],
    ]);
    expect(state.progress().completed).toBe(5);
    state.resize(3);
    expect([0, 1, 2].map(state.countOf)).toEqual([2, 3, 0]);
  });
});
