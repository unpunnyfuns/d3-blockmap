import { rgb } from "d3-color";
import { DEFAULT_THEME } from "./constants";
import { createBlockMap } from "./blockMap";

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;
type MediaListener = { query: string; listener: () => void };

const observers: ResizeCallback[] = [];
const puts: ImageData[] = [];
const mediaListeners: MediaListener[] = [];
const removed: string[] = [];

class StubResizeObserver {
  constructor(callback: ResizeCallback) {
    observers.push(callback);
  }
  observe() {}
  disconnect() {}
}

const triggerResize = (width: number) =>
  observers.forEach((cb) => cb([{ contentRect: { width } } as unknown as ResizeObserverEntry]));

beforeEach(() => {
  observers.length = 0;
  puts.length = 0;
  mediaListeners.length = 0;
  removed.length = 0;
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  vi.stubGlobal("devicePixelRatio", 2);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("matchMedia", (query: string) => ({
    addEventListener: (_type: string, listener: () => void) => {
      mediaListeners.push({ query, listener });
    },
    removeEventListener: (_type: string) => {
      removed.push(query);
    },
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    createImageData: (width: number, height: number) =>
      ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as unknown as ImageData,
    putImageData: (image: ImageData) => {
      puts.push(image);
    },
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = () => {
  const container = document.createElement("div");
  document.body.append(container);
  return container;
};

describe("createBlockMap", () => {
  it("appends a canvas and sizes bins to width times dpr", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    triggerResize(50);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(1);
    expect(puts.at(-1)?.width).toBe(100);
    map.destroy();
  });

  it("does not repaint on an identical resize", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    triggerResize(50);
    expect(puts).toHaveLength(1);
    expect(puts[0]?.width).toBe(100);
    triggerResize(50);
    expect(puts).toHaveLength(1);
    map.destroy();
  });

  it("shrinks bin count and repaints when width decreases", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    triggerResize(50);
    map.addBlocks([0, 1, 2]);
    triggerResize(20);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(40);
    expect(puts.at(-1)?.width).toBe(40);
    map.destroy();
  });

  it("re-reads devicePixelRatio on resolution change and re-arms", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    triggerResize(50);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(100);

    vi.stubGlobal("devicePixelRatio", 3);
    const resolutionListener = mediaListeners
      .filter((entry) => entry.query.includes("resolution"))
      .at(-1);
    resolutionListener?.listener();

    expect(canvas.width).toBe(150);
    expect(mediaListeners.some((entry) => entry.query.includes("3dppx"))).toBe(true);
    expect(removed).toContain("(resolution: 2dppx)");
    map.destroy();
  });

  it("applies initialBlocks, setBlocks and addBlocks to progress", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 10, initialBlocks: [0, 1] });
    expect(map.getProgress()).toEqual({ completed: 2, total: 10 });
    map.addBlocks([1, 2]);
    expect(map.getProgress().completed).toBe(3);
    map.setBlocks([9]);
    expect(map.getProgress().completed).toBe(1);
    map.destroy();
  });

  it("shows a tooltip for the hovered column and hides on leave", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    triggerResize(5);
    map.addBlocks([0, 1, 2, 3, 4]);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const tooltip = container.querySelector("[data-block-tooltip]") as HTMLElement;
    const move = new MouseEvent("pointermove", { bubbles: true });
    Object.defineProperty(move, "offsetX", { value: 0 });
    canvas.dispatchEvent(move);
    expect(tooltip.style.display).toBe("block");
    expect(tooltip.textContent).toBe("Blocks 0–9 · 5 / 10 (50.0%)");
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expect(tooltip.style.display).toBe("none");
    map.destroy();
  });

  it("destroy removes elements and makes methods no-ops", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    map.destroy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-block-tooltip]")).toBeNull();
    expect(() => map.addBlocks([1])).not.toThrow();
    expect(() => map.destroy()).not.toThrow();
    expect(removed).toContain("(resolution: 2dppx)");
  });

  it("returns zeroed progress after destroy", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 10, initialBlocks: [0, 1] });
    map.destroy();
    expect(map.getProgress()).toEqual({ completed: 0, total: 10 });
  });

  it("throws when the 2d context is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(() => createBlockMap(mount(), { totalBlocks: 10 })).toThrow(/2d/);
  });

  it("setRanges replaces state and repaints", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 10, initialBlocks: [9] });
    triggerResize(5);
    const before = puts.length;
    map.setRanges([
      [0, 2],
      [4, 7],
    ]);
    expect(map.getProgress()).toEqual({ completed: 5, total: 10 });
    expect(puts.length).toBe(before + 1);
    map.destroy();
  });

  it("applies initialRanges then initialBlocks", () => {
    const container = mount();
    const map = createBlockMap(container, {
      totalBlocks: 10,
      initialRanges: new Uint32Array([0, 2]),
      initialBlocks: [1, 5],
    });
    expect(map.getProgress().completed).toBe(3);
    map.destroy();
  });

  it("coverage style paints a half-covered bin as the partial colour", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      position: "static",
      getPropertyValue: (name: string) =>
        ({ "--block-missing": "#000000", "--block-complete": "#ffffff" })[name] ?? "",
    } as unknown as CSSStyleDeclaration);
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 100, partial: "coverage" });
    triggerResize(5);
    map.setRanges([[0, 5]]);
    const image = puts.at(-1) as ImageData;
    const [r, g, b] = Array.from(image.data.subarray(0, 4));
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(100);
    expect(g).toBeLessThan(200);
    expect(b).toBeLessThan(10);
    expect(Array.from(image.data.subarray(4, 8))).toEqual([0, 0, 0, 255]);
    map.destroy();
  });

  it("discrete mode paints each block as its own segment across more bins than blocks", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 128 });
    triggerResize(100);
    map.setRanges([
      [0, 32],
      [96, 128],
    ]);
    expect(map.getProgress().completed).toBe(64);

    const image = puts.at(-1) as ImageData;
    expect(image.width).toBe(200);
    const complete = rgb(DEFAULT_THEME.complete);
    const missing = rgb(DEFAULT_THEME.missing);
    expect(Array.from(image.data.subarray(0, 4))).toEqual([
      complete.r,
      complete.g,
      complete.b,
      255,
    ]);
    const columnOffset = 100 * 4;
    expect(Array.from(image.data.subarray(columnOffset, columnOffset + 4))).toEqual([
      missing.r,
      missing.g,
      missing.b,
      255,
    ]);
    map.destroy();
  });
});
