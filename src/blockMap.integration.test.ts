import { createBlockMap } from "./blockMap";
import { COMPLETE_RGBA, HIGHLIGHT_RGBA, ctrlWheel, installDom, pixel, pointer } from "./testing";
import type { InstalledDom } from "./testing";

let dom: InstalledDom;
beforeEach(() => {
  dom = installDom({ deferFrames: true });
});
afterEach(() => {
  dom.restore();
  vi.restoreAllMocks();
});

const setup = (totalBlocks: number, width: number) => {
  const container = dom.mount();
  const onViewChange = vi.fn();
  const map = createBlockMap(container, { totalBlocks, onViewChange });
  dom.triggerResize(width);
  dom.flushFrames();
  const canvas = container.querySelector("canvas") as HTMLCanvasElement;
  return { container, map, canvas, onViewChange };
};

describe("createBlockMap integration", () => {
  it("ignores wheel zoom during a drag and pans from the drag baseline", () => {
    const { map, canvas } = setup(1000, 100);
    pointer(canvas, "pointerdown", 50);
    pointer(canvas, "pointermove", 60);
    dom.flushFrames();
    const afterPan = map.getView();
    ctrlWheel(canvas, -100, 60);
    dom.flushFrames();
    expect(map.getView()).toEqual(afterPan);
    pointer(canvas, "pointermove", 70);
    dom.flushFrames();
    expect(map.getView().end - map.getView().start).toBe(1000);
    pointer(canvas, "pointerup", 70);
    map.destroy();
  });

  it("keeps the view finite and clamped when a resize happens mid-drag", () => {
    const { map, canvas } = setup(1000, 100);
    map.setView({ start: 200, end: 400 });
    dom.flushFrames();
    pointer(canvas, "pointerdown", 50);
    pointer(canvas, "pointermove", 55);
    dom.triggerResize(50);
    pointer(canvas, "pointermove", 60);
    dom.flushFrames();
    const view = map.getView();
    expect(Number.isFinite(view.start) && Number.isFinite(view.end)).toBe(true);
    expect(view.start).toBeGreaterThanOrEqual(0);
    expect(view.end).toBeLessThanOrEqual(1000);
    expect(view.end - view.start).toBe(200);
    pointer(canvas, "pointerup", 60);
    map.destroy();
  });

  it("destroy during a drag is safe and later moves have no effect", () => {
    const { map, canvas } = setup(1000, 100);
    pointer(canvas, "pointerdown", 50);
    pointer(canvas, "pointermove", 60);
    const before = map.getView();
    expect(() => map.destroy()).not.toThrow();
    pointer(canvas, "pointermove", 90);
    dom.flushFrames();
    expect(map.getView()).toEqual(before);
  });

  it("theme change repaints and keeps the blink timer while highlighted", () => {
    const setInterval = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const { map } = setup(10, 5);
    map.addBlocks([0]);
    map.setHighlight(true);
    dom.flushFrames();
    const paintsBefore = dom.puts.length;
    document.documentElement.setAttribute("data-theme", "dark");
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        dom.flushFrames();
        expect(dom.puts.length).toBeGreaterThan(paintsBefore);
        expect(setInterval).toHaveBeenCalledTimes(1);
        expect(clearInterval).not.toHaveBeenCalled();
        expect(pixel(dom.puts.at(-1) as ImageData, 1)).toEqual(HIGHLIGHT_RGBA);
        map.destroy();
        document.documentElement.removeAttribute("data-theme");
        resolve();
      }, 0),
    );
  });

  it("zooming out at the full view does not report a view change", () => {
    const { map, canvas, onViewChange } = setup(1000, 100);
    ctrlWheel(canvas, 100, 50);
    dom.flushFrames();
    expect(onViewChange).not.toHaveBeenCalled();
    expect(map.getView()).toEqual({ start: 0, end: 1000 });
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
    const image = dom.puts.at(-1) as ImageData;
    expect(image.width).toBe(20);
    expect(pixel(image, 0)).toEqual(COMPLETE_RGBA);
    expect(pixel(image, 19)).not.toEqual(COMPLETE_RGBA);
    expect(map.getProgress().completed).toBe(60);
    map.destroy();
  });
});
