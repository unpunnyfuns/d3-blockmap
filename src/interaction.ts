/**
 * Translates pointer and wheel gestures on the canvas into view changes:
 * ctrl/meta-wheel zooms, drag pans, double click resets. It computes the new
 * view with the pure helpers in view.ts and hands it to deps.setView; it
 * never touches state, pixels or the tooltip directly.
 */

import { DRAG_THRESHOLD_PX, ZOOM_STEP } from "./constants";
import { panView, viewLength, zoomView } from "./view";
import type { BlockView } from "./view";

export type InteractionDeps = {
  getView(): BlockView;
  setView(view: BlockView): void;
  resetView(): void;
  getBinCount(): number;
  getDpr(): number;
  getTotalBlocks(): number;
  onDragStart(): void;
  onDragEnd(): void;
};

const PRIMARY_BUTTON = 0;
const GRABBING = "grabbing";
const NO_POINTER = -1;

/**
 * The view as it was at pointerdown, plus where the pointer went down.
 * `active` flips once the pointer has moved past the drag threshold, which is
 * what separates a pan from a click or a double click.
 */
type DragState = { downX: number; view: BlockView; pointerId: number; active: boolean };

export const attachInteraction = (
  canvas: HTMLCanvasElement,
  deps: InteractionDeps,
): (() => void) => {
  let drag: DragState | undefined;

  // CSS pixels to blocks: scale to device pixels (one per column), take that
  // as a fraction of the columns across, and spend it over the view length.
  const columnsToBlocks = (px: number, view: BlockView): number =>
    ((px * deps.getDpr()) / deps.getBinCount()) * viewLength(view);

  /**
   * Requiring ctrl/meta leaves plain wheel events to scroll the page and
   * matches the trackpad pinch gesture, which browsers report as ctrl+wheel.
   * preventDefault - which needs a non-passive listener - stops the browser
   * applying its own page zoom on top. Scrolling down zooms out.
   */
  const onWheel = (event: WheelEvent): void => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (drag?.active) return;
    if (deps.getBinCount() === 0) return;
    event.preventDefault();

    const view = deps.getView();
    const anchor = view.start + columnsToBlocks(event.offsetX, view);
    const factor = event.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    deps.setView(zoomView(view, anchor, factor, deps.getTotalBlocks()));
  };

  // Records the baseline but claims nothing yet: a press that never moves must
  // still reach dblclick and leave the cursor alone.
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== PRIMARY_BUTTON) return;

    drag = {
      downX: event.offsetX,
      view: deps.getView(),
      pointerId: event.pointerId ?? NO_POINTER,
      active: false,
    };
  };

  /**
   * Panning is always computed from the pointerdown baseline and the total
   * travel, never incrementally from the last frame, so rounding cannot make
   * a slow drag creep. Capture is taken on the first real movement so the
   * gesture survives the pointer leaving the canvas, and the delta is negated
   * because dragging right moves the content right, i.e. the view left.
   */
  const onPointerMove = (event: PointerEvent): void => {
    if (!drag) return;

    const dx = event.offsetX - drag.downX;
    if (!drag.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      if (typeof canvas.setPointerCapture === "function" && drag.pointerId !== NO_POINTER) {
        canvas.setPointerCapture(drag.pointerId);
      }
      canvas.style.cursor = GRABBING;
      deps.onDragStart();
    }

    if (deps.getBinCount() === 0) return;
    deps.setView(panView(drag.view, -columnsToBlocks(dx, drag.view), deps.getTotalBlocks()));
  };

  // Only a drag that became active took capture and changed the cursor, so
  // only that one has anything to undo. The optional-call guards cover
  // environments and test doubles without the pointer capture API.
  const endDrag = (): void => {
    if (!drag) return;

    if (drag.active) {
      const hasCapture =
        drag.pointerId !== NO_POINTER && (canvas.hasPointerCapture?.(drag.pointerId) ?? true);
      if (typeof canvas.releasePointerCapture === "function" && hasCapture) {
        canvas.releasePointerCapture(drag.pointerId);
      }
      canvas.style.cursor = "";
      deps.onDragEnd();
    }

    drag = undefined;
  };

  const onDblClick = (): void => deps.resetView();

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("dblclick", onDblClick);

  // Teardown ends any drag in flight first, so capture and the grabbing
  // cursor are released even if the map is destroyed mid-gesture.
  return () => {
    endDrag();
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", endDrag);
    canvas.removeEventListener("pointercancel", endDrag);
    canvas.removeEventListener("dblclick", onDblClick);
  };
};
