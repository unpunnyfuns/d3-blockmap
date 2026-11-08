import type { ColorScale } from "./colors";
import { BYTES_PER_PIXEL, CANVAS_ROWS } from "./constants";

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
  readonly totalBlocks: number;
  readonly binCount: number;
  fraction(bin: number): number;
  has(index: number): boolean;
};

export type Scheduler = {
  request(callback: () => void): number;
  cancel(handle: number): void;
};

export type Renderer = {
  setColors(scale: ColorScale): void;
  markDirty(bins: ArrayLike<number>): void;
  markAllDirty(): void;
  destroy(): void;
};

const NO_FRAME = 0;

export const RAF_SCHEDULER: Scheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export const createRenderer = (
  ctx: Canvas2dLike,
  source: RenderSource,
  scheduler: Scheduler = RAF_SCHEDULER,
): Renderer => {
  let image: ImageDataLike | undefined;
  let scale: ColorScale | undefined;
  let frame = NO_FRAME;
  let scheduled = false;
  let allDirty = false;
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

  const writeColumn = (target: ImageDataLike, column: number, color: Uint8ClampedArray): void => {
    target.data.set(color, column * BYTES_PER_PIXEL);
  };

  const paintDiscrete = (target: ImageDataLike, colors: ColorScale): void => {
    const { totalBlocks, binCount } = source;
    for (let block = 0; block < totalBlocks; block += 1) {
      const color = colors(source.has(block) ? 1 : 0);
      const start = Math.floor((block * binCount) / totalBlocks);
      const end = Math.floor(((block + 1) * binCount) / totalBlocks);
      for (let column = start; column < end; column += 1) writeColumn(target, column, color);
    }
  };

  const paintBins = (target: ImageDataLike, colors: ColorScale): void => {
    if (allDirty) {
      for (let bin = 0; bin < source.binCount; bin += 1)
        writeColumn(target, bin, colors(source.fraction(bin)));
      return;
    }
    for (const bin of dirty) {
      if (bin >= target.width) continue;
      writeColumn(target, bin, colors(source.fraction(bin)));
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
    if (source.totalBlocks < source.binCount) paintDiscrete(target, scale);
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

  return {
    setColors: (next) => {
      scale = next;
      allDirty = true;
      schedule();
    },
    markDirty: (bins) => {
      for (let i = 0; i < bins.length; i += 1) dirty.add(bins[i]);
      if (bins.length > 0) schedule();
    },
    markAllDirty: () => {
      allDirty = true;
      schedule();
    },
    destroy: () => {
      if (scheduled) scheduler.cancel(frame);
      scheduled = false;
      frame = NO_FRAME;
      dirty.clear();
    },
  };
};
