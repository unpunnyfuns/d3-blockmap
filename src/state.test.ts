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

  it("defaults to the full view", () => {
    const state = createBlockState(100);
    expect(state.getView()).toEqual({ start: 0, end: 100 });
  });

  it("setView rebuilds bins over the window", () => {
    const state = createBlockState(100);
    state.resize(5);
    state.replaceRanges([[0, 50]]);
    expect(state.setView({ start: 40, end: 60 })).toBe(true);
    expect(state.getView()).toEqual({ start: 40, end: 60 });
    expect([0, 1, 2, 3, 4].map(state.countOf)).toEqual([4, 4, 2, 0, 0]);
    expect(state.rangeOf(0)).toEqual({ start: 40, end: 44 });
    expect(state.progress().completed).toBe(50);
  });

  it("setView ignores same, inverted and non-finite input appropriately", () => {
    const state = createBlockState(100);
    state.resize(5);
    expect(state.setView({ start: 0, end: 100 })).toBe(false);
    expect(state.setView({ start: 60, end: 40 })).toBe(true);
    expect(state.getView()).toEqual({ start: 40, end: 60 });
    expect(state.setView({ start: Number.NaN, end: 10 })).toBe(false);
    expect(state.getView()).toEqual({ start: 40, end: 60 });
  });

  it("add outside the view sets bits and progress but not bins", () => {
    const state = createBlockState(100);
    state.resize(5);
    state.setView({ start: 40, end: 60 });
    const dirty = state.add([10, 45]);
    expect(Array.from(dirty)).toEqual([1]);
    expect(state.has(10)).toBe(true);
    expect(state.progress().completed).toBe(2);
    expect([0, 1, 2, 3, 4].map(state.countOf)).toEqual([0, 1, 0, 0, 0]);
  });

  it("replaceRanges under a view clips bins but keeps full progress", () => {
    const state = createBlockState(100);
    state.resize(5);
    state.setView({ start: 40, end: 60 });
    state.replaceRanges([
      [0, 44],
      [58, 100],
    ]);
    expect([0, 1, 2, 3, 4].map(state.countOf)).toEqual([4, 0, 0, 0, 2]);
    expect(state.progress().completed).toBe(86);
  });

  it("resize keeps the current view", () => {
    const state = createBlockState(100);
    state.setView({ start: 40, end: 60 });
    state.resize(4);
    expect(state.rangeOf(3)).toEqual({ start: 55, end: 60 });
  });

  it("addRanges counts only newly completed blocks and recounts touched bins", () => {
    const state = createBlockState(100);
    state.resize(10);
    state.add([5, 6, 50]);
    const dirty = state.addRanges([
      [0, 10],
      [8, 12],
      [48, 52],
    ]);
    expect(Array.from(dirty)).toEqual([0, 1, 4, 5]);
    expect(state.progress().completed).toBe(16);
    expect([0, 1, 4, 5].map(state.countOf)).toEqual([10, 2, 2, 2]);
    const fresh = createBlockState(100);
    fresh.resize(10);
    fresh.replaceRanges([
      [0, 12],
      [48, 52],
    ]);
    expect([0, 1, 2, 4, 5].map(state.countOf)).toEqual([0, 1, 2, 4, 5].map(fresh.countOf));
  });

  it("addRanges outside the view updates progress but not bins", () => {
    const state = createBlockState(100);
    state.resize(5);
    state.setView({ start: 40, end: 60 });
    const dirty = state.addRanges([
      [0, 10],
      [58, 70],
    ]);
    expect(Array.from(dirty)).toEqual([4]);
    expect(state.progress().completed).toBe(22);
    expect([0, 1, 2, 3, 4].map(state.countOf)).toEqual([0, 0, 0, 0, 2]);
  });

  it("removeRanges subtracts only present blocks and recounts", () => {
    const state = createBlockState(100);
    state.resize(10);
    state.replaceRanges([[0, 30]]);
    const dirty = state.removeRanges([
      [5, 15],
      [25, 40],
    ]);
    expect(Array.from(dirty)).toEqual([0, 1, 2, 3]);
    expect(state.progress().completed).toBe(15);
    expect([0, 1, 2, 3].map(state.countOf)).toEqual([5, 5, 5, 0]);
    expect(state.has(4)).toBe(true);
    expect(state.has(5)).toBe(false);
    expect(Array.from(state.removeRanges([[50, 60]]))).toEqual([5]);
    expect(state.progress().completed).toBe(15);
  });

  it("addRanges with no bins still sets bits and progress", () => {
    const state = createBlockState(100);
    expect(Array.from(state.addRanges([[10, 20]]))).toEqual([]);
    expect(state.progress().completed).toBe(10);
    state.resize(10);
    expect(state.countOf(1)).toBe(10);
  });
});
