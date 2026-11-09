import { createColorScale, highlightColor } from "../colors";
import { createRenderer } from "../renderer";
import type { ImageDataLike, RenderSource, Scheduler } from "../renderer";
import { createBlockState } from "../state";
import {
  TEST_THEME as theme,
  createManualScheduler,
  createManualTimer,
  createStubContext,
  pixel,
} from "../testing";

describe("createRenderer", () => {
  it("paints one column per bin, once per frame", () => {
    const state = createBlockState(10);
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
    const state = createBlockState(10);
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
    const state = createBlockState(10);
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
    const state = createBlockState(3);
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

  it("does not stall repaints when the scheduler runs synchronously", () => {
    const state = createBlockState(10);
    state.resize(5);
    const { ctx, puts } = createStubContext();
    const scheduler: Scheduler = {
      request: (callback) => {
        callback();
        return 1;
      },
      cancel: () => {},
    };
    const renderer = createRenderer(ctx, state, scheduler);
    renderer.setColors(createColorScale(theme));
    renderer.markDirty(state.add([0]));
    renderer.markDirty(state.add([1]));
    expect(puts).toHaveLength(3);
  });

  it("ignores a stale dirty bin when the source shrinks before paint", () => {
    const source = {
      binCount: 8,
      view: { start: 0, end: 8 },
      fraction: () => 0.5,
      has: () => false,
    };
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const renderer = createRenderer(ctx, source, scheduler);
    renderer.setColors(createColorScale(theme));
    renderer.markDirty([0]);
    flush();

    renderer.markDirty([7]);
    source.binCount = 4;
    expect(() => flush()).not.toThrow();
    expect(puts.at(-1)?.width).toBe(4);
  });

  it("skips painting with zero bins and cancels on destroy", () => {
    const source: RenderSource = {
      binCount: 0,
      view: { start: 0, end: 10 },
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

  it("highlight paints incomplete bins with the highlight colour while phase is on", () => {
    const state = createBlockState(10);
    state.resize(5);
    state.add([0, 1, 4]);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const { timer, tick, active } = createManualTimer();
    const renderer = createRenderer(ctx, state, scheduler, timer);
    renderer.setColors(createColorScale(theme));
    renderer.setHighlight(true, highlightColor(theme), true);
    flush();
    let image = puts.at(-1) as ImageDataLike;
    expect(pixel(image, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(image, 1)).toEqual([0, 255, 0, 255]);
    expect(pixel(image, 2)).toEqual([0, 255, 0, 255]);
    expect(active()).toBe(1);
    tick();
    flush();
    image = puts.at(-1) as ImageDataLike;
    expect(pixel(image, 1)).toEqual([0, 0, 0, 255]);
    expect(pixel(image, 2)).not.toEqual([0, 255, 0, 255]);
    renderer.setHighlight(false, highlightColor(theme), true);
    expect(active()).toBe(0);
    flush();
    expect(pixel(puts.at(-1) as ImageDataLike, 1)).toEqual([0, 0, 0, 255]);
  });

  it("highlight without blink is steady and starts no timer", () => {
    const state = createBlockState(10);
    state.resize(5);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const { timer, active } = createManualTimer();
    const renderer = createRenderer(ctx, state, scheduler, timer);
    renderer.setColors(createColorScale(theme));
    renderer.setHighlight(true, highlightColor(theme), false);
    flush();
    expect(active()).toBe(0);
    expect(pixel(puts.at(-1) as ImageDataLike, 3)).toEqual([0, 255, 0, 255]);
    renderer.destroy();
  });

  it("discrete mode paints over the view and highlights missing blocks", () => {
    const state = createBlockState(100);
    state.resize(9);
    state.setView({ start: 50, end: 53 });
    state.add([51]);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const { timer } = createManualTimer();
    const renderer = createRenderer(ctx, state, scheduler, timer);
    renderer.setColors(createColorScale(theme));
    flush();
    let image = puts.at(-1) as ImageDataLike;
    expect([0, 3, 6].map((c) => pixel(image, c))).toEqual([
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);
    renderer.setHighlight(true, highlightColor(theme), false);
    flush();
    image = puts.at(-1) as ImageDataLike;
    expect(pixel(image, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(image, 3)).toEqual([255, 255, 255, 255]);
  });

  it("setHighlightColor swaps the colour mid-blink without resetting the timer or phase", () => {
    const state = createBlockState(10);
    state.resize(5);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const { timer, tick, active } = createManualTimer();
    const renderer = createRenderer(ctx, state, scheduler, timer);
    renderer.setColors(createColorScale(theme));
    renderer.setHighlight(true, highlightColor(theme), true);
    flush();
    expect(active()).toBe(1);
    expect(pixel(puts.at(-1) as ImageDataLike, 0)).toEqual([0, 255, 0, 255]);

    const newColor = new Uint8ClampedArray([9, 9, 9, 255]);
    renderer.setHighlightColor(newColor);
    flush();
    expect(active()).toBe(1);
    expect(pixel(puts.at(-1) as ImageDataLike, 0)).toEqual([9, 9, 9, 255]);

    tick();
    flush();
    expect(pixel(puts.at(-1) as ImageDataLike, 0)).toEqual([0, 0, 0, 255]);
    renderer.destroy();
  });

  it("setHighlightColor is a no-op when no highlight is active", () => {
    const state = createBlockState(10);
    state.resize(5);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const renderer = createRenderer(ctx, state, scheduler);
    renderer.setColors(createColorScale(theme));
    flush();
    const before = puts.length;
    renderer.setHighlightColor(new Uint8ClampedArray([9, 9, 9, 255]));
    flush();
    expect(puts.length).toBe(before);
  });

  it("setHighlight(false) when already off does not repaint", () => {
    const state = createBlockState(10);
    state.resize(5);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const { timer } = createManualTimer();
    const renderer = createRenderer(ctx, state, scheduler, timer);
    renderer.setColors(createColorScale(theme));
    flush();
    const before = puts.length;
    renderer.setHighlight(false, highlightColor(theme), true);
    flush();
    expect(puts.length).toBe(before);
    renderer.setHighlight(false, highlightColor(theme), true);
    flush();
    expect(puts.length).toBe(before);
  });

  it("destroy clears the blink timer", () => {
    const state = createBlockState(10);
    state.resize(5);
    const { ctx } = createStubContext();
    const { scheduler } = createManualScheduler();
    const { timer, active } = createManualTimer();
    const renderer = createRenderer(ctx, state, scheduler, timer);
    renderer.setColors(createColorScale(theme));
    renderer.setHighlight(true, highlightColor(theme), true);
    expect(active()).toBe(1);
    renderer.destroy();
    expect(active()).toBe(0);
  });
});
