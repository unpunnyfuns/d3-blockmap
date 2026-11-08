import { createColorScale } from "./colors";
import { createRenderer } from "./renderer";
import type { Canvas2dLike, ImageDataLike, RenderSource, Scheduler } from "./renderer";
import { createPieceState } from "./state";

const theme = {
  missing: "#000000",
  partialLow: "#ff0000",
  partialHigh: "#0000ff",
  complete: "#ffffff",
};

const createStubContext = () => {
  const puts: ImageDataLike[] = [];
  const ctx: Canvas2dLike = {
    createImageData: (width, height) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: (image) => {
      puts.push(image);
    },
  };
  return { ctx, puts };
};

const createManualScheduler = () => {
  const queue = new Map<number, () => void>();
  let next = 1;
  const scheduler: Scheduler = {
    request: (callback) => {
      const handle = next;
      next += 1;
      queue.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      queue.delete(handle);
    },
  };
  const flush = () => {
    const callbacks = Array.from(queue.values());
    queue.clear();
    callbacks.forEach((callback) => callback());
  };
  return { scheduler, flush, pending: () => queue.size };
};

const pixel = (image: ImageDataLike, column: number) =>
  Array.from(image.data.subarray(column * 4, column * 4 + 4));

describe("createRenderer", () => {
  it("paints one column per bin, once per frame", () => {
    const state = createPieceState(10);
    state.resize(5);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush, pending } = createManualScheduler();
    const renderer = createRenderer(ctx, state, scheduler);
    renderer.setColors(createColorScale(theme));
    flush();
    expect(puts).toHaveLength(1);

    renderer.markDirty(state.add([0, 1]));
    renderer.markDirty(state.add([4]));
    expect(pending()).toBe(1);
    flush();

    expect(puts).toHaveLength(2);
    const image = puts[1];
    expect(pixel(image, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(image, 1)).toEqual([0, 0, 0, 255]);
    expect(pixel(image, 2)).not.toEqual([0, 0, 0, 255]);
    expect(pixel(image, 2)).not.toEqual([255, 255, 255, 255]);
  });

  it("markAllDirty paints every bin including missing ones", () => {
    const state = createPieceState(10);
    state.resize(5);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const renderer = createRenderer(ctx, state, scheduler);
    renderer.setColors(createColorScale(theme));
    renderer.markAllDirty();
    flush();
    expect(puts[0].width).toBe(5);
    expect(pixel(puts[0], 3)).toEqual([0, 0, 0, 255]);
  });

  it("reallocates the image when bin count changes", () => {
    const state = createPieceState(10);
    state.resize(5);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const renderer = createRenderer(ctx, state, scheduler);
    renderer.setColors(createColorScale(theme));
    renderer.markAllDirty();
    flush();
    state.resize(8);
    renderer.markAllDirty();
    flush();
    expect(puts[1].width).toBe(8);
  });

  it("paints discrete block spans when blocks are fewer than bins", () => {
    const state = createPieceState(3);
    state.resize(9);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const renderer = createRenderer(ctx, state, scheduler);
    renderer.setColors(createColorScale(theme));
    renderer.markDirty(state.add([1]));
    flush();
    const image = puts[0];
    expect([0, 1, 2].map((c) => pixel(image, c))).toEqual(Array(3).fill([0, 0, 0, 255]));
    expect([3, 4, 5].map((c) => pixel(image, c))).toEqual(Array(3).fill([255, 255, 255, 255]));
    expect([6, 7, 8].map((c) => pixel(image, c))).toEqual(Array(3).fill([0, 0, 0, 255]));
  });

  it("skips painting with zero bins and cancels on destroy", () => {
    const source: RenderSource = {
      totalBlocks: 10,
      binCount: 0,
      fraction: () => 0,
      has: () => false,
    };
    const { ctx, puts } = createStubContext();
    const { scheduler, flush, pending } = createManualScheduler();
    const renderer = createRenderer(ctx, source, scheduler);
    renderer.setColors(createColorScale(theme));
    renderer.markAllDirty();
    flush();
    expect(puts).toHaveLength(0);
    renderer.markAllDirty();
    renderer.destroy();
    expect(pending()).toBe(0);
  });
});
