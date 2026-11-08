import type { ColorScale } from "./colors";
import { BLINK_INTERVAL_MS, BYTES_PER_PIXEL, CANVAS_ROWS } from "./constants";
import { viewLength } from "./view";
import type { BlockView } from "./view";

export type ImageDataLike = {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
};

export type Canvas2dLike = {
  createImageData(width: number, height: number): ImageDataLike;
  putImageData(image: ImageDataLike, dx: number, dy: number): void;
};

export type RenderSource = {
  readonly binCount: number;
  readonly view: BlockView;
  fraction(bin: number): number;
  has(index: number): boolean;
};

export type Scheduler = {
  request(callback: () => void): number;
  cancel(handle: number): void;
};

export type IntervalTimer = {
  set(callback: () => void, ms: number): number;
  clear(id: number): void;
};

export type Renderer = {
  setColors(scale: ColorScale): void;
  setHighlight(on: boolean, color: Uint8ClampedArray, blink: boolean): void;
  markDirty(bins: ArrayLike<number>): void;
  markAllDirty(): void;
  destroy(): void;
};

const NO_FRAME = 0;
const NO_TIMER = 0;
const COMPLETE = 1;

export const RAF_SCHEDULER: Scheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export const WINDOW_TIMER: IntervalTimer = {
  set: (callback, ms) => window.setInterval(callback, ms),
  clear: (id) => window.clearInterval(id),
};

export const createRenderer = (
  ctx: Canvas2dLike,
  source: RenderSource,
  scheduler: Scheduler = RAF_SCHEDULER,
  timer: IntervalTimer = WINDOW_TIMER,
): Renderer => {
  let image: ImageDataLike | undefined;
  let scale: ColorScale | undefined;
  let frame = NO_FRAME;
  let scheduled = false;
  let allDirty = false;
  let highlight: Uint8ClampedArray | undefined;
  let phase = false;
  let blinkId = NO_TIMER;
  const dirty = new Set<number>();

  const ensureImage = (): ImageDataLike | undefined => {
    const { binCount } = source;
    if (binCount === 0) return undefined;
    if (!image || image.width !== binCount) {
      image = ctx.createImageData(binCount, CANVAS_ROWS);
      allDirty = true;
    }
    return image;
  };

  const colorFor = (colors: ColorScale, fraction: number): Uint8ClampedArray =>
    highlight && phase && fraction < COMPLETE ? highlight : colors(fraction);

  const writeColumn = (target: ImageDataLike, column: number, color: Uint8ClampedArray): void => {
    target.data.set(color, column * BYTES_PER_PIXEL);
  };

  const paintDiscrete = (target: ImageDataLike, colors: ColorScale): void => {
    const { view, binCount } = source;
    const length = viewLength(view);
    for (let block = 0; block < length; block += 1) {
      const color = colorFor(colors, source.has(view.start + block) ? COMPLETE : 0);
      const start = Math.floor((block * binCount) / length);
      const end = Math.floor(((block + 1) * binCount) / length);
      for (let column = start; column < end; column += 1) writeColumn(target, column, color);
    }
  };

  const paintBins = (target: ImageDataLike, colors: ColorScale): void => {
    if (allDirty) {
      for (let bin = 0; bin < source.binCount; bin += 1)
        writeColumn(target, bin, colorFor(colors, source.fraction(bin)));
      return;
    }
    for (const bin of dirty) {
      if (bin >= target.width) continue;
      writeColumn(target, bin, colorFor(colors, source.fraction(bin)));
    }
  };

  const paint = (): void => {
    scheduled = false;
    frame = NO_FRAME;
    const target = ensureImage();
    if (!target || !scale) {
      dirty.clear();
      allDirty = false;
      return;
    }
    if (viewLength(source.view) < source.binCount) paintDiscrete(target, scale);
    else paintBins(target, scale);
    ctx.putImageData(target, 0, 0);
    dirty.clear();
    allDirty = false;
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    frame = scheduler.request(paint);
  };

  const markAllDirty = (): void => {
    allDirty = true;
    schedule();
  };

  const stopBlink = (): void => {
    if (blinkId !== NO_TIMER) timer.clear(blinkId);
    blinkId = NO_TIMER;
  };

  return {
    setColors: (next) => {
      scale = next;
      markAllDirty();
    },
    setHighlight: (on, color, blink) => {
      stopBlink();
      highlight = on ? color : undefined;
      phase = on;
      if (on && blink) {
        blinkId = timer.set(() => {
          phase = !phase;
          markAllDirty();
        }, BLINK_INTERVAL_MS);
      }
      markAllDirty();
    },
    markDirty: (bins) => {
      for (let i = 0; i < bins.length; i += 1) dirty.add(bins[i]);
      if (bins.length > 0) schedule();
    },
    markAllDirty,
    destroy: () => {
      stopBlink();
      if (scheduled) scheduler.cancel(frame);
      scheduled = false;
      frame = NO_FRAME;
      dirty.clear();
    },
  };
};
