import { clampView, fullView, panView, sameView, viewLength, zoomView } from "./view";

describe("view helpers", () => {
  it("fullView, viewLength, sameView", () => {
    expect(fullView(10)).toEqual({ start: 0, end: 10 });
    expect(viewLength({ start: 3, end: 8 })).toBe(5);
    expect(sameView({ start: 1, end: 2 }, { start: 1, end: 2 })).toBe(true);
    expect(sameView({ start: 1, end: 2 }, { start: 1, end: 3 })).toBe(false);
  });

  it("clampView swaps inverted bounds and enforces a minimum length", () => {
    expect(clampView({ start: 8, end: 3 }, 10)).toEqual({ start: 3, end: 8 });
    expect(clampView({ start: 4, end: 4 }, 10)).toEqual({ start: 4, end: 5 });
    expect(clampView({ start: 9.6, end: 9.6 }, 10)).toEqual({ start: 9, end: 10 });
  });

  it("clampView keeps the view inside the block range", () => {
    expect(clampView({ start: -5, end: 5 }, 10)).toEqual({ start: 0, end: 10 });
    expect(clampView({ start: 7, end: 15 }, 10)).toEqual({ start: 2, end: 10 });
    expect(clampView({ start: -100, end: 100 }, 10)).toEqual({ start: 0, end: 10 });
  });

  it("zoomView keeps the anchor block at the same relative position", () => {
    expect(zoomView({ start: 0, end: 1000 }, 500, 0.5, 1000)).toEqual({ start: 250, end: 750 });
    expect(zoomView({ start: 0, end: 1000 }, 250, 0.5, 1000)).toEqual({ start: 125, end: 625 });
    expect(zoomView({ start: 250, end: 750 }, 500, 2, 1000)).toEqual({ start: 0, end: 1000 });
  });

  it("zoomView clamps to the full range and to one block", () => {
    expect(zoomView({ start: 250, end: 750 }, 500, 10, 1000)).toEqual({ start: 0, end: 1000 });
    expect(zoomView({ start: 10, end: 12 }, 11, 0.1, 1000)).toEqual({ start: 11, end: 12 });
  });

  it("panView shifts and clamps", () => {
    expect(panView({ start: 100, end: 200 }, 50, 1000)).toEqual({ start: 150, end: 250 });
    expect(panView({ start: 100, end: 200 }, -150, 1000)).toEqual({ start: 0, end: 100 });
    expect(panView({ start: 800, end: 900 }, 150, 1000)).toEqual({ start: 900, end: 1000 });
  });
});
