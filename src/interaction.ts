/**
 * Translates pointer, wheel and keyboard input into view changes:
 * ctrl/meta-wheel zooms, drag pans, double click resets, and the keys below
 * mirror those gestures for anyone who can't use a pointer. Pointer, wheel
 * and dblclick listeners sit on the surface - the container - rather than
 * the canvas, so an overlay stacked above the canvas (the brush) cannot
 * swallow them; keydown stays on the canvas because that is the focusable
 * element. Positions therefore come from clientX minus the canvas rect
 * instead of offsetX, which would be relative to whichever child the event
 * happened to hit. It computes the new view with the pure helpers in view.ts
 * and hands it to deps.setView; it never touches state, pixels or the
 * tooltip directly.
 */

import { DRAG_THRESHOLD_PX, KEY_PAN_FRACTION, KEY_PAN_FRACTION_FAST, ZOOM_STEP } from "./constants";
import { panView, viewLength, zoomView } from "./view";
import type { BlockView } from "./view";

export type InteractionDeps = {
  getView(): BlockView;
  setView(view: BlockView): void;
  resetView(): void;
  getBinCount(): number;
  getDpr(): number;
  getTotalBlocks(): number;
  // True while another gesture owns the plain drag - the brush - so a mouse
  // or pen pan only happens with Shift held.
  panRequiresShift(): boolean;
  onDragStart(): void;
  onDragEnd(): void;
};

const PRIMARY_BUTTON = 0;
const TOUCH_POINTER = "touch";
const GRABBING = "grabbing";
const NO_POINTER = -1;
const HALF = 2;

// `=` and `_` are the unshifted/shifted neighbours of `+` and `-` on a US
// keyboard layout, so both read as the same gesture without requiring Shift.
const ZOOM_IN_KEYS = new Set(["+", "="]);
const ZOOM_OUT_KEYS = new Set(["-", "_"]);
const RESET_KEYS = new Set(["0", "Home"]);

/**
 * The view as it was at pointerdown, plus where the pointer went down.
 * `active` flips once the pointer has moved past the drag threshold, which is
 * what separates a pan from a click or a double click.
 */
type DragState = { downX: number; view: BlockView; pointerId: number; active: boolean };

export const attachInteraction = (
  surface: HTMLElement,
  canvas: HTMLCanvasElement,
  deps: InteractionDeps,
): (() => void) => {
  let drag: DragState | undefined;

  // The canvas rect, not the surface rect, is the coordinate frame the
  // renderer paints in, and it is read per event because scrolling or a
  // layout change moves it without any resize the map hears about.
  const surfaceX = (event: { clientX: number }): number =>
    event.clientX - canvas.getBoundingClientRect().left;

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
    const anchor = view.start + columnsToBlocks(surfaceX(event), view);
    const factor = event.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    deps.setView(zoomView(view, anchor, factor, deps.getTotalBlocks()));
  };

  /**
   * Records the baseline but claims nothing yet: a press that never moves
   * must still reach dblclick and leave the cursor alone. Focus moves to the
   * canvas on every primary press, before the shift check, so the keyboard
   * gestures stay reachable even when the press belongs to another gesture;
   * preventScroll keeps a map below the fold from jumping into view. The
   * guard covers test doubles and elements without the focus API.
   */
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== PRIMARY_BUTTON) return;

    if (document.activeElement !== canvas && typeof canvas.focus === "function") {
      canvas.focus({ preventScroll: true });
    }

    // The brush only claims mouse and pen drags, so a touch drag is the only
    // pan a touch user has and never needs the modifier they cannot hold.
    if (deps.panRequiresShift() && event.pointerType !== TOUCH_POINTER && !event.shiftKey) return;

    drag = {
      downX: surfaceX(event),
      view: deps.getView(),
      pointerId: event.pointerId ?? NO_POINTER,
      active: false,
    };
  };

  /**
   * Panning is always computed from the pointerdown baseline and the total
   * travel, never incrementally from the last frame, so rounding cannot make
   * a slow drag creep. Capture is taken on the first real movement so the
   * gesture survives the pointer leaving the surface, and the delta is
   * negated because dragging right moves the content right, i.e. the view
   * left. Capture and the cursor go on the surface because that is the
   * element the listeners are on; capturing the canvas would retarget the
   * remaining events to an element that never hears them.
   */
  const onPointerMove = (event: PointerEvent): void => {
    if (!drag) return;

    const dx = surfaceX(event) - drag.downX;
    if (!drag.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      if (typeof surface.setPointerCapture === "function" && drag.pointerId !== NO_POINTER) {
        surface.setPointerCapture(drag.pointerId);
      }
      surface.style.cursor = GRABBING;
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
        drag.pointerId !== NO_POINTER && (surface.hasPointerCapture?.(drag.pointerId) ?? true);
      if (typeof surface.releasePointerCapture === "function" && hasCapture) {
        surface.releasePointerCapture(drag.pointerId);
      }
      surface.style.cursor = "";
      deps.onDragEnd();
    }

    drag = undefined;
  };

  const onDblClick = (): void => deps.resetView();

  /**
   * Ctrl/meta/alt are left alone so browser shortcuts - page zoom, Alt+arrow
   * history navigation - are never intercepted; Shift is a gesture modifier
   * here, not a browser one, so it stays allowed. A drag in progress also
   * returns early, matching onWheel, since the pointer already owns the
   * gesture. Zoom keys anchor on the view's centre rather than a pointer
   * position, since a keyboard gesture has none. Pan keys move by a fraction
   * of the current view length rather than a fixed block count, so the step
   * scales with how far zoomed in the view already is. Only handled keys are
   * prevented, so everything else - Tab, unmodified browser shortcuts -
   * still works.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (drag?.active) return;

    const view = deps.getView();
    const length = viewLength(view);
    const centre = view.start + length / HALF;
    const total = deps.getTotalBlocks();

    if (ZOOM_IN_KEYS.has(event.key)) {
      deps.setView(zoomView(view, centre, 1 / ZOOM_STEP, total));
    } else if (ZOOM_OUT_KEYS.has(event.key)) {
      deps.setView(zoomView(view, centre, ZOOM_STEP, total));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const fraction = event.shiftKey ? KEY_PAN_FRACTION_FAST : KEY_PAN_FRACTION;
      const delta = length * fraction * (event.key === "ArrowLeft" ? -1 : 1);
      deps.setView(panView(view, delta, total));
    } else if (RESET_KEYS.has(event.key)) {
      deps.resetView();
    } else {
      return;
    }
    event.preventDefault();
  };

  surface.addEventListener("wheel", onWheel, { passive: false });
  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", endDrag);
  surface.addEventListener("pointercancel", endDrag);
  surface.addEventListener("dblclick", onDblClick);
  canvas.addEventListener("keydown", onKeyDown);

  // Teardown ends any drag in flight first, so capture and the grabbing
  // cursor are released even if the map is destroyed mid-gesture.
  return () => {
    endDrag();
    surface.removeEventListener("wheel", onWheel);
    surface.removeEventListener("pointerdown", onPointerDown);
    surface.removeEventListener("pointermove", onPointerMove);
    surface.removeEventListener("pointerup", endDrag);
    surface.removeEventListener("pointercancel", endDrag);
    surface.removeEventListener("dblclick", onDblClick);
    canvas.removeEventListener("keydown", onKeyDown);
  };
};
