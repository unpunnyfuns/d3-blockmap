import { createPieceMap } from "./pieceMap";

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

describe("createPieceMap", () => {
  it("appends a canvas and sizes bins to width times dpr", () => {
    const container = mount();
    const map = createPieceMap(container, { totalBlocks: 100 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    triggerResize(50);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(1);
    expect(puts.at(-1)?.width).toBe(100);
    map.destroy();
  });

  it("re-reads devicePixelRatio on resolution change and re-arms", () => {
    const container = mount();
    const map = createPieceMap(container, { totalBlocks: 100 });
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
    const map = createPieceMap(container, { totalBlocks: 10, initialBlocks: [0, 1] });
    expect(map.getProgress()).toEqual({ completed: 2, total: 10 });
    map.addBlocks([1, 2]);
    expect(map.getProgress().completed).toBe(3);
    map.setBlocks([9]);
    expect(map.getProgress().completed).toBe(1);
    map.destroy();
  });

  it("shows a tooltip for the hovered column and hides on leave", () => {
    const container = mount();
    const map = createPieceMap(container, { totalBlocks: 100 });
    triggerResize(5);
    map.addBlocks([0, 1, 2, 3, 4]);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const tooltip = container.querySelector("[data-piece-tooltip]") as HTMLElement;
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
    const map = createPieceMap(container, { totalBlocks: 10 });
    map.destroy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-piece-tooltip]")).toBeNull();
    expect(() => map.addBlocks([1])).not.toThrow();
    expect(() => map.destroy()).not.toThrow();
    expect(removed).toContain("(resolution: 2dppx)");
  });

  it("throws when the 2d context is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(() => createPieceMap(mount(), { totalBlocks: 10 })).toThrow(/2d/);
  });
});
