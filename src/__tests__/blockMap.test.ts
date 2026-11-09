import { createBlockMap } from "../blockMap";
import type { ImageDataLike } from "../renderer";
import {
  COMPLETE_RGBA,
  HIGHLIGHT_RGBA,
  MISSING_RGBA,
  ctrlWheel,
  installDom,
  pixel,
  pointer,
} from "../testing";
import type { InstalledDom } from "../testing";

let dom: InstalledDom;

beforeEach(() => {
  dom = installDom();
});

afterEach(() => {
  dom.restore();
  vi.restoreAllMocks();
});

describe("createBlockMap", () => {
  it("appends a canvas and sizes bins to width times dpr", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    dom.triggerResize(50);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(1);
    expect(dom.puts.at(-1)?.width).toBe(100);
    map.destroy();
  });

  it("does not repaint on an identical resize", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    dom.triggerResize(50);
    expect(dom.puts).toHaveLength(1);
    expect(dom.puts[0]?.width).toBe(100);
    dom.triggerResize(50);
    expect(dom.puts).toHaveLength(1);
    map.destroy();
  });

  it("shrinks bin count and repaints when width decreases", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    dom.triggerResize(50);
    map.addBlocks([0, 1, 2]);
    dom.triggerResize(20);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(40);
    expect(dom.puts.at(-1)?.width).toBe(40);
    map.destroy();
  });

  it("re-reads devicePixelRatio on resolution change and re-arms", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    dom.triggerResize(50);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(100);

    vi.stubGlobal("devicePixelRatio", 3);
    const resolutionListener = dom.mediaListeners
      .filter((entry) => entry.query.includes("resolution"))
      .at(-1);
    resolutionListener?.listener();

    expect(canvas.width).toBe(150);
    expect(dom.mediaListeners.some((entry) => entry.query.includes("3dppx"))).toBe(true);
    expect(dom.removedQueries).toContain("(resolution: 2dppx)");
    map.destroy();
  });

  it("applies initialBlocks, setBlocks and addBlocks to progress", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10, initialBlocks: [0, 1] });
    expect(map.getProgress()).toEqual({ completed: 2, total: 10 });
    map.addBlocks([1, 2]);
    expect(map.getProgress().completed).toBe(3);
    map.setBlocks([9]);
    expect(map.getProgress().completed).toBe(1);
    map.destroy();
  });

  it("shows a tooltip for the hovered column and hides on leave", () => {
    const container = dom.mount(5);
    const map = createBlockMap(container, { totalBlocks: 100 });
    dom.triggerResize(5);
    map.addBlocks([0, 1, 2, 3, 4]);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
    pointer(canvas, "pointermove", 0);
    expect(tooltip.style.display).toBe("block");
    expect(tooltip.textContent).toBe("Blocks 0–9 · 5 / 10 (50.0%)");
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expect(tooltip.style.display).toBe("none");
    map.destroy();
  });

  it("destroy removes elements and makes methods no-ops", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    map.destroy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-blockmap-tooltip]")).toBeNull();
    expect(() => map.addBlocks([1])).not.toThrow();
    expect(() => map.destroy()).not.toThrow();
    expect(dom.removedQueries).toContain("(resolution: 2dppx)");
  });

  it("returns zeroed progress after destroy", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10, initialBlocks: [0, 1] });
    map.destroy();
    expect(map.getProgress()).toEqual({ completed: 0, total: 10 });
  });

  it("throws when the 2d context is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(() => createBlockMap(dom.mount(), { totalBlocks: 10 })).toThrow(/2d/);
  });

  it("setRanges replaces state and repaints", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10, initialBlocks: [9] });
    dom.triggerResize(5);
    const before = dom.puts.length;
    map.setRanges([
      [0, 2],
      [4, 7],
    ]);
    expect(map.getProgress()).toEqual({ completed: 5, total: 10 });
    expect(dom.puts.length).toBe(before + 1);
    map.destroy();
  });

  it("applies initialRanges then initialBlocks", () => {
    const container = dom.mount();
    const map = createBlockMap(container, {
      totalBlocks: 10,
      initialRanges: new Uint32Array([0, 2]),
      initialBlocks: [1, 5],
    });
    expect(map.getProgress().completed).toBe(3);
    map.destroy();
  });

  it("coverage style paints a half-covered bin as the partial colour", () => {
    const container = dom.mount();
    container.style.setProperty("--blockmap-missing", "#000000");
    container.style.setProperty("--blockmap-complete", "#ffffff");
    const map = createBlockMap(container, { totalBlocks: 100, partial: "coverage" });
    dom.triggerResize(5);
    map.setRanges([[0, 5]]);
    const image = dom.puts.at(-1) as ImageDataLike;
    const [r, g, b] = pixel(image, 0);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(100);
    expect(g).toBeLessThan(200);
    expect(b).toBeLessThan(10);
    expect(pixel(image, 1)).toEqual([0, 0, 0, 255]);
    map.destroy();
  });

  it("discrete mode paints each block as its own segment across more bins than blocks", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 128 });
    dom.triggerResize(100);
    map.setRanges([
      [0, 32],
      [96, 128],
    ]);
    expect(map.getProgress().completed).toBe(64);

    const image = dom.puts.at(-1) as ImageDataLike;
    expect(image.width).toBe(200);
    expect(pixel(image, 0)).toEqual(COMPLETE_RGBA);
    expect(pixel(image, 100)).toEqual(MISSING_RGBA);
    map.destroy();
  });

  it("setView repaints and reports changes only when the view changes", () => {
    const container = dom.mount();
    const onViewChange = vi.fn();
    const map = createBlockMap(container, { totalBlocks: 1000, onViewChange });
    dom.triggerResize(50);
    const before = dom.puts.length;
    map.setView({ start: 100, end: 200 });
    expect(map.getView()).toEqual({ start: 100, end: 200 });
    expect(onViewChange).toHaveBeenCalledWith({ start: 100, end: 200 });
    expect(dom.puts.length).toBe(before + 1);
    map.setView({ start: 100, end: 200 });
    expect(onViewChange).toHaveBeenCalledTimes(1);
    map.resetView();
    expect(map.getView()).toEqual({ start: 0, end: 1000 });
    expect(onViewChange).toHaveBeenCalledTimes(2);
    map.destroy();
  });

  it("applies an initial view without reporting it", () => {
    const container = dom.mount();
    const onViewChange = vi.fn();
    const map = createBlockMap(container, {
      totalBlocks: 1000,
      view: { start: 10, end: 20 },
      onViewChange,
    });
    expect(map.getView()).toEqual({ start: 10, end: 20 });
    expect(onViewChange).not.toHaveBeenCalled();
    map.destroy();
  });

  it("ctrl+wheel zooms by default and does nothing when interactive is false", () => {
    const zoomable = dom.mount(50);
    const map = createBlockMap(zoomable, { totalBlocks: 1000 });
    dom.triggerResize(50);
    const canvas = zoomable.querySelector("canvas") as HTMLCanvasElement;
    ctrlWheel(canvas, -100, 25);
    expect(map.getView()).toEqual({ start: 100, end: 900 });
    map.destroy();

    const fixed = dom.mount(50);
    const still = createBlockMap(fixed, { totalBlocks: 1000, interactive: false });
    dom.triggerResize(50);
    const canvas2 = fixed.querySelector("canvas") as HTMLCanvasElement;
    ctrlWheel(canvas2, -100, 25);
    expect(still.getView()).toEqual({ start: 0, end: 1000 });
    still.destroy();
  });

  it("setHighlight paints incomplete bins with the highlight colour and starts a blink timer", () => {
    const setInterval = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    dom.triggerResize(5);
    map.addBlocks([0]);
    map.setHighlight(true);
    const image = dom.puts.at(-1) as ImageDataLike;
    expect(pixel(image, 0)).toEqual(COMPLETE_RGBA);
    expect(pixel(image, 1)).toEqual(HIGHLIGHT_RGBA);
    expect(setInterval).toHaveBeenCalledTimes(1);
    map.setHighlight(false);
    expect(clearInterval).toHaveBeenCalledTimes(1);
    map.destroy();
  });

  it("highlight is steady under reduced motion", () => {
    dom.restore();
    dom = installDom({ media: (q) => q.includes("reduced-motion") });
    const setInterval = vi.spyOn(window, "setInterval");
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    dom.triggerResize(5);
    map.setHighlight(true);
    expect(setInterval).not.toHaveBeenCalled();
    expect(pixel(dom.puts.at(-1) as ImageDataLike, 0)).toEqual(HIGHLIGHT_RGBA);
    map.destroy();
  });

  it("discrete tooltip reports the exact block the renderer painted at boundary columns", () => {
    const container = dom.mount(50);
    const map = createBlockMap(container, { totalBlocks: 7 });
    dom.triggerResize(50);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
    // 7 blocks over 100 bins, boundaries at columns [0, 14, 28, 42, 57, 71, 85, 100];
    // offsetX = column / 2 (DPR 2). Pairs straddle the boundaries at columns 14, 42, 85.
    const cases: Array<[offsetX: number, expectedBlock: number]> = [
      [6.5, 0],
      [7, 1],
      [20.5, 2],
      [21, 3],
      [42, 5],
      [42.5, 6],
    ];
    for (const [offsetX, expectedBlock] of cases) {
      pointer(canvas, "pointermove", offsetX);
      expect(tooltip.textContent).toBe(`Block ${expectedBlock} · missing`);
    }
    map.destroy();
  });

  it("coalesces rapid setView calls into one commit per animation frame", () => {
    dom.restore();
    dom = installDom({ deferFrames: true });
    const container = dom.mount();
    const onViewChange = vi.fn();
    const map = createBlockMap(container, { totalBlocks: 1000, onViewChange });
    dom.triggerResize(50);
    dom.flushFrames();
    const before = dom.puts.length;

    map.setView({ start: 10, end: 20 });
    map.setView({ start: 20, end: 30 });
    map.setView({ start: 30, end: 40 });

    expect(map.getView()).toEqual({ start: 30, end: 40 });
    expect(onViewChange).not.toHaveBeenCalled();
    expect(dom.puts.length).toBe(before);

    dom.flushFrames();

    expect(map.getView()).toEqual({ start: 30, end: 40 });
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith({ start: 30, end: 40 });
    expect(dom.puts.length).toBe(before + 1);
    map.destroy();
  });

  it("tooltip shows absolute block ranges under a view", () => {
    const container = dom.mount(5);
    const map = createBlockMap(container, { totalBlocks: 1000, view: { start: 500, end: 600 } });
    dom.triggerResize(5);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
    pointer(canvas, "pointermove", 0);
    expect(tooltip.textContent).toBe("Blocks 500–509 · 0 / 10 (0%)");
    map.destroy();
  });

  it("renders no axis by default", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 1000 });
    dom.triggerResize(400);
    expect(container.querySelector("[data-blockmap-axis]")).toBeNull();
    map.destroy();
  });

  it("renders axis ticks after layout and updates after a view change", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 1000, axis: { tickCount: 5 } });
    dom.triggerResize(400);
    const blocks = () =>
      Array.from(container.querySelectorAll("[data-blockmap-tick]")).map(
        (s) => (s as HTMLElement).dataset.block,
      );
    expect(blocks()).toEqual(["0", "200", "400", "600", "800", "1000"]);
    map.setView({ start: 500, end: 600 });
    expect(blocks()).toEqual(["500", "520", "540", "560", "580", "600"]);
    map.destroy();
    expect(container.querySelector("[data-blockmap-axis]")).toBeNull();
  });

  it("getScale reflects layout and view", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 1000 });
    expect(map.getScale().range).toEqual([0, 0]);
    dom.triggerResize(400);
    expect(map.getScale().domain).toEqual([0, 1000]);
    expect(map.getScale().range).toEqual([0, 400]);
    expect(map.getScale().x(500)).toBe(200);
    map.setView({ start: 500, end: 600 });
    expect(map.getScale().domain).toEqual([500, 600]);
    expect(map.getScale().block(200)).toBe(550);
    map.destroy();
  });

  it("getScale lags getView by one frame during a coalesced view change", () => {
    dom.restore();
    dom = installDom({ deferFrames: true });
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 1000 });
    dom.triggerResize(400);
    dom.flushFrames();

    map.setView({ start: 100, end: 200 });

    expect(map.getView()).toEqual({ start: 100, end: 200 });
    expect(map.getScale().domain).toEqual([0, 1000]);

    dom.flushFrames();

    expect(map.getView()).toEqual({ start: 100, end: 200 });
    expect(map.getScale().domain).toEqual([100, 200]);
    map.destroy();
  });

  it("addRanges repaints only touched columns and removeRanges reverts them", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    dom.triggerResize(5);
    const before = dom.puts.length;
    map.addRanges([[20, 30]]);
    expect(dom.puts.length).toBe(before + 1);
    let image = dom.puts.at(-1) as ImageDataLike;
    expect(pixel(image, 2)).toEqual(COMPLETE_RGBA);
    expect(pixel(image, 3)).toEqual(MISSING_RGBA);
    expect(map.getProgress().completed).toBe(10);
    map.removeRanges([[25, 35]]);
    image = dom.puts.at(-1) as ImageDataLike;
    expect(map.getProgress().completed).toBe(5);
    expect(pixel(image, 2)).not.toEqual(COMPLETE_RGBA);
    map.destroy();
    expect(() => map.addRanges([[0, 1]])).not.toThrow();
  });

  it("addRanges before a pending view flush does not throw and resolves after flush", () => {
    dom.restore();
    dom = installDom({ deferFrames: true });
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 1000 });
    dom.triggerResize(50);
    dom.flushFrames();
    const widthBefore = dom.puts.at(-1)?.width;

    map.setView({ start: 500, end: 600 });
    expect(() => map.addRanges([[0, 10]])).not.toThrow();
    expect(dom.puts.at(-1)?.width).toBe(widthBefore);

    dom.flushFrames();

    expect(map.getProgress().completed).toBe(10);
    expect(map.getView()).toEqual({ start: 500, end: 600 });
    map.destroy();
  });

  it("discrete mode removeRanges paints the missing colour for only the affected block", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 20 });
    dom.triggerResize(50);
    map.addRanges([[0, 20]]);
    map.removeRanges([[5, 6]]);
    const image = dom.puts.at(-1) as ImageDataLike;
    for (let column = 25; column <= 29; column += 1) {
      expect(pixel(image, column)).toEqual(MISSING_RGBA);
    }
    for (let column = 20; column <= 24; column += 1) {
      expect(pixel(image, column)).toEqual(COMPLETE_RGBA);
    }
    map.destroy();
  });
});
