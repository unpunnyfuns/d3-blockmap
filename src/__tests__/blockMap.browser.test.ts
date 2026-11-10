import { createBlockMap } from "../blockMap";
import { brush } from "../brush";
import type { BlockHit, BlockMapOptions } from "../blockMap";
import { CSS_VAR_BRUSH } from "../constants";
import type { ImageDataLike } from "../renderer";
import {
  COMPLETE_RGBA,
  HIGHLIGHT_RGBA,
  MISSING_RGBA,
  at,
  ctrlWheel,
  fire,
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
    dom.flushFrames();
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(1);
    expect(dom.puts.at(-1)?.width).toBe(100);
    map.destroy();
  });

  it("does not repaint on an identical resize", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    dom.triggerResize(50);
    dom.flushFrames();
    expect(dom.puts).toHaveLength(1);
    expect(dom.puts[0]?.width).toBe(100);
    dom.triggerResize(50);
    dom.flushFrames();
    expect(dom.puts).toHaveLength(1);
    map.destroy();
  });

  it("shrinks bin count and repaints when width decreases", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    dom.triggerResize(50);
    map.addBlocks([0, 1, 2]);
    dom.triggerResize(20);
    dom.flushFrames();
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
    const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
    pointer(container, "pointermove", 0);
    expect(tooltip.style.display).toBe("block");
    expect(tooltip.textContent).toBe("Blocks 0–9 · 5 / 10 (50.0%)");
    fire(container, "pointerleave", at(container, 0));
    expect(tooltip.style.display).toBe("none");
    map.destroy();
  });

  it("hides the tooltip when the pointer is inside the container but off the canvas", () => {
    const container = dom.mount(5);
    const map = createBlockMap(container, { totalBlocks: 100 });
    dom.triggerResize(5);
    const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
    pointer(container, "pointermove", 0);
    expect(tooltip.style.display).toBe("block");
    pointer(container, "pointermove", 5);
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
    dom.flushFrames();
    const before = dom.puts.length;
    map.setRanges([
      [0, 2],
      [4, 7],
    ]);
    dom.flushFrames();
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
    dom.flushFrames();
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
    dom.flushFrames();
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
    dom.flushFrames();
    const before = dom.puts.length;
    map.setView({ start: 100, end: 200 });
    dom.flushFrames();
    expect(map.getView()).toEqual({ start: 100, end: 200 });
    expect(onViewChange).toHaveBeenCalledWith({ start: 100, end: 200 });
    expect(dom.puts.length).toBe(before + 1);
    map.setView({ start: 100, end: 200 });
    dom.flushFrames();
    expect(onViewChange).toHaveBeenCalledTimes(1);
    map.resetView();
    dom.flushFrames();
    expect(map.getView()).toEqual({ start: 0, end: 1000 });
    expect(onViewChange).toHaveBeenCalledTimes(2);
    map.destroy();
  });

  it("clamps a requested view at once and ignores a non-finite one", () => {
    const container = dom.mount();
    const onViewChange = vi.fn();
    const map = createBlockMap(container, { totalBlocks: 1000, onViewChange });
    dom.triggerResize(50);
    map.setView({ start: 950, end: 1100 });
    expect(map.getView()).toEqual({ start: 850, end: 1000 });
    map.setView({ start: Number.NaN, end: 10 });
    expect(map.getView()).toEqual({ start: 850, end: 1000 });
    dom.flushFrames();
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith({ start: 850, end: 1000 });
    map.destroy();
  });

  it("ignores a non-finite initial view", () => {
    const container = dom.mount();
    const map = createBlockMap(container, {
      totalBlocks: 1000,
      view: { start: 0, end: Number.NaN },
    });
    expect(map.getView()).toEqual({ start: 0, end: 1000 });
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
    dom.flushFrames();
    expect(map.getView()).toEqual({ start: 10, end: 20 });
    expect(onViewChange).not.toHaveBeenCalled();
    map.destroy();
  });

  it("ctrl+wheel zooms by default and does nothing when interactive is false", () => {
    const zoomable = dom.mount(50);
    const map = createBlockMap(zoomable, { totalBlocks: 1000 });
    dom.triggerResize(50);
    ctrlWheel(zoomable, -100, 25);
    expect(map.getView()).toEqual({ start: 100, end: 900 });
    map.destroy();

    const fixed = dom.mount(50);
    const still = createBlockMap(fixed, { totalBlocks: 1000, interactive: false });
    dom.triggerResize(50);
    ctrlWheel(fixed, -100, 25);
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
    dom.flushFrames();
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
    dom.flushFrames();
    expect(setInterval).not.toHaveBeenCalled();
    expect(pixel(dom.puts.at(-1) as ImageDataLike, 0)).toEqual(HIGHLIGHT_RGBA);
    map.destroy();
  });

  it("re-applies the highlight steadily when prefers-reduced-motion changes while highlighted", () => {
    dom.restore();
    let reduced = false;
    dom = installDom({ media: (q) => (q.includes("reduced-motion") ? reduced : false) });
    const setInterval = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    dom.triggerResize(5);
    map.setHighlight(true);
    expect(setInterval).toHaveBeenCalledTimes(1);

    reduced = true;
    const motionListener = dom.mediaListeners
      .filter((entry) => entry.query.includes("reduced-motion"))
      .at(-1);
    motionListener?.listener();
    dom.flushFrames();

    expect(clearInterval).toHaveBeenCalledTimes(1);
    expect(pixel(dom.puts.at(-1) as ImageDataLike, 0)).toEqual(HIGHLIGHT_RGBA);
    map.destroy();
  });

  it("resumes blinking when prefers-reduced-motion flips from reduced back to allowed", () => {
    dom.restore();
    let reduced = false;
    dom = installDom({ media: (q) => (q.includes("reduced-motion") ? reduced : false) });
    const setInterval = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    dom.triggerResize(5);
    map.setHighlight(true);
    expect(setInterval).toHaveBeenCalledTimes(1);

    const motionListener = dom.mediaListeners
      .filter((entry) => entry.query.includes("reduced-motion"))
      .at(-1);

    reduced = true;
    motionListener?.listener();
    expect(clearInterval).toHaveBeenCalledTimes(1);

    reduced = false;
    motionListener?.listener();
    expect(setInterval).toHaveBeenCalledTimes(2);
    map.destroy();
  });

  it("ignores a prefers-reduced-motion change while the highlight is off", () => {
    dom.restore();
    let reduced = false;
    dom = installDom({ media: (q) => (q.includes("reduced-motion") ? reduced : false) });
    const setInterval = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    dom.triggerResize(5);

    reduced = true;
    const motionListener = dom.mediaListeners
      .filter((entry) => entry.query.includes("reduced-motion"))
      .at(-1);
    motionListener?.listener();

    expect(setInterval).not.toHaveBeenCalled();
    expect(clearInterval).not.toHaveBeenCalled();
    map.destroy();
  });

  it("removes the reduced-motion listener on destroy", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    map.destroy();
    expect(dom.removedQueries).toContain("(prefers-reduced-motion: reduce)");
  });

  it("discrete tooltip reports the exact block the renderer painted at boundary columns", () => {
    const container = dom.mount(50);
    const map = createBlockMap(container, { totalBlocks: 7 });
    dom.triggerResize(50);
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
      pointer(container, "pointermove", offsetX);
      expect(tooltip.textContent).toBe(`Block ${expectedBlock} · missing`);
    }
    map.destroy();
  });

  it("coalesces rapid setView calls into one commit per animation frame", () => {
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
    const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
    pointer(container, "pointermove", 0);
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
    dom.flushFrames();
    expect(blocks()).toEqual(["500", "520", "540", "560", "580", "600"]);
    map.destroy();
    expect(container.querySelector("[data-blockmap-axis]")).toBeNull();
  });

  it("refreshes axis tick positions on a sub-pixel css width change with an unchanged bin count", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 1000, axis: { tickCount: 5 } });
    const lastTickLeft = () =>
      (Array.from(container.querySelectorAll("[data-blockmap-tick]")).at(-1) as HTMLElement).style
        .left;
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;

    dom.triggerResize(50);
    expect(canvas.width).toBe(100);
    expect(lastTickLeft()).toBe("50px");

    dom.triggerResize(50.2);
    expect(canvas.width).toBe(100);
    expect(lastTickLeft()).toBe("50.2px");
    map.destroy();
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
    dom.flushFrames();
    expect(map.getScale().domain).toEqual([500, 600]);
    expect(map.getScale().block(200)).toBe(550);
    map.destroy();
  });

  it("getScale lags getView by one frame during a coalesced view change", () => {
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
    dom.flushFrames();
    const before = dom.puts.length;
    map.addRanges([[20, 30]]);
    dom.flushFrames();
    expect(dom.puts.length).toBe(before + 1);
    let image = dom.puts.at(-1) as ImageDataLike;
    expect(pixel(image, 2)).toEqual(COMPLETE_RGBA);
    expect(pixel(image, 3)).toEqual(MISSING_RGBA);
    expect(map.getProgress().completed).toBe(10);
    map.removeRanges([[25, 35]]);
    dom.flushFrames();
    image = dom.puts.at(-1) as ImageDataLike;
    expect(map.getProgress().completed).toBe(5);
    expect(pixel(image, 2)).not.toEqual(COMPLETE_RGBA);
    map.destroy();
    expect(() => map.addRanges([[0, 1]])).not.toThrow();
  });

  it("addRanges before a pending view flush does not throw and resolves after flush", () => {
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

  it("canvas has role img and is focusable only when interactive", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.getAttribute("tabindex")).toBe("0");
    map.destroy();

    const fixed = dom.mount();
    const still = createBlockMap(fixed, { totalBlocks: 10, interactive: false });
    const canvas2 = fixed.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas2.getAttribute("role")).toBe("img");
    expect(canvas2.getAttribute("tabindex")).toBeNull();
    still.destroy();
  });

  it("sets touch-action pan-y only when interactive", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.style.touchAction).toBe("pan-y");
    map.destroy();

    const fixed = dom.mount();
    const still = createBlockMap(fixed, { totalBlocks: 10, interactive: false });
    const canvas2 = fixed.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas2.style.touchAction).toBe("");
    still.destroy();
  });

  it("describes the role and lists key shortcuts only when interactive", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.getAttribute("aria-roledescription")).toBe("zoomable block map");
    expect(canvas.getAttribute("aria-keyshortcuts")).toBe("Plus - ArrowLeft ArrowRight Home");
    map.destroy();

    const fixed = dom.mount();
    const still = createBlockMap(fixed, { totalBlocks: 10, interactive: false });
    const canvas2 = fixed.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas2.getAttribute("aria-roledescription")).toBe("zoomable block map");
    expect(canvas2.getAttribute("aria-keyshortcuts")).toBeNull();
    still.destroy();
  });

  it("sets a default aria-label at construction and after addBlocks", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.getAttribute("aria-label")).toBe("0 of 100 blocks complete (0%)");
    map.addBlocks(Array.from({ length: 43 }, (_, i) => i));
    expect(canvas.getAttribute("aria-label")).toBe("43 of 100 blocks complete (43%)");
    map.destroy();
  });

  it("removeBlocks updates progress and the aria-label", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    map.addBlocks(Array.from({ length: 43 }, (_, i) => i));
    map.removeBlocks([0, 1, 2]);
    expect(map.getProgress().completed).toBe(40);
    expect(canvas.getAttribute("aria-label")).toBe("40 of 100 blocks complete (40%)");
    map.destroy();
    expect(() => map.removeBlocks([5])).not.toThrow();
  });

  it("floors the default percent rather than rounding it up to 100%", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10_000_000 });
    map.addRanges([[0, 9_999_999]]);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.getAttribute("aria-label")).toBe("9,999,999 of 10,000,000 blocks complete (99%)");
    map.destroy();
  });

  it("uses a custom label option", () => {
    const container = dom.mount();
    const label = vi.fn(
      (progress: { completed: number; total: number }) => `${progress.completed}/${progress.total}`,
    );
    const map = createBlockMap(container, { totalBlocks: 100, label });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.getAttribute("aria-label")).toBe("0/100");
    map.addBlocks([0]);
    expect(canvas.getAttribute("aria-label")).toBe("1/100");
    map.destroy();
  });

  it("writes the label synchronously, before any frame runs", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100, initialBlocks: [0, 1] });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.getAttribute("aria-label")).toBe("2 of 100 blocks complete (2%)");

    map.addBlocks([2]);
    expect(canvas.getAttribute("aria-label")).toBe("3 of 100 blocks complete (3%)");
    map.destroy();
  });

  it("leaves the label untouched by an update after destroy", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    map.destroy();
    map.addBlocks([0]);
    dom.flushFrames();
    expect(canvas.getAttribute("aria-label")).toBe("0 of 100 blocks complete (0%)");
  });

  it("discrete mode removeRanges paints the missing colour for only the affected block", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 20 });
    dom.triggerResize(50);
    map.addRanges([[0, 20]]);
    map.removeRanges([[5, 6]]);
    dom.flushFrames();
    const image = dom.puts.at(-1) as ImageDataLike;
    for (let column = 25; column <= 29; column += 1) {
      expect(pixel(image, column)).toEqual(MISSING_RGBA);
    }
    for (let column = 20; column <= 24; column += 1) {
      expect(pixel(image, column)).toEqual(COMPLETE_RGBA);
    }
    map.destroy();
  });

  describe("tooltip option", () => {
    it("creates no element and shows nothing when false", () => {
      const container = dom.mount(5);
      const map = createBlockMap(container, { totalBlocks: 100, tooltip: false });
      dom.triggerResize(5);
      expect(container.querySelector("[data-blockmap-tooltip]")).toBeNull();
      expect(() => pointer(container, "pointermove", 0)).not.toThrow();
      expect(() => fire(container, "pointerleave", at(container, 0))).not.toThrow();
      expect(container.querySelector("[data-blockmap-tooltip]")).toBeNull();
      expect(() => map.destroy()).not.toThrow();
    });

    it("passes the hit to a formatter and shows its text", () => {
      const container = dom.mount(5);
      const tooltip = vi.fn((_hit: BlockHit) => "custom");
      const onBlockClick = vi.fn();
      const map = createBlockMap(container, { totalBlocks: 100, tooltip, onBlockClick });
      dom.triggerResize(5);
      map.addRanges([[20, 25]]);
      pointer(container, "pointermove", 1.2);
      fire(container, "click", at(container, 1.2));
      const el = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
      expect(el.textContent).toBe("custom");
      const { originalEvent: _ignored, ...clicked } = onBlockClick.mock.calls[0][0];
      expect(tooltip).toHaveBeenLastCalledWith({
        block: 20,
        range: [20, 30],
        completed: 5,
        total: 10,
      });
      expect(tooltip.mock.calls.at(-1)?.[0]).toEqual(clicked);
      map.destroy();
    });

    it("defaults to the single-block text when each block spans several columns", () => {
      const container = dom.mount(800);
      const map = createBlockMap(container, { totalBlocks: 10 });
      dom.triggerResize(800);
      map.addBlocks([5]);
      const el = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
      pointer(container, "pointermove", 400);
      expect(el.textContent).toBe("Block 5 · complete");
      map.destroy();
    });

    it("defaults to the single-block text when each column is a one-block bin", () => {
      const container = dom.mount(50);
      const map = createBlockMap(container, { totalBlocks: 100 });
      dom.triggerResize(50);
      map.addBlocks([50]);
      const el = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
      pointer(container, "pointermove", 25.2);
      expect(el.textContent).toBe("Block 50 · complete");
      pointer(container, "pointermove", 30.2);
      expect(el.textContent).toBe("Block 60 · missing");
      map.destroy();
    });

    it("keeps the single-block text under a zoom that gives each block several columns", () => {
      const container = dom.mount(50);
      const map = createBlockMap(container, { totalBlocks: 1000, view: { start: 500, end: 510 } });
      dom.triggerResize(50);
      const el = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
      pointer(container, "pointermove", 0);
      expect(el.textContent).toBe("Block 500 · missing");
      map.destroy();
    });
  });

  describe("onBlockClick", () => {
    it("reports a bin's range and completed count in bin mode", () => {
      const container = dom.mount();
      const onBlockClick = vi.fn();
      const map = createBlockMap(container, { totalBlocks: 100, onBlockClick });
      dom.triggerResize(5);
      map.addRanges([[20, 25]]);

      fire(container, "click", at(container, 1.2));

      expect(onBlockClick).toHaveBeenCalledTimes(1);
      const event = onBlockClick.mock.calls[0][0];
      expect(event.block).toBe(20);
      expect(event.range).toEqual([20, 30]);
      expect(event.completed).toBe(5);
      expect(event.total).toBe(10);
      expect(event.originalEvent).toBeInstanceOf(MouseEvent);
      map.destroy();
    });

    it("reports the exact block with total 1 in discrete mode", () => {
      const container = dom.mount(800);
      const onBlockClick = vi.fn();
      const map = createBlockMap(container, { totalBlocks: 10, onBlockClick });
      dom.triggerResize(800);
      map.addBlocks([5]);

      fire(container, "click", at(container, 400));

      expect(onBlockClick).toHaveBeenCalledTimes(1);
      const event = onBlockClick.mock.calls[0][0];
      expect(event.block).toBe(5);
      expect(event.range).toEqual([5, 6]);
      expect(event.completed).toBe(1);
      expect(event.total).toBe(1);
      map.destroy();
    });

    it("does not fire after a real drag", () => {
      const container = dom.mount();
      const onBlockClick = vi.fn();
      const map = createBlockMap(container, { totalBlocks: 100, onBlockClick });
      dom.triggerResize(50);

      pointer(container, "pointerdown", 50);
      pointer(container, "pointermove", 60);
      pointer(container, "pointerup", 60);
      fire(container, "click", at(container, 60));

      expect(onBlockClick).not.toHaveBeenCalled();
      map.destroy();
    });

    it("fires for a press that moved less than the drag threshold", () => {
      const container = dom.mount();
      const onBlockClick = vi.fn();
      const map = createBlockMap(container, { totalBlocks: 100, onBlockClick });
      dom.triggerResize(50);

      pointer(container, "pointerdown", 20);
      pointer(container, "pointermove", 22);
      pointer(container, "pointerup", 22);
      fire(container, "click", at(container, 22));

      expect(onBlockClick).toHaveBeenCalledTimes(1);
      map.destroy();
    });

    it("recovers from a cancelled drag so the next fresh click still fires", () => {
      const container = dom.mount();
      const onBlockClick = vi.fn();
      const map = createBlockMap(container, { totalBlocks: 100, onBlockClick });
      dom.triggerResize(5);

      // pointercancel ends the drag but is never followed by a click, so
      // nothing from that gesture may reach the next press and click.
      pointer(container, "pointerdown", 1.2);
      pointer(container, "pointermove", 10);
      pointer(container, "pointercancel", 10);

      pointer(container, "pointerdown", 1.2);
      fire(container, "click", at(container, 1.2));

      expect(onBlockClick).toHaveBeenCalledTimes(1);
      map.destroy();
    });

    it("fires when interactive is false", () => {
      const container = dom.mount();
      const onBlockClick = vi.fn();
      const map = createBlockMap(container, {
        totalBlocks: 100,
        interactive: false,
        onBlockClick,
      });
      dom.triggerResize(5);

      fire(container, "click", at(container, 1.2));

      expect(onBlockClick).toHaveBeenCalledTimes(1);
      map.destroy();
    });

    it("does not fire for a click past either canvas edge", () => {
      const container = dom.mount(800);
      const onBlockClick = vi.fn();
      const map = createBlockMap(container, { totalBlocks: 10, onBlockClick });
      dom.triggerResize(800, container);
      const rect = (container.querySelector("canvas") as HTMLCanvasElement).getBoundingClientRect();
      const y = rect.top + rect.height / 2;

      fire(container, "click", { clientX: rect.right + 5, clientY: y });
      fire(container, "click", { clientX: rect.left - 5, clientY: y });

      expect(onBlockClick).not.toHaveBeenCalled();
      map.destroy();
    });

    it("does not throw when onBlockClick is absent", () => {
      const container = dom.mount();
      const map = createBlockMap(container, { totalBlocks: 100 });
      dom.triggerResize(5);

      expect(() => fire(container, "click", at(container, 1.2))).not.toThrow();
      map.destroy();
    });
  });

  describe("brush", () => {
    const BRUSH_SELECTOR = "svg[data-blockmap-brush]";

    const overlayOf = (container: HTMLElement): SVGSVGElement | null =>
      container.querySelector(BRUSH_SELECTOR);

    const partOf = (container: HTMLElement, part: string): SVGRectElement =>
      container.querySelector(`${BRUSH_SELECTOR} ${part}`) as SVGRectElement;

    // d3-brush reads mouse events, not pointer events, and takes move/up from
    // `event.view`, so a gesture needs both families: the pointerdown the
    // browser would send first (which records where the press began), then
    // the mouse sequence d3 actually listens to.
    const mouseAt = (container: HTMLElement, x: number): Record<string, unknown> => {
      const rect = container.getBoundingClientRect();
      return { clientX: rect.left + x, clientY: rect.top + rect.height / 2, view: window };
    };

    const brushDrag = (container: HTMLElement, fromX: number, toX: number): void => {
      fire(container, "pointerdown", { ...at(container, fromX), pointerId: 1, button: 0 });
      fire(partOf(container, ".overlay"), "mousedown", mouseAt(container, fromX));
      fire(window, "mousemove", mouseAt(container, toX));
      fire(window, "mouseup", mouseAt(container, toX));
    };

    // The same sequence without the move: what a plain click on the map sends
    // once the brush overlay is in the way.
    const brushClick = (container: HTMLElement, x: number): void => {
      fire(container, "pointerdown", { ...at(container, x), pointerId: 1, button: 0 });
      fire(partOf(container, ".overlay"), "mousedown", mouseAt(container, x));
      fire(window, "mouseup", mouseAt(container, x));
    };

    // d3-drag suppresses the click after a moved gesture with its own capturing
    // window listener, cleared on a macrotask; waiting for that is what leaves
    // the map's own distance check as the only thing in the click's way.
    const afterD3ClickGuard = (): Promise<void> =>
      new Promise<void>((resolve) => setTimeout(resolve, 0));

    const mountBrushed = (options: Partial<BlockMapOptions> = {}) => {
      const container = dom.mount(800);
      const map = createBlockMap(container, { totalBlocks: 10, brush, ...options });
      dom.triggerResize(800, container);
      return { container, map };
    };

    it("renders no overlay without a brush factory", () => {
      const container = dom.mount();
      const map = createBlockMap(container, { totalBlocks: 10 });
      dom.triggerResize(50);
      expect(overlayOf(container)).toBeNull();
      expect(map.getBrush()).toBeNull();
      expect(() => map.setBrush([1, 2])).not.toThrow();
      expect(map.getBrush()).toBeNull();
      map.destroy();
    });

    it("renders an overlay stretched over the measured container", () => {
      const { container, map } = mountBrushed();
      expect(overlayOf(container)).not.toBeNull();
      expect(container.querySelector("canvas")?.nextElementSibling).toBe(overlayOf(container));
      const rect = partOf(container, ".overlay");
      expect(rect.getAttribute("width")).toBe("800");
      expect(rect.getAttribute("height")).toBe("12");
      map.destroy();
    });

    it("setBrush projects blocks to pixels and getBrush reports them", () => {
      const { container, map } = mountBrushed();
      map.setBrush([2, 5]);
      expect(map.getBrush()).toEqual([2, 5]);
      const rect = partOf(container, ".selection");
      expect(rect.getAttribute("x")).toBe("160");
      expect(rect.getAttribute("width")).toBe("240");
      map.setBrush(null);
      expect(map.getBrush()).toBeNull();
      map.destroy();
    });

    it("re-projects the selection once a view change commits", () => {
      dom.restore();
      dom = installDom();
      const { container, map } = mountBrushed();
      dom.flushFrames();
      map.setBrush([2, 5]);
      const rect = partOf(container, ".selection");
      expect(rect.getAttribute("x")).toBe("160");

      map.setView({ start: 0, end: 5 });
      expect(rect.getAttribute("x")).toBe("160");

      dom.flushFrames();

      expect(rect.getAttribute("x")).toBe("320");
      expect(rect.getAttribute("width")).toBe("480");
      expect(map.getBrush()).toEqual([2, 5]);
      map.destroy();
    });

    it("reports a dragged selection in blocks", () => {
      const onBrush = vi.fn();
      const onBrushEnd = vi.fn();
      const { container, map } = mountBrushed({ onBrush, onBrushEnd });
      brushDrag(container, 160, 400);
      expect(onBrush).toHaveBeenCalledWith([2, 5]);
      expect(onBrushEnd).toHaveBeenCalledWith([2, 5]);
      expect(map.getBrush()).toEqual([2, 5]);
      map.destroy();
    });

    it("shows the selection's range and completion while the pointer is over it", () => {
      const { container, map } = mountBrushed({ totalBlocks: 1000 });
      map.addRanges([[200, 300]]);
      map.setBrush([200, 500]);
      const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;

      fire(container, "pointermove", at(container, 240));
      expect(tooltip.style.display).toBe("block");
      expect(tooltip.textContent).toBe("Blocks 200–499 · 100 / 300 (33.3%)");

      fire(container, "pointermove", at(container, 600));
      expect(tooltip.textContent).toBe("Block 750 · missing");
      map.destroy();
    });

    it("hands a custom tooltip the selection as its hit", () => {
      const tooltip = vi.fn((_hit: BlockHit) => "custom");
      const { container, map } = mountBrushed({ totalBlocks: 1000, tooltip });
      map.addRanges([[200, 300]]);
      map.setBrush([200, 500]);

      fire(container, "pointermove", at(container, 240));

      expect(tooltip).toHaveBeenLastCalledWith({
        block: 200,
        range: [200, 500],
        completed: 100,
        total: 300,
      });
      map.destroy();
    });

    it("shows the live selection while it is being dragged", () => {
      const { container, map } = mountBrushed({ totalBlocks: 1000 });
      map.addRanges([[200, 300]]);
      const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;

      fire(container, "pointermove", at(container, 160));
      fire(container, "pointerdown", { ...at(container, 160), pointerId: 1, button: 0 });
      fire(partOf(container, ".overlay"), "mousedown", mouseAt(container, 160));
      fire(window, "mousemove", mouseAt(container, 400));

      expect(tooltip.style.display).toBe("block");
      expect(tooltip.textContent).toBe("Blocks 200–499 · 100 / 300 (33.3%)");

      pointer(container, "pointermove", 400);
      expect(tooltip.textContent).toBe("Blocks 200–499 · 100 / 300 (33.3%)");

      fire(window, "mouseup", mouseAt(container, 400));
      map.destroy();
    });

    it("hides the tooltip when a press clears the selection", () => {
      const { container, map } = mountBrushed({ totalBlocks: 1000 });
      map.setBrush([200, 500]);
      const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
      fire(container, "pointermove", at(container, 240));
      expect(tooltip.style.display).toBe("block");

      fire(container, "pointermove", at(container, 700));
      brushClick(container, 700);
      fire(container, "pointermove", at(container, 240));

      expect(map.getBrush()).toBeNull();
      expect(tooltip.textContent).toBe("Block 300 · missing");
      map.destroy();
    });

    it("brushes without a tooltip element when the tooltip is off", () => {
      const { container, map } = mountBrushed({ totalBlocks: 1000, tooltip: false });
      fire(container, "pointermove", at(container, 160));
      brushDrag(container, 160, 400);
      fire(container, "pointermove", at(container, 240));
      expect(map.getBrush()).toEqual([200, 500]);
      expect(container.querySelector("[data-blockmap-tooltip]")).toBeNull();
      map.destroy();
    });

    it("leaves panning to shift+drag while the brush owns a plain drag", () => {
      const container = dom.mount(100);
      const map = createBlockMap(container, { totalBlocks: 1000, brush });
      dom.triggerResize(100, container);
      map.setView({ start: 200, end: 400 });

      pointer(container, "pointerdown", 50);
      pointer(container, "pointermove", 60);
      expect(map.getView()).toEqual({ start: 200, end: 400 });
      pointer(container, "pointerup", 60);

      fire(container, "pointerdown", { ...at(container, 50), pointerId: 1, shiftKey: true });
      fire(container, "pointermove", {
        ...at(container, 60),
        pointerId: 1,
        buttons: 1,
        shiftKey: true,
      });
      expect(map.getView()).toEqual({ start: 180, end: 380 });
      fire(container, "pointerup", { ...at(container, 60), pointerId: 1, shiftKey: true });
      map.destroy();
    });

    it("swallows the click that ends a moved brush gesture", async () => {
      const onBlockClick = vi.fn();
      const { container, map } = mountBrushed({ onBlockClick });

      brushDrag(container, 160, 400);
      await afterD3ClickGuard();
      fire(container, "click", at(container, 400));

      expect(onBlockClick).not.toHaveBeenCalled();
      map.destroy();
    });

    it("reports a click after a sub-threshold brush drag once d3's own click guard has cleared", async () => {
      const onBlockClick = vi.fn();
      const { container, map } = mountBrushed({ onBlockClick });

      brushDrag(container, 400, 402);
      await afterD3ClickGuard();
      fire(container, "click", at(container, 402));

      expect(onBlockClick).toHaveBeenCalledTimes(1);
      expect(onBlockClick.mock.calls[0][0].block).toBe(5);
      map.destroy();
    });

    it("reports a block for a click that selected nothing", () => {
      const onBlockClick = vi.fn();
      const onBrushEnd = vi.fn();
      const { container, map } = mountBrushed({ onBlockClick, onBrushEnd });

      brushClick(container, 400);
      fire(container, "click", at(container, 400));

      expect(onBrushEnd).not.toHaveBeenCalled();
      expect(onBlockClick).toHaveBeenCalledTimes(1);
      expect(onBlockClick.mock.calls[0][0].block).toBe(5);
      map.destroy();
    });

    it("reports a double click on the overlay as neither selection nor change", () => {
      const onBrushEnd = vi.fn();
      const { container, map } = mountBrushed({ onBrushEnd });

      brushClick(container, 400);
      brushClick(container, 400);

      expect(onBrushEnd).not.toHaveBeenCalled();
      map.destroy();
    });

    it("clears an existing selection once and leaves nothing behind for the next click", async () => {
      const onBlockClick = vi.fn();
      const onBrushEnd = vi.fn();
      const { container, map } = mountBrushed({ onBlockClick, onBrushEnd });
      map.setBrush([2, 5]);

      brushClick(container, 600);

      expect(onBrushEnd).toHaveBeenCalledTimes(1);
      expect(onBrushEnd).toHaveBeenCalledWith(null);
      expect(map.getBrush()).toBeNull();

      // d3-drag guards the click after a gesture it treated as a move of the
      // existing selection, so what matters here is that nothing of the map's
      // own outlives it: the next plain click still reports.
      await afterD3ClickGuard();
      fire(container, "pointerdown", { ...at(container, 400), pointerId: 1, button: 0 });
      fire(container, "click", at(container, 400));

      expect(onBlockClick).toHaveBeenCalledTimes(1);
      map.destroy();
    });

    it("prevents the overlay mousedown default so focus stays on the canvas", () => {
      const { container, map } = mountBrushed();
      fire(container, "pointerdown", { ...at(container, 400), pointerId: 1, button: 0 });

      const event = fire(partOf(container, ".overlay"), "mousedown", mouseAt(container, 400));

      expect(event.defaultPrevented).toBe(true);
      fire(window, "mouseup", mouseAt(container, 400));
      map.destroy();
    });

    it("refreshes the brush extent when only the height changes", () => {
      const container = dom.mount(800);
      const map = createBlockMap(container, { totalBlocks: 10, brush });
      dom.triggerResize(800, container, 24);
      expect(partOf(container, ".overlay").getAttribute("height")).toBe("24");

      dom.triggerResize(800, container, 48);

      expect(partOf(container, ".overlay").getAttribute("height")).toBe("48");
      map.destroy();
    });

    it("gives the brush overlay the canvas touch-action", () => {
      const container = dom.mount(100);
      const map = createBlockMap(container, { totalBlocks: 1000, brush });
      const svg = container.querySelector("svg[data-blockmap-brush]") as SVGSVGElement;
      expect(svg.style.touchAction).toBe("pan-y");
      map.destroy();

      const still = dom.mount(100);
      const stillMap = createBlockMap(still, { totalBlocks: 1000, brush, interactive: false });
      const stillSvg = still.querySelector("svg[data-blockmap-brush]") as SVGSVGElement;
      expect(stillSvg.style.touchAction).toBe("");
      stillMap.destroy();
    });

    it("pinches with two touch pointers, which the brush leaves alone", () => {
      const container = dom.mount(100);
      const map = createBlockMap(container, { totalBlocks: 1000, brush });
      dom.triggerResize(100, container);
      dom.flushFrames();
      const touch = (type: string, offsetX: number, pointerId: number): void => {
        fire(container, type, { ...at(container, offsetX), pointerId, pointerType: "touch" });
      };

      touch("pointerdown", 40, 1);
      touch("pointerdown", 60, 2);
      touch("pointermove", 30, 1);
      touch("pointermove", 70, 2);
      dom.flushFrames();

      expect(map.getView()).toEqual({ start: 250, end: 750 });
      touch("pointerup", 70, 2);
      touch("pointerup", 30, 1);
      map.destroy();
    });

    it("pans a touch drag, which the brush leaves alone", () => {
      const container = dom.mount(100);
      const map = createBlockMap(container, { totalBlocks: 1000, brush });
      dom.triggerResize(100, container);
      map.setView({ start: 200, end: 400 });

      fire(container, "pointerdown", { ...at(container, 50), pointerId: 1, pointerType: "touch" });
      fire(container, "pointermove", { ...at(container, 60), pointerId: 1, pointerType: "touch" });

      expect(map.getView()).toEqual({ start: 180, end: 380 });
      fire(container, "pointerup", { ...at(container, 60), pointerId: 1, pointerType: "touch" });
      map.destroy();
    });

    it("reports no selection once destroyed", () => {
      const { map } = mountBrushed();
      map.setBrush([2, 5]);
      map.destroy();
      expect(map.getBrush()).toBeNull();
    });

    it("paints the selection with the themed brush colour", () => {
      const container = dom.mount(800);
      container.style.setProperty(CSS_VAR_BRUSH, "#ff00ff");
      const map = createBlockMap(container, { totalBlocks: 10, brush });
      dom.triggerResize(800, container);
      map.setBrush([2, 5]);
      const rect = partOf(container, ".selection");
      expect(rect.getAttribute("fill")).toBe("#ff00ff");
      expect(rect.getAttribute("stroke")).toBe("#ff00ff");
      map.destroy();
    });

    it("destroy removes the overlay", () => {
      const { container, map } = mountBrushed();
      map.destroy();
      expect(overlayOf(container)).toBeNull();
    });
  });
});
