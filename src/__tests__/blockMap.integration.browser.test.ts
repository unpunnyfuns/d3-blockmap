import { createBlockMap } from "../blockMap";
import { CSS_VAR_HIGHLIGHT } from "../constants";
import type { ImageDataLike } from "../renderer";
import {
  COMPLETE_RGBA,
  MISSING_RGBA,
  ctrlWheel,
  installDom,
  metaWheel,
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
  document.documentElement.removeAttribute("data-theme");
});

const setup = (totalBlocks: number, width: number) => {
  const container = dom.mount(width);
  const onViewChange = vi.fn();
  const map = createBlockMap(container, { totalBlocks, onViewChange });
  dom.triggerResize(width);
  dom.flushFrames();
  return { container, map, onViewChange };
};

describe("createBlockMap integration", () => {
  it("ignores wheel zoom during a drag and pans from the drag baseline", () => {
    const { map, container } = setup(1000, 100);
    map.setView({ start: 200, end: 400 });
    dom.flushFrames();

    pointer(container, "pointerdown", 50);
    pointer(container, "pointermove", 60);
    dom.flushFrames();
    expect(map.getView()).toEqual({ start: 180, end: 380 });

    ctrlWheel(container, -100, 60);
    dom.flushFrames();
    expect(map.getView()).toEqual({ start: 180, end: 380 });

    pointer(container, "pointermove", 70);
    dom.flushFrames();
    expect(map.getView()).toEqual({ start: 160, end: 360 });

    pointer(container, "pointerup", 70);
    map.destroy();
  });

  it("keeps the view exact and clamped when a resize happens mid-drag", () => {
    const { map, container } = setup(1000, 100);
    map.setView({ start: 200, end: 400 });
    dom.flushFrames();
    pointer(container, "pointerdown", 50);
    pointer(container, "pointermove", 55);
    dom.triggerResize(50);
    pointer(container, "pointermove", 60);
    dom.flushFrames();
    expect(map.getView()).toEqual({ start: 160, end: 360 });
    pointer(container, "pointerup", 60);
    map.destroy();
  });

  it("destroy during a drag is safe and later moves have no effect", () => {
    const { map, container } = setup(1000, 100);
    map.setView({ start: 200, end: 400 });
    dom.flushFrames();
    pointer(container, "pointerdown", 50);
    pointer(container, "pointermove", 60);
    dom.flushFrames();
    const before = map.getView();
    expect(before).toEqual({ start: 180, end: 380 });
    expect(() => map.destroy()).not.toThrow();
    expect(container.hasPointerCapture(1)).toBe(false);
    pointer(container, "pointermove", 90);
    dom.flushFrames();
    expect(map.getView()).toEqual(before);
  });

  it("theme change repaints and keeps the blink timer while highlighted", async () => {
    const setInterval = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const { map, container } = setup(10, 5);
    map.addBlocks([0]);
    map.setHighlight(true);
    dom.flushFrames();
    const paintsBefore = dom.puts.length;

    container.style.setProperty(CSS_VAR_HIGHLIGHT, "#0000ff");
    document.documentElement.setAttribute("data-theme", "dark");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    dom.flushFrames();

    expect(dom.puts.length).toBeGreaterThan(paintsBefore);
    expect(setInterval).toHaveBeenCalledTimes(1);
    expect(clearInterval).not.toHaveBeenCalled();
    expect(pixel(dom.puts.at(-1) as ImageDataLike, 1)).toEqual([0, 0, 255, 255]);
    map.destroy();
  });

  it("zooming out at the full view does not report a view change", () => {
    const { map, container, onViewChange } = setup(1000, 100);
    ctrlWheel(container, 100, 50);
    dom.flushFrames();
    expect(onViewChange).not.toHaveBeenCalled();
    expect(map.getView()).toEqual({ start: 0, end: 1000 });
    map.destroy();
  });

  it("meta+wheel zooms like ctrl+wheel and respects the full-view clamp", () => {
    const { map, container, onViewChange } = setup(1000, 100);
    metaWheel(container, 100, 50);
    dom.flushFrames();
    expect(onViewChange).not.toHaveBeenCalled();
    expect(map.getView()).toEqual({ start: 0, end: 1000 });
    map.destroy();
  });

  it("keeps a brush selection in block space across a zoom and a resize", () => {
    const container = dom.mount(800);
    const map = createBlockMap(container, { totalBlocks: 10, brush: true });
    dom.triggerResize(800, container);
    dom.flushFrames();
    map.setBrush([2, 4]);

    const rect = container.querySelector("svg[data-blockmap-brush] .selection") as SVGRectElement;

    // Asserted against the public scale rather than fixed pixels: the point
    // is that the rectangle and the reported blocks never drift apart.
    const expectDrawnAsScaled = (): void => {
      const scale = map.getScale();
      expect(map.getBrush()).toEqual([2, 4]);
      expect(Number(rect.getAttribute("x"))).toBeCloseTo(scale.x(2));
      expect(Number(rect.getAttribute("width"))).toBeCloseTo(scale.x(4) - scale.x(2));
    };

    expectDrawnAsScaled();

    ctrlWheel(container, -100, 400);
    dom.flushFrames();
    expect(map.getView()).not.toEqual({ start: 0, end: 10 });
    expectDrawnAsScaled();

    dom.triggerResize(400, container);
    dom.flushFrames();
    expectDrawnAsScaled();
    map.destroy();
  });

  it("initial ranges with an initial view paint only in-view blocks and count all", () => {
    const container = dom.mount();
    const map = createBlockMap(container, {
      totalBlocks: 100,
      initialRanges: [[0, 60]],
      view: { start: 50, end: 70 },
    });
    dom.triggerResize(10);
    dom.flushFrames();
    const image = dom.puts.at(-1) as ImageDataLike;
    expect(image.width).toBe(20);
    expect(pixel(image, 0)).toEqual(COMPLETE_RGBA);
    expect(pixel(image, 9)).toEqual(COMPLETE_RGBA);
    expect(pixel(image, 10)).toEqual(MISSING_RGBA);
    expect(pixel(image, 19)).toEqual(MISSING_RGBA);
    expect(map.getProgress().completed).toBe(60);
    map.destroy();
  });
});
