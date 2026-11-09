import { ZOOM_STEP } from "../constants";
import {
  clampView,
  createScale,
  fullView,
  legalView,
  panView,
  sameView,
  viewLength,
  zoomView,
} from "../view";

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

  it("legalView clamps a finite view and rejects a non-finite one", () => {
    expect(legalView({ start: 60, end: 40 }, 100)).toEqual({ start: 40, end: 60 });
    expect(legalView({ start: -5, end: 150 }, 100)).toEqual({ start: 0, end: 100 });
    expect(legalView({ start: Number.NaN, end: 10 }, 100)).toBeUndefined();
    expect(legalView({ start: 0, end: Number.POSITIVE_INFINITY }, 100)).toBeUndefined();
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

  it("zoomView floors the next length when zooming in, reaching one block within three steps", () => {
    let view = { start: 0, end: 3 };
    const factor = 1 / ZOOM_STEP;
    const lengths: number[] = [];
    for (let step = 0; step < 3; step += 1) {
      view = zoomView(view, view.start, factor, 1000);
      lengths.push(viewLength(view));
    }
    expect(lengths.length).toBe(3);
    expect(lengths.slice(-1)).toEqual([1]);
    expect(lengths.indexOf(1)).toBeLessThan(3);
  });

  it("zoomView ceils the next length when zooming out, growing past one block", () => {
    const view = zoomView({ start: 42, end: 43 }, 42, ZOOM_STEP, 1000);
    expect(viewLength(view)).toBe(2);
  });

  it("panView shifts and clamps", () => {
    expect(panView({ start: 100, end: 200 }, 50, 1000)).toEqual({ start: 150, end: 250 });
    expect(panView({ start: 100, end: 200 }, -150, 1000)).toEqual({ start: 0, end: 100 });
    expect(panView({ start: 800, end: 900 }, 150, 1000)).toEqual({ start: 900, end: 1000 });
  });
});

describe("createScale", () => {
  it("maps blocks to px and back", () => {
    const scale = createScale({ start: 100, end: 200 }, 400);
    expect(scale.domain).toEqual([100, 200]);
    expect(scale.range).toEqual([0, 400]);
    expect(scale.x(150)).toBe(200);
    expect(scale.block(200)).toBe(150);
    expect(scale.block(scale.x(137))).toBeCloseTo(137);
  });

  it("is safe before layout", () => {
    const scale = createScale({ start: 5, end: 10 }, 0);
    expect(scale.range).toEqual([0, 0]);
    expect(scale.x(7)).toBe(0);
    expect(scale.block(0)).toBe(5);
  });
});
