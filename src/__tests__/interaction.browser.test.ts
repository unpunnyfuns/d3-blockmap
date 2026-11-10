import { attachInteraction } from "../interaction";
import type { InteractionDeps } from "../interaction";
import { at, ctrlWheel, fire, installPointerCapture, pointer } from "../testing";
import type { InstalledPointerCapture } from "../testing";

const PRIMARY_BUTTON = 0;
const SURFACE_WIDTH_PX = 200;
const SURFACE_HEIGHT_PX = 12;
const FULL = "100%";

// Mirrors the real layout: a relatively positioned container with a canvas
// stretched across it, so the surface and the canvas share a left edge and
// the event helpers' geometry is the same whichever one is dispatched on.
const mountSurface = (): { surface: HTMLElement; canvas: HTMLCanvasElement } => {
  const surface = document.createElement("div");
  Object.assign(surface.style, {
    position: "relative",
    width: `${SURFACE_WIDTH_PX}px`,
    height: `${SURFACE_HEIGHT_PX}px`,
  });
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { display: "block", width: FULL, height: FULL });
  canvas.tabIndex = 0;
  surface.append(canvas);
  document.body.append(surface);
  return { surface, canvas };
};

const createDeps = (view = { start: 0, end: 1000 }, panRequiresShift = false) => {
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
    panRequiresShift: () => panRequiresShift,
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  };
  return { deps, calls };
};

describe("attachInteraction", () => {
  let surface: HTMLElement;
  let canvas: HTMLCanvasElement;
  let pointerCapture: InstalledPointerCapture;

  beforeEach(() => {
    ({ surface, canvas } = mountSurface());
    pointerCapture = installPointerCapture();
  });

  afterEach(() => {
    pointerCapture.restore();
    surface.remove();
  });

  const press = (target: EventTarget, offsetX: number, init: Record<string, unknown> = {}): Event =>
    fire(target, "pointerdown", {
      button: PRIMARY_BUTTON,
      pointerId: 1,
      ...at(canvas, offsetX),
      ...init,
    });

  it("ctrl+wheel zooms around the cursor and prevents default", () => {
    const { deps, calls } = createDeps();
    attachInteraction(surface, canvas, deps);
    const event = ctrlWheel(surface, -100, 50);
    expect(event.defaultPrevented).toBe(true);
    expect(calls).toEqual([{ start: 100, end: 900 }]);
  });

  it("plain wheel is ignored", () => {
    const { deps, calls } = createDeps();
    attachInteraction(surface, canvas, deps);
    const event = fire(surface, "wheel", { deltaY: -100, ...at(canvas, 50) });
    expect(event.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it("drag past the threshold pans and reports start and end", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(surface, canvas, deps);
    pointer(surface, "pointerdown", 50, 1, PRIMARY_BUTTON);
    pointer(surface, "pointermove", 51);
    expect(deps.onDragStart).not.toHaveBeenCalled();
    pointer(surface, "pointermove", 60);
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toEqual({ start: 90, end: 190 });
    expect(surface.style.cursor).toBe("grabbing");
    expect(surface.hasPointerCapture(1)).toBe(true);
    pointer(surface, "pointerup", 60);
    expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
    expect(surface.style.cursor).toBe("");
    expect(surface.hasPointerCapture(1)).toBe(false);
  });

  it("a primary pointerdown focuses the canvas", () => {
    const { deps } = createDeps();
    attachInteraction(surface, canvas, deps);
    expect(document.activeElement).not.toBe(canvas);
    press(surface, 50);
    expect(document.activeElement).toBe(canvas);
  });

  it("a non-primary pointerdown neither focuses nor pans", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(surface, canvas, deps);
    press(surface, 50, { button: 2 });
    expect(document.activeElement).not.toBe(canvas);
    pointer(surface, "pointermove", 60);
    expect(deps.onDragStart).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("events on a child of the surface still pan", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(surface, canvas, deps);
    const overlay = document.createElement("div");
    Object.assign(overlay.style, { position: "absolute", inset: "0", width: FULL, height: FULL });
    surface.append(overlay);

    pointer(overlay, "pointerdown", 50, 1, PRIMARY_BUTTON);
    pointer(overlay, "pointermove", 60);
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toEqual({ start: 90, end: 190 });
    pointer(overlay, "pointerup", 60);
    expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("does not pan without shift when panRequiresShift is true", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 }, true);
    attachInteraction(surface, canvas, deps);
    press(surface, 50);
    pointer(surface, "pointermove", 60);
    expect(deps.onDragStart).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(surface.style.cursor).toBe("");
    pointer(surface, "pointerup", 60);
    expect(deps.onDragEnd).not.toHaveBeenCalled();
  });

  it("pans with shift held when panRequiresShift is true", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 }, true);
    attachInteraction(surface, canvas, deps);
    press(surface, 50, { shiftKey: true });
    pointer(surface, "pointermove", 60);
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toEqual({ start: 90, end: 190 });
    pointer(surface, "pointerup", 60);
    expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("pans a touch drag without shift when panRequiresShift is true", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 }, true);
    attachInteraction(surface, canvas, deps);
    press(surface, 50, { pointerType: "touch" });
    pointer(surface, "pointermove", 60);
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toEqual({ start: 90, end: 190 });
    pointer(surface, "pointerup", 60);
    expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("ignores ctrl+wheel while a drag is active", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(surface, canvas, deps);
    pointer(surface, "pointerdown", 50, 1, PRIMARY_BUTTON);
    pointer(surface, "pointermove", 60);
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    const before = calls.length;
    const event = ctrlWheel(surface, -100, 50);
    expect(event.defaultPrevented).toBe(false);
    expect(calls.length).toBe(before);
    pointer(surface, "pointerup", 60);
  });

  it("double click resets and dispose removes listeners", () => {
    const { deps, calls } = createDeps();
    const dispose = attachInteraction(surface, canvas, deps);
    fire(surface, "dblclick", {});
    expect(deps.resetView).toHaveBeenCalledTimes(1);
    dispose();
    ctrlWheel(surface, -100, 50);
    fire(surface, "dblclick", {});
    expect(calls).toEqual([]);
    expect(deps.resetView).toHaveBeenCalledTimes(1);
  });

  const keydown = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    canvas.dispatchEvent(event);
    return event;
  };

  it("+ zooms in around the view centre and prevents default", () => {
    const { deps, calls } = createDeps({ start: 0, end: 1000 });
    attachInteraction(surface, canvas, deps);
    const event = keydown("+");
    expect(event.defaultPrevented).toBe(true);
    expect(calls).toEqual([{ start: 100, end: 900 }]);
  });

  it("= also zooms in and _ zooms out around the view centre", () => {
    const { deps, calls } = createDeps({ start: 0, end: 1000 });
    attachInteraction(surface, canvas, deps);
    keydown("=");
    expect(calls).toEqual([{ start: 100, end: 900 }]);

    const { deps: outDeps, calls: outCalls } = createDeps({ start: 100, end: 900 });
    attachInteraction(surface, canvas, outDeps);
    keydown("_");
    expect(outCalls).toEqual([{ start: 0, end: 1000 }]);
  });

  it("ArrowRight pans by 10% of the view length", () => {
    const { deps, calls } = createDeps({ start: 200, end: 400 });
    attachInteraction(surface, canvas, deps);
    const event = keydown("ArrowRight");
    expect(event.defaultPrevented).toBe(true);
    expect(calls).toEqual([{ start: 220, end: 420 }]);
  });

  it("Shift+ArrowRight pans by 50% of the view length", () => {
    const { deps, calls } = createDeps({ start: 200, end: 400 });
    attachInteraction(surface, canvas, deps);
    keydown("ArrowRight", { shiftKey: true });
    expect(calls).toEqual([{ start: 300, end: 500 }]);
  });

  it("ArrowLeft pans backward", () => {
    const { deps, calls } = createDeps({ start: 200, end: 400 });
    attachInteraction(surface, canvas, deps);
    keydown("ArrowLeft");
    expect(calls).toEqual([{ start: 180, end: 380 }]);
  });

  it("Home and 0 reset the view", () => {
    const { deps } = createDeps({ start: 200, end: 400 });
    attachInteraction(surface, canvas, deps);
    keydown("Home");
    expect(deps.resetView).toHaveBeenCalledTimes(1);
    keydown("0");
    expect(deps.resetView).toHaveBeenCalledTimes(2);
  });

  it("leaves an unrelated key alone", () => {
    const { deps, calls } = createDeps();
    attachInteraction(surface, canvas, deps);
    const event = keydown("a");
    expect(event.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
    expect(deps.resetView).not.toHaveBeenCalled();
  });

  it("ignores a gesture key held with ctrl, meta or alt", () => {
    const { deps, calls } = createDeps();
    attachInteraction(surface, canvas, deps);

    const ctrlMinus = keydown("-", { ctrlKey: true });
    expect(ctrlMinus.defaultPrevented).toBe(false);

    const metaEquals = keydown("=", { metaKey: true });
    expect(metaEquals.defaultPrevented).toBe(false);

    const altArrowRight = keydown("ArrowRight", { altKey: true });
    expect(altArrowRight.defaultPrevented).toBe(false);

    expect(calls).toEqual([]);
    expect(deps.resetView).not.toHaveBeenCalled();
  });

  it("ignores a key while a drag is active", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(surface, canvas, deps);
    pointer(surface, "pointerdown", 50, 1, PRIMARY_BUTTON);
    pointer(surface, "pointermove", 60);
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);

    const before = calls.length;
    const event = keydown("+");
    expect(event.defaultPrevented).toBe(false);
    expect(calls.length).toBe(before);

    pointer(surface, "pointerup", 60);
  });

  it("dispose removes the keydown listener", () => {
    const { deps, calls } = createDeps();
    const dispose = attachInteraction(surface, canvas, deps);
    dispose();
    const event = keydown("+");
    expect(event.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });
  describe("pinch", () => {
    const touch = (type: string, offsetX: number, pointerId: number): Event =>
      fire(surface, type, {
        button: PRIMARY_BUTTON,
        pointerId,
        pointerType: "touch",
        ...at(canvas, offsetX),
      });

    const startPinch = (x1: number, x2: number): void => {
      touch("pointerdown", x1, 1);
      touch("pointerdown", x2, 2);
    };

    // The fake deps map css pixels to blocks as px / binCount * viewLength,
    // so this is the block the deps would place under the given offset.
    const blockAt = (view: { start: number; end: number }, offsetX: number): number =>
      view.start + (offsetX / 100) * (view.end - view.start);

    it("spreading zooms in and keeps the anchor block under the midpoint", () => {
      const { deps, calls } = createDeps({ start: 0, end: 1000 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      expect(deps.onDragStart).toHaveBeenCalledTimes(1);
      expect(surface.hasPointerCapture(1)).toBe(true);
      expect(surface.hasPointerCapture(2)).toBe(true);

      touch("pointermove", 20, 1);
      touch("pointermove", 100, 2);

      const view = calls.at(-1);
      expect(view).toEqual({ start: 350, end: 600 });
      const column = ((view?.end ?? 0) - (view?.start ?? 0)) / 100;
      expect(Math.abs(blockAt(view ?? { start: 0, end: 0 }, 60) - 500)).toBeLessThanOrEqual(column);
    });

    it("pinching in zooms out and clamps at the full view", () => {
      const { deps, calls } = createDeps({ start: 250, end: 750 });
      attachInteraction(surface, canvas, deps);
      startPinch(30, 70);
      touch("pointermove", 45, 1);
      touch("pointermove", 55, 2);
      expect(calls.at(-1)).toEqual({ start: 0, end: 1000 });
    });

    it("moving both fingers together pans", () => {
      const { deps, calls } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      touch("pointermove", 50, 1);
      touch("pointermove", 70, 2);
      expect(calls.at(-1)).toEqual({ start: 380, end: 580 });
    });

    it("a second finger ends a single-finger pan before the pinch starts", () => {
      const { deps, calls } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      const order: string[] = [];
      vi.mocked(deps.onDragStart).mockImplementation(() => order.push("start"));
      vi.mocked(deps.onDragEnd).mockImplementation(() => order.push("end"));

      touch("pointerdown", 40, 1);
      touch("pointermove", 50, 1);
      expect(calls.at(-1)).toEqual({ start: 380, end: 580 });
      expect(surface.style.cursor).toBe("grabbing");

      touch("pointerdown", 70, 2);
      expect(order).toEqual(["start", "end", "start"]);
      expect(surface.style.cursor).toBe("");
      expect(surface.hasPointerCapture(1)).toBe(true);
      expect(surface.hasPointerCapture(2)).toBe(true);

      touch("pointermove", 40, 1);
      const zoomed = calls.at(-1) ?? { start: 0, end: 0 };
      expect(zoomed.end - zoomed.start).toBeLessThan(200);
    });

    it("lifting one finger ends the pinch and the other finger does nothing", () => {
      const { deps, calls } = createDeps({ start: 0, end: 1000 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      touch("pointermove", 30, 1);
      touch("pointerup", 30, 1);
      expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
      expect(surface.hasPointerCapture(1)).toBe(false);
      expect(surface.hasPointerCapture(2)).toBe(true);

      const before = calls.length;
      touch("pointermove", 90, 2);
      touch("pointermove", 10, 2);
      expect(calls.length).toBe(before);
      touch("pointerup", 10, 2);
      expect(surface.hasPointerCapture(2)).toBe(false);
      expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
      expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    });

    it("pointercancel ends the pinch", () => {
      const { deps, calls } = createDeps({ start: 0, end: 1000 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      touch("pointercancel", 60, 2);
      expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
      expect(surface.hasPointerCapture(2)).toBe(false);
      expect(surface.hasPointerCapture(1)).toBe(true);
      touch("pointermove", 10, 1);
      expect(calls).toEqual([]);
    });

    it("ignores a third touch pointer", () => {
      const { deps, calls } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      touch("pointerdown", 80, 3);
      touch("pointermove", 90, 3);
      expect(calls).toEqual([]);
      touch("pointerup", 90, 3);
      expect(deps.onDragEnd).not.toHaveBeenCalled();
      touch("pointermove", 50, 1);
      touch("pointermove", 70, 2);
      expect(calls.at(-1)).toEqual({ start: 380, end: 580 });
    });

    it("ignores ctrl+wheel and keys while a pinch is active", () => {
      const { deps, calls } = createDeps({ start: 0, end: 1000 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      expect(ctrlWheel(surface, -100, 50).defaultPrevented).toBe(false);
      const key = new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true });
      canvas.dispatchEvent(key);
      expect(key.defaultPrevented).toBe(false);
      expect(calls).toEqual([]);
    });

    it("destroy mid-pinch releases capture and ends the gesture", () => {
      const { deps, calls } = createDeps({ start: 0, end: 1000 });
      const dispose = attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      dispose();
      expect(surface.hasPointerCapture(1)).toBe(false);
      expect(surface.hasPointerCapture(2)).toBe(false);
      expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
      touch("pointermove", 10, 1);
      expect(calls).toEqual([]);
    });

    it("two touch pointers during a mouse drag neither pinch nor take over the drag", () => {
      const { deps, calls } = createDeps({ start: 100, end: 200 });
      attachInteraction(surface, canvas, deps);
      pointer(surface, "pointerdown", 50, 1, PRIMARY_BUTTON);
      pointer(surface, "pointermove", 60);
      expect(calls.at(-1)).toEqual({ start: 90, end: 190 });

      touch("pointerdown", 80, 2);
      touch("pointerdown", 90, 3);
      touch("pointermove", 20, 2);
      touch("pointermove", 150, 3);
      expect(calls.at(-1)).toEqual({ start: 90, end: 190 });
      expect(deps.onDragStart).toHaveBeenCalledTimes(1);
      touch("pointerup", 150, 3);
      touch("pointerup", 20, 2);
      expect(deps.onDragEnd).not.toHaveBeenCalled();
      expect(surface.style.cursor).toBe("grabbing");

      pointer(surface, "pointermove", 70);
      expect(calls.at(-1)).toEqual({ start: 80, end: 180 });
      pointer(surface, "pointerup", 70);
      expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
      expect(surface.style.cursor).toBe("");
      expect(surface.hasPointerCapture(1)).toBe(false);
    });

    it("ignores a mouse press during a pinch, so hover afterwards does not pan", () => {
      const { deps, calls } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      fire(surface, "pointerdown", {
        button: PRIMARY_BUTTON,
        pointerId: 9,
        pointerType: "mouse",
        ...at(canvas, 50),
      });
      fire(surface, "pointerup", { pointerId: 9, pointerType: "mouse", ...at(canvas, 50) });
      touch("pointerup", 40, 1);
      expect(deps.onDragEnd).toHaveBeenCalledTimes(1);

      const before = calls.length;
      fire(surface, "pointermove", { pointerId: 9, pointerType: "mouse", ...at(canvas, 90) });
      touch("pointerup", 60, 2);
      fire(surface, "pointermove", { pointerId: 9, pointerType: "mouse", ...at(canvas, 10) });
      expect(calls.length).toBe(before);
      expect(deps.onDragStart).toHaveBeenCalledTimes(1);
      expect(surface.style.cursor).toBe("");
    });

    it("a finger left down after a pinch does not pair with a new finger", () => {
      const { deps, calls } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      touch("pointerup", 40, 1);
      expect(deps.onDragStart).toHaveBeenCalledTimes(1);

      touch("pointerdown", 20, 3);
      touch("pointermove", 90, 3);
      touch("pointermove", 10, 2);
      expect(calls).toEqual([]);
      expect(deps.onDragStart).toHaveBeenCalledTimes(1);

      touch("pointerup", 90, 3);
      touch("pointerup", 10, 2);
      startPinch(40, 60);
      expect(deps.onDragStart).toHaveBeenCalledTimes(2);
      touch("pointermove", 50, 1);
      touch("pointermove", 70, 2);
      expect(calls.at(-1)).toEqual({ start: 380, end: 580 });
    });
    it("a mouse press during an active touch drag changes nothing", () => {
      const { deps, calls } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      touch("pointerdown", 40, 1);
      touch("pointermove", 50, 1);
      expect(calls.at(-1)).toEqual({ start: 380, end: 580 });

      fire(surface, "pointerdown", {
        button: PRIMARY_BUTTON,
        buttons: 1,
        pointerId: 9,
        pointerType: "mouse",
        ...at(canvas, 10),
      });
      fire(surface, "pointerup", { pointerId: 9, pointerType: "mouse", ...at(canvas, 10) });
      expect(surface.style.cursor).toBe("grabbing");

      touch("pointermove", 60, 1);
      expect(calls.at(-1)).toEqual({ start: 360, end: 560 });
      touch("pointerup", 60, 1);
      expect(deps.onDragStart).toHaveBeenCalledTimes(1);
      expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
      expect(surface.style.cursor).toBe("");
    });

    it("a touch press replaces a mouse drag still under the threshold", () => {
      const { deps, calls } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      pointer(surface, "pointerdown", 50, 9, PRIMARY_BUTTON);
      touch("pointerdown", 40, 1);
      touch("pointermove", 50, 1);
      expect(calls.at(-1)).toEqual({ start: 380, end: 580 });
      expect(deps.onDragStart).toHaveBeenCalledTimes(1);
      touch("pointerup", 50, 1);
      expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
    });

    it("keeps capture on the finger left down after a pinch", () => {
      const { deps } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      touch("pointerup", 40, 1);
      expect(surface.hasPointerCapture(1)).toBe(false);
      expect(surface.hasPointerCapture(2)).toBe(true);
    });

    it("a lost capture forgets the spent finger, so a new pinch works", () => {
      const { deps, calls } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      touch("pointerup", 40, 1);
      fire(surface, "lostpointercapture", { pointerId: 2, pointerType: "touch" });

      touch("pointerdown", 40, 3);
      touch("pointerdown", 60, 4);
      expect(deps.onDragStart).toHaveBeenCalledTimes(2);
      touch("pointermove", 50, 3);
      touch("pointermove", 70, 4);
      expect(calls.at(-1)).toEqual({ start: 380, end: 580 });
    });

    it("ignores a lost capture that bubbles up from a child", () => {
      const { deps, calls } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      touch("pointerdown", 40, 1);
      touch("pointermove", 50, 1);
      fire(canvas, "lostpointercapture", { pointerId: 1, pointerType: "touch" });
      expect(deps.onDragEnd).not.toHaveBeenCalled();
      touch("pointermove", 60, 1);
      expect(calls.at(-1)).toEqual({ start: 360, end: 560 });
    });

    it("a lost capture ends an active drag once", () => {
      const { deps } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      touch("pointerdown", 40, 1);
      touch("pointermove", 50, 1);
      fire(surface, "lostpointercapture", { pointerId: 1, pointerType: "touch" });
      expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
      expect(surface.style.cursor).toBe("");
      touch("pointerup", 50, 1);
      expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
    });

    it("a primary touch press starts cleanly over a stale spent finger", () => {
      const { deps, calls } = createDeps({ start: 400, end: 600 });
      attachInteraction(surface, canvas, deps);
      startPinch(40, 60);
      touch("pointerup", 40, 1);

      fire(surface, "pointerdown", {
        button: PRIMARY_BUTTON,
        pointerId: 5,
        pointerType: "touch",
        isPrimary: true,
        ...at(canvas, 40),
      });
      touch("pointermove", 50, 5);
      expect(calls.at(-1)).toEqual({ start: 380, end: 580 });
      expect(deps.onDragStart).toHaveBeenCalledTimes(2);
      expect(surface.hasPointerCapture(2)).toBe(false);
    });
  });

  it("a mouse move with no button held ends a drag instead of panning", () => {
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(surface, canvas, deps);
    pointer(surface, "pointerdown", 50, 1, PRIMARY_BUTTON);
    fire(surface, "pointermove", { pointerId: 1, buttons: 0, ...at(canvas, 60) });
    fire(surface, "pointermove", { pointerId: 1, buttons: 1, ...at(canvas, 70) });
    expect(calls).toEqual([]);
    expect(deps.onDragStart).not.toHaveBeenCalled();
  });
});
