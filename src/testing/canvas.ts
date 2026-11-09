import { BYTES_PER_PIXEL } from "../constants";
import type { Canvas2dLike, ImageDataLike } from "../renderer";

const unimplemented = (name: string): never => {
  throw new Error(`unimplemented: CanvasRenderingContext2D.${name}`);
};

export const createStubContext = (): { ctx: Canvas2dLike; puts: ImageDataLike[] } => {
  const puts: ImageDataLike[] = [];
  const base: Canvas2dLike = {
    createImageData: (width, height) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * BYTES_PER_PIXEL),
    }),
    putImageData: (image) => {
      puts.push(image);
    },
  };
  const ctx = new Proxy(base, {
    get: (target, name) => {
      if (typeof name === "symbol") return undefined;
      if (name in target) return target[name as keyof Canvas2dLike];
      return unimplemented(name);
    },
  });
  return { ctx, puts };
};

export const pixel = (image: ImageDataLike, column: number): number[] =>
  Array.from(
    image.data.subarray(column * BYTES_PER_PIXEL, column * BYTES_PER_PIXEL + BYTES_PER_PIXEL),
  );
