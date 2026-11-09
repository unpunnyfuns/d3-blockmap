import { attachInteraction } from "../interaction";
import type { InteractionDeps } from "../interaction";
import { at, ctrlWheel, fire, installPointerCapture, pointer } from "../testing";
import type { InstalledPointerCapture } from "../testing";

const PRIMARY_BUTTON = 0;
const CANVAS_WIDTH_PX = 200;
const CANVAS_HEIGHT_PX = 12;

const mountCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.style.width = `${CANVAS_WIDTH_PX}px`;
  canvas.style.height = `${CANVAS_HEIGHT_PX}px`;
  document.body.append(canvas);
  return canvas;
};

const createDeps = (view = { start: 0, end: 1000 }) => {
  const calls: Array<{ start: number; end: number }> = [];
  const deps: InteractionDeps = {
    getView: () => view,
    setView: (next) => {
      calls.push(next);
      view = next;
    },
    resetView: vi.fn(),
    getBinCount: () => 100,
    getDpr: () => 1,
    getTotalBlocks: () => 1000,
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  };
  return { deps, calls };
};

describe("attachInteraction", () => {
  let canvas: HTMLCanvasElement;
  let pointerCapture: InstalledPointerCapture;

  beforeEach(() => {
    canvas = mountCanvas();
    pointerCapture = installPointerCapture();
  });

  afterEach(() => {
    pointerCapture.restore();
    canvas.remove();
  });

  it("ctrl+wheel zooms around the cursor and prevents default", () => {
    const { deps, calls } = createDeps();
    attachInteraction(canvas, deps);
    const event = ctrlWheel(canvas, -100, 50);
    expect(event.defaultPrevented).toBe(true);
    expect(calls).toEqual([{ start: 100, end: 900 }]);
  });

  it("plain wheel is ignored", () => {
    const { deps, calls } = createDeps();
    attachInteraction(canvas, deps);
    const event = fire(canvas, "wheel", { deltaY: -100, ...at(canvas, 50) });
    expect(event.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it("drag past the threshold pans and reports start and end", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(canvas, deps);
    pointer(canvas, "pointerdown", 50, 1, PRIMARY_BUTTON);
    pointer(canvas, "pointermove", 51);
    expect(deps.onDragStart).not.toHaveBeenCalled();
    pointer(canvas, "pointermove", 60);
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toEqual({ start: 90, end: 190 });
    pointer(canvas, "pointerup", 60);
    expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
    expect(canvas.style.cursor).toBe("");
  });

  it("ignores ctrl+wheel while a drag is active", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(canvas, deps);
    pointer(canvas, "pointerdown", 50, 1, PRIMARY_BUTTON);
    pointer(canvas, "pointermove", 60);
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    const before = calls.length;
    const event = ctrlWheel(canvas, -100, 50);
    expect(event.defaultPrevented).toBe(false);
    expect(calls.length).toBe(before);
    pointer(canvas, "pointerup", 60);
  });

  it("double click resets and dispose removes listeners", () => {
    const { deps, calls } = createDeps();
    const dispose = attachInteraction(canvas, deps);
    fire(canvas, "dblclick", {});
    expect(deps.resetView).toHaveBeenCalledTimes(1);
    dispose();
    ctrlWheel(canvas, -100, 50);
    fire(canvas, "dblclick", {});
    expect(calls).toEqual([]);
    expect(deps.resetView).toHaveBeenCalledTimes(1);
  });
});
