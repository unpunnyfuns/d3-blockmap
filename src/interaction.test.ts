import { attachInteraction } from "./interaction";
import type { InteractionDeps } from "./interaction";

const PRIMARY_BUTTON = 0;

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

const fire = (
  target: EventTarget,
  type: string,
  init: Record<string, unknown>,
  props: Record<string, unknown> = {},
) => {
  const Ctor = type === "wheel" ? WheelEvent : MouseEvent;
  const event = new Ctor(type, { bubbles: true, cancelable: true, ...init });
  Object.entries(props).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  target.dispatchEvent(event);
  return event;
};

describe("attachInteraction", () => {
  it("ctrl+wheel zooms around the cursor and prevents default", () => {
    const canvas = document.createElement("canvas");
    const { deps, calls } = createDeps();
    attachInteraction(canvas, deps);
    const event = fire(canvas, "wheel", { deltaY: -100 }, { offsetX: 50, ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(calls).toEqual([{ start: 100, end: 900 }]);
  });

  it("plain wheel is ignored", () => {
    const canvas = document.createElement("canvas");
    const { deps, calls } = createDeps();
    attachInteraction(canvas, deps);
    const event = fire(canvas, "wheel", { deltaY: -100 }, { offsetX: 50 });
    expect(event.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it("drag past the threshold pans and reports start and end", () => {
    const canvas = document.createElement("canvas");
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(canvas, deps);
    fire(canvas, "pointerdown", { button: PRIMARY_BUTTON }, { offsetX: 50, pointerId: 1 });
    fire(canvas, "pointermove", {}, { offsetX: 51, pointerId: 1 });
    expect(deps.onDragStart).not.toHaveBeenCalled();
    fire(canvas, "pointermove", {}, { offsetX: 60, pointerId: 1 });
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toEqual({ start: 90, end: 190 });
    fire(canvas, "pointerup", {}, { pointerId: 1 });
    expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
    expect(canvas.style.cursor).toBe("");
  });

  it("ignores ctrl+wheel while a drag is active", () => {
    const canvas = document.createElement("canvas");
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(canvas, deps);
    fire(canvas, "pointerdown", { button: PRIMARY_BUTTON }, { offsetX: 50, pointerId: 1 });
    fire(canvas, "pointermove", {}, { offsetX: 60, pointerId: 1 });
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    const before = calls.length;
    const event = fire(canvas, "wheel", { deltaY: -100 }, { offsetX: 50, ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(calls.length).toBe(before);
    fire(canvas, "pointerup", {}, { pointerId: 1 });
  });

  it("double click resets and dispose removes listeners", () => {
    const canvas = document.createElement("canvas");
    const { deps, calls } = createDeps();
    const dispose = attachInteraction(canvas, deps);
    fire(canvas, "dblclick", {});
    expect(deps.resetView).toHaveBeenCalledTimes(1);
    dispose();
    fire(canvas, "wheel", { deltaY: -100 }, { offsetX: 50, ctrlKey: true });
    fire(canvas, "dblclick", {});
    expect(calls).toEqual([]);
    expect(deps.resetView).toHaveBeenCalledTimes(1);
  });
});
