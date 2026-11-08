import { createPieceState } from "./state";

describe("createPieceState", () => {
  it("rejects invalid totalBlocks", () => {
    expect(() => createPieceState(0)).toThrow(RangeError);
    expect(() => createPieceState(1.5)).toThrow(RangeError);
  });

  it("starts with no bins and no progress", () => {
    const state = createPieceState(100);
    expect(state.binCount).toBe(0);
    expect(state.progress()).toEqual({ completed: 0, total: 100 });
  });

  it("add increments bins and returns distinct dirty bins", () => {
    const state = createPieceState(10);
    state.resize(3);
    const dirty = state.add([0, 1, 4, 9]);
    expect(Array.from(dirty).sort()).toEqual([0, 1, 2]);
    expect([0, 1, 2].map(state.countOf)).toEqual([2, 1, 1]);
    expect(state.fraction(0)).toBe(0.5);
  });

  it("skips duplicates, out of range, and non-integers", () => {
    const state = createPieceState(10);
    state.resize(3);
    state.add([2]);
    const dirty = state.add([2, -1, 10, 2.5, Number.NaN]);
    expect(dirty.length).toBe(0);
    expect(state.progress().completed).toBe(1);
  });

  it("accepts Uint32Array input", () => {
    const state = createPieceState(10);
    state.resize(5);
    state.add(new Uint32Array([0, 2, 4, 6, 8]));
    expect(state.progress().completed).toBe(5);
    expect([0, 1, 2, 3, 4].map(state.countOf)).toEqual([1, 1, 1, 1, 1]);
  });

  it("tracks completion without bins and rebuilds on resize", () => {
    const state = createPieceState(10);
    state.add([0, 1, 4, 9]);
    expect(state.progress().completed).toBe(4);
    state.resize(3);
    expect([0, 1, 2].map(state.countOf)).toEqual([2, 1, 1]);
    state.resize(2);
    expect([0, 1].map(state.countOf)).toEqual([3, 1]);
  });

  it("replace clears previous state", () => {
    const state = createPieceState(10);
    state.resize(2);
    state.add([0, 1, 2]);
    state.replace([9]);
    expect(state.progress().completed).toBe(1);
    expect([0, 1].map(state.countOf)).toEqual([0, 1]);
    expect(state.has(0)).toBe(false);
    expect(state.has(9)).toBe(true);
  });

  it("exposes rangeOf and sizeOf", () => {
    const state = createPieceState(10);
    state.resize(3);
    expect(state.rangeOf(1)).toEqual({ start: 4, end: 7 });
    expect(state.sizeOf(1)).toBe(3);
  });
});
