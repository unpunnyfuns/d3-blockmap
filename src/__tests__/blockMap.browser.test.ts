import { createBlockMap } from "../blockMap";
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
    const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
    pointer(container, "pointermove", 0);
    expect(tooltip.style.display).toBe("block");
    expect(tooltip.textContent).toBe("Blocks 0–9 · 5 / 10 (50.0%)");
    fire(container, "pointerleave", at(container, 0));
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
    expect(canvas.getAttribute("aria-label")).toBe("Download progress: 0 of 100 blocks (0%)");
    map.addBlocks(Array.from({ length: 43 }, (_, i) => i));
    expect(canvas.getAttribute("aria-label")).toBe("Download progress: 43 of 100 blocks (43%)");
    map.destroy();
  });

  it("floors the default percent rather than rounding it up to 100%", () => {
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 10_000_000 });
    map.addRanges([[0, 9_999_999]]);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.getAttribute("aria-label")).toBe(
      "Download progress: 9,999,999 of 10,000,000 blocks (99%)",
    );
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

  it("sets the first label synchronously, before any frame runs", () => {
    dom.restore();
    dom = installDom({ deferFrames: true });
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100, initialBlocks: [0, 1] });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.getAttribute("aria-label")).toBe("Download progress: 2 of 100 blocks (2%)");

    map.addBlocks([2]);
    expect(canvas.getAttribute("aria-label")).toBe("Download progress: 2 of 100 blocks (2%)");

    dom.flushFrames();
    expect(canvas.getAttribute("aria-label")).toBe("Download progress: 3 of 100 blocks (3%)");
    map.destroy();
  });

  it("destroy before a pending label frame flushes does not throw", () => {
    dom.restore();
    dom = installDom({ deferFrames: true });
    const container = dom.mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    map.addBlocks([0]);
    expect(() => map.destroy()).not.toThrow();
    expect(canvas.getAttribute("aria-label")).toBe("Download progress: 0 of 100 blocks (0%)");
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

    it("recovers from a cancelled drag so the next fresh click still fires", () => {
      const container = dom.mount();
      const onBlockClick = vi.fn();
      const map = createBlockMap(container, { totalBlocks: 100, onBlockClick });
      dom.triggerResize(5);

      // pointercancel ends the drag through the same onDragEnd as pointerup
      // but is never followed by a click, so suppressClick must not survive
      // past the next pointerdown.
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

    it("does not throw when onBlockClick is absent", () => {
      const container = dom.mount();
      const map = createBlockMap(container, { totalBlocks: 100 });
      dom.triggerResize(5);

      expect(() => fire(container, "click", at(container, 1.2))).not.toThrow();
      map.destroy();
    });
  });
});
