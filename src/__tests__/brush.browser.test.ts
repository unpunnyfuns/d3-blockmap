import { select } from "d3-selection";
import { createBrushOverlay } from "../brush";
import type { BlockRange } from "../ranges";
import type { BlockView } from "../view";

const WIDTH = 800;
const HEIGHT = 40;
const TOTAL = 10;

type Harness = {
  container: HTMLElement;
  overlay: ReturnType<typeof createBrushOverlay>;
  onBrush: ReturnType<typeof vi.fn>;
  onBrushEnd: ReturnType<typeof vi.fn>;
  setView(next: BlockView): void;
  cleanup(): void;
};

const mount = (totalBlocks = TOTAL): Harness => {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${WIDTH}px`,
    height: `${HEIGHT}px`,
  });
  document.body.append(container);

  let view: BlockView = { start: 0, end: TOTAL };
  const onBrush = vi.fn();
  const onBrushEnd = vi.fn();

  const overlay = createBrushOverlay(container, {
    getView: () => view,
    getWidth: () => WIDTH,
    getHeight: () => HEIGHT,
    getTotalBlocks: () => totalBlocks,
    onBrush: (selection: BlockRange | null) => onBrush(selection),
    onBrushEnd: (selection: BlockRange | null) => onBrushEnd(selection),
  });

  return {
    container,
    overlay,
    onBrush,
    onBrushEnd,
    setView: (next) => {
      view = next;
    },
    cleanup: () => {
      overlay.destroy();
      container.remove();
    },
  };
};

const svgOf = (container: HTMLElement): SVGSVGElement =>
  container.querySelector("svg[data-blockmap-brush]") as SVGSVGElement;

const selectionRect = (container: HTMLElement): SVGRectElement =>
  svgOf(container).querySelector(".selection") as SVGRectElement;

// The overlay covers the container exactly, so container geometry gives the
// same client coordinates and still works once the svg has been removed.
const mouseInit = (container: HTMLElement, x: number): MouseEventInit => {
  const rect = container.getBoundingClientRect();
  return { clientX: rect.left + x, clientY: rect.top + HEIGHT / 2, bubbles: true, view: window };
};

// d3-brush listens for mousedown on its group - the overlay rect is the
// bubbling target it reads a datum from - and for move/up on event.view.
const press = (container: HTMLElement, x: number, extra: MouseEventInit = {}): void => {
  const overlay = svgOf(container).querySelector(".overlay") as SVGRectElement;
  overlay.dispatchEvent(new MouseEvent("mousedown", { ...mouseInit(container, x), ...extra }));
};

const moveTo = (container: HTMLElement, x: number): void => {
  window.dispatchEvent(new MouseEvent("mousemove", mouseInit(container, x)));
};

const release = (container: HTMLElement, x: number): void => {
  window.dispatchEvent(new MouseEvent("mouseup", mouseInit(container, x)));
};

const drag = (container: HTMLElement, fromX: number, toX: number): void => {
  press(container, fromX);
  moveTo(container, toX);
  release(container, toX);
};

// d3-selection records every listener it adds on the node itself, which is
// how a gesture's window listeners can be observed from outside d3.
type WithD3Listeners = { __on?: { type: string; name: string }[] };

// click.drag is left out: d3-drag adds it on release and clears it on its own
// timer, so an earlier test's gesture can still be holding one.
const GESTURE_LISTENERS = [
  "mousemove.brush",
  "mouseup.brush",
  "keydown.brush",
  "keyup.brush",
  "dragstart.drag",
  "selectstart.drag",
];

const gestureListeners = (): string[] =>
  ((window as unknown as WithD3Listeners).__on ?? [])
    .map((entry) => `${entry.type}.${entry.name}`)
    .filter((name) => GESTURE_LISTENERS.includes(name));

// Errors thrown inside a listener do not propagate to dispatchEvent, so they
// are collected rather than asserted on directly.
const collectErrors = (): { errors: string[]; stop(): void } => {
  const errors: string[] = [];
  const onError = (event: ErrorEvent): void => {
    errors.push(event.message);
  };
  window.addEventListener("error", onError);
  return {
    errors,
    stop: () => {
      window.removeEventListener("error", onError);
    },
  };
};

describe("createBrushOverlay", () => {
  it("appends an svg overlay carrying the brush data attribute", () => {
    const harness = mount();
    const svg = svgOf(harness.container);
    expect(svg).not.toBeNull();
    expect(svg.style.position).toBe("absolute");
    expect(svg.style.touchAction).toBe("none");
    expect(svg.querySelector(".overlay")).not.toBeNull();
    harness.cleanup();
  });

  it("sets position: relative on a static container, same as the axis", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const overlay = createBrushOverlay(container, {
      getView: () => ({ start: 0, end: TOTAL }),
      getWidth: () => WIDTH,
      getHeight: () => HEIGHT,
      getTotalBlocks: () => TOTAL,
      onBrush: () => {},
      onBrushEnd: () => {},
    });
    expect(container.style.position).toBe("relative");
    overlay.destroy();
    container.remove();
  });

  it("projects a selection onto the view in pixels", () => {
    const harness = mount();
    harness.overlay.setSelection([2, 5]);
    const rect = selectionRect(harness.container);
    expect(rect.getAttribute("x")).toBe("160");
    expect(rect.getAttribute("width")).toBe("240");
    harness.cleanup();
  });

  it("paints the selection with the themed colour", () => {
    const harness = mount();
    harness.overlay.setColor("#ff00ff");
    harness.overlay.setSelection([2, 5]);
    const rect = selectionRect(harness.container);
    expect(rect.getAttribute("fill")).toBe("#ff00ff");
    expect(rect.getAttribute("stroke")).toBe("#ff00ff");
    expect(rect.getAttribute("fill-opacity")).toBe("0.3");
    harness.cleanup();
  });

  it("returns a copy of the selection", () => {
    const harness = mount();
    harness.overlay.setSelection([2, 5]);
    expect(harness.overlay.getSelection()).toEqual([2, 5]);
    expect(harness.overlay.getSelection()).not.toBe(harness.overlay.getSelection());
    harness.cleanup();
  });

  it("treats a zero-length selection as none", () => {
    const harness = mount();
    harness.overlay.setSelection([5, 5]);
    expect(harness.overlay.getSelection()).toBeNull();
    expect(selectionRect(harness.container).style.display).toBe("none");
    harness.cleanup();
  });

  it("clamps a selection to the block count", () => {
    const harness = mount();
    harness.overlay.setSelection([-4, 40]);
    expect(harness.overlay.getSelection()).toEqual([0, 10]);
    harness.cleanup();
  });

  it("clears the selection", () => {
    const harness = mount();
    harness.overlay.setSelection([2, 5]);
    harness.overlay.setSelection(null);
    expect(harness.overlay.getSelection()).toBeNull();
    expect(selectionRect(harness.container).style.display).toBe("none");
    harness.cleanup();
  });

  it("re-projects the stored blocks after a view change", () => {
    const harness = mount();
    harness.overlay.setSelection([2, 5]);
    harness.setView({ start: 0, end: 5 });
    harness.overlay.update();
    const rect = selectionRect(harness.container);
    expect(rect.getAttribute("x")).toBe("320");
    expect(rect.getAttribute("width")).toBe("480");
    expect(harness.overlay.getSelection()).toEqual([2, 5]);
    harness.cleanup();
  });

  it("hides a selection scrolled out of the view", () => {
    const harness = mount();
    harness.overlay.setSelection([2, 5]);
    harness.setView({ start: 6, end: 10 });
    harness.overlay.update();
    expect(selectionRect(harness.container).style.display).toBe("none");
    expect(harness.overlay.getSelection()).toEqual([2, 5]);
    harness.cleanup();
  });

  it("reports snapped blocks while dragging and on release", () => {
    const harness = mount();
    drag(harness.container, 160, 400);
    expect(harness.onBrush).toHaveBeenCalledWith([2, 5]);
    expect(harness.onBrushEnd).toHaveBeenCalledTimes(1);
    expect(harness.onBrushEnd).toHaveBeenCalledWith([2, 5]);
    expect(harness.onBrush.mock.invocationCallOrder[0]).toBeLessThan(
      harness.onBrushEnd.mock.invocationCallOrder[0],
    );
    expect(harness.overlay.getSelection()).toEqual([2, 5]);
    harness.cleanup();
  });

  it("snaps the drawn rectangle to block boundaries on release", () => {
    const harness = mount();
    drag(harness.container, 167, 391);
    expect(harness.onBrushEnd).toHaveBeenCalledWith([2, 5]);
    const rect = selectionRect(harness.container);
    expect(rect.getAttribute("x")).toBe("160");
    expect(rect.getAttribute("width")).toBe("240");
    harness.cleanup();
  });

  it("reports nothing from a drag when the map has no blocks to select", () => {
    const harness = mount(0);
    drag(harness.container, 160, 400);
    expect(harness.onBrushEnd).not.toHaveBeenCalled();
    expect(harness.overlay.getSelection()).toBeNull();
    harness.cleanup();
  });

  it("clears the selection on a click without movement", () => {
    const harness = mount();
    harness.overlay.setSelection([2, 5]);
    drag(harness.container, 400, 400);
    expect(harness.onBrushEnd).toHaveBeenCalledTimes(1);
    expect(harness.onBrushEnd).toHaveBeenCalledWith(null);
    expect(harness.overlay.getSelection()).toBeNull();
    harness.cleanup();
  });

  it("reports nothing for a click that neither moved nor changed anything", () => {
    const harness = mount();
    drag(harness.container, 400, 400);
    expect(harness.onBrush).not.toHaveBeenCalled();
    expect(harness.onBrushEnd).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("reports nothing for a press inside the selection that left it unchanged", () => {
    const harness = mount();
    harness.overlay.setSelection([2, 5]);
    const selectionRect = svgOf(harness.container).querySelector(".selection") as SVGRectElement;
    selectionRect.dispatchEvent(new MouseEvent("mousedown", mouseInit(harness.container, 300)));
    release(harness.container, 300);
    expect(harness.onBrushEnd).not.toHaveBeenCalled();
    expect(harness.overlay.getSelection()).toEqual([2, 5]);
    harness.cleanup();
  });

  it("reports nothing for a drag that ends on the selection it started with", () => {
    const harness = mount();
    drag(harness.container, 160, 400);
    harness.onBrushEnd.mockClear();
    const selectionRect = svgOf(harness.container).querySelector(".selection") as SVGRectElement;
    selectionRect.dispatchEvent(new MouseEvent("mousedown", mouseInit(harness.container, 300)));
    moveTo(harness.container, 340);
    moveTo(harness.container, 300);
    release(harness.container, 300);
    expect(harness.onBrushEnd).not.toHaveBeenCalled();
    expect(harness.overlay.getSelection()).toEqual([2, 5]);
    harness.cleanup();
  });

  it("reports nothing for either half of a double click", () => {
    const harness = mount();
    drag(harness.container, 400, 400);
    drag(harness.container, 400, 400);
    expect(harness.onBrushEnd).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("prevents the mousedown default so focus stays on the canvas", () => {
    const harness = mount();
    const overlay = svgOf(harness.container).querySelector(".overlay") as SVGRectElement;
    const event = new MouseEvent("mousedown", {
      ...mouseInit(harness.container, 400),
      cancelable: true,
    });
    overlay.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    release(harness.container, 400);
    harness.cleanup();
  });

  it("declines touch so a touch drag reaches the map's own pan", () => {
    const harness = mount();
    const group = svgOf(harness.container).querySelector("g") as SVGGElement;
    const names = ((group as unknown as WithD3Listeners).__on ?? []).map(
      (entry) => `${entry.type}.${entry.name}`,
    );
    expect(names).toContain("mousedown.brush");
    expect(names.some((name) => name.startsWith("touch"))).toBe(false);
    harness.cleanup();
  });

  const declined: [string, MouseEventInit][] = [
    ["ctrl held", { ctrlKey: true }],
    ["meta held", { metaKey: true }],
    ["shift held", { shiftKey: true }],
    ["a secondary button", { button: 2 }],
  ];

  it.each(declined)("ignores a drag with %s", (_label, extra) => {
    const harness = mount();
    press(harness.container, 160, extra);
    moveTo(harness.container, 400);
    release(harness.container, 400);
    expect(harness.onBrush).not.toHaveBeenCalled();
    expect(harness.onBrushEnd).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("fires no callbacks for a programmatic selection", () => {
    const harness = mount();
    harness.overlay.setSelection([2, 5]);
    harness.overlay.update();
    harness.overlay.setSelection(null);
    expect(harness.onBrush).not.toHaveBeenCalled();
    expect(harness.onBrushEnd).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it("tears down d3's window listeners when destroyed mid-gesture", () => {
    const harness = mount();
    const watcher = collectErrors();
    press(harness.container, 160);
    moveTo(harness.container, 300);
    expect(gestureListeners()).toContain("mousemove.brush");

    harness.overlay.destroy();
    expect(gestureListeners()).toEqual([]);

    moveTo(harness.container, 400);
    release(harness.container, 400);
    watcher.stop();

    expect(watcher.errors).toEqual([]);
    expect(harness.onBrushEnd).not.toHaveBeenCalled();
    expect(harness.container.querySelector("svg[data-blockmap-brush]")).toBeNull();
    harness.container.remove();
  });

  it("leaves foreign window listeners alone when destroyed between gestures", () => {
    const harness = mount();
    const foreign = vi.fn();
    select(window).on("mouseup.brush", foreign);

    harness.cleanup();

    expect(gestureListeners()).toContain("mouseup.brush");
    select(window).on("mouseup.brush", null);
    expect(gestureListeners()).toEqual([]);
  });

  it("removes the overlay and stops listening on destroy", () => {
    const harness = mount();
    const svg = svgOf(harness.container);
    harness.overlay.destroy();
    expect(harness.container.querySelector("svg[data-blockmap-brush]")).toBeNull();

    // Re-attached only so a gesture has live geometry to measure against,
    // which is what proves the brush listeners themselves are gone.
    harness.container.append(svg);
    drag(harness.container, 160, 400);
    expect(harness.onBrush).not.toHaveBeenCalled();
    expect(harness.onBrushEnd).not.toHaveBeenCalled();
    harness.container.remove();
  });
});
