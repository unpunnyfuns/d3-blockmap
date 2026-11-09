import { toBlocks, toPixels } from "../brush";

const VIEW = { start: 0, end: 10 };
const WIDTH = 800;
const TOTAL = 10;

describe("toPixels", () => {
  it("projects a selection into the view's pixel span", () => {
    expect(toPixels([2, 5], VIEW, WIDTH)).toEqual([160, 400]);
  });

  it("projects relative to an offset view", () => {
    expect(toPixels([120, 140], { start: 100, end: 200 }, 500)).toEqual([100, 200]);
  });

  it("clips a selection that starts before the view", () => {
    expect(toPixels([-5, 5], VIEW, WIDTH)).toEqual([0, 400]);
  });

  it("clips a selection that ends after the view", () => {
    expect(toPixels([2, 40], VIEW, WIDTH)).toEqual([160, 800]);
  });

  it("returns null when the selection ends at or before the view start", () => {
    expect(toPixels([0, 5], { start: 5, end: 10 }, WIDTH)).toBeNull();
    expect(toPixels([0, 2], { start: 5, end: 10 }, WIDTH)).toBeNull();
  });

  it("returns null when the selection starts at or after the view end", () => {
    expect(toPixels([10, 12], VIEW, WIDTH)).toBeNull();
    expect(toPixels([20, 25], VIEW, WIDTH)).toBeNull();
  });

  it("returns null before the container has a width", () => {
    expect(toPixels([2, 5], VIEW, 0)).toBeNull();
  });
});

describe("toBlocks", () => {
  it("snaps pixels back to whole blocks", () => {
    expect(toBlocks([160, 400], VIEW, WIDTH, TOTAL)).toEqual([2, 5]);
  });

  it("rounds to the nearest block", () => {
    expect(toBlocks([167, 391], VIEW, WIDTH, TOTAL)).toEqual([2, 5]);
  });

  it("round trips toPixels", () => {
    const view = { start: 1000, end: 5000 };
    const pixels = toPixels([2345, 4567], view, WIDTH);
    expect(pixels).not.toBeNull();
    expect(toBlocks(pixels as [number, number], view, WIDTH, 10_000)).toEqual([2345, 4567]);
  });

  it("widens a zero-length result by one block", () => {
    expect(toBlocks([160, 160], VIEW, WIDTH, TOTAL)).toEqual([2, 3]);
    expect(toBlocks([0, 0], VIEW, WIDTH, TOTAL)).toEqual([0, 1]);
  });

  it("widens backwards at the end of the map", () => {
    expect(toBlocks([800, 800], VIEW, WIDTH, TOTAL)).toEqual([9, 10]);
  });

  it("clamps to [0, totalBlocks]", () => {
    expect(toBlocks([-400, 1600], VIEW, WIDTH, TOTAL)).toEqual([0, 10]);
  });

  it("clamps to totalBlocks even when the view runs past it", () => {
    expect(toBlocks([0, 800], { start: 0, end: 20 }, WIDTH, TOTAL)).toEqual([0, 10]);
  });

  it("is safe before layout", () => {
    expect(toBlocks([0, 0], { start: 4, end: 10 }, 0, TOTAL)).toEqual([4, 5]);
  });

  it("stays non-negative when there are no blocks", () => {
    expect(toBlocks([0, 0], { start: 0, end: 1 }, WIDTH, 0)).toEqual([0, 0]);
  });
});
