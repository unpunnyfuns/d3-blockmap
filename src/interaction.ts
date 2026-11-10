/**
 * Translates pointer, wheel and keyboard input into view changes:
 * ctrl/meta-wheel zooms, drag pans, double click resets, and the keys below
 * mirror those gestures for anyone who can't use a pointer. Two touch
 * pointers pinch: the spread zooms and the midpoint pans. An active drag or
 * a pinch owns the surface, and presses from other pointers are ignored
 * while it lasts; the one exception is a second finger during a touch drag,
 * which turns the drag into a pinch. An inactive drag - pressed but not yet
 * past the threshold - holds no capture, no cursor and has not called
 * onDragStart, so it owns nothing: it is only a baseline, and any new press
 * replaces it. A finger still down after its pinch ends does nothing until
 * it lifts or loses capture. Pointer, wheel and dblclick listeners sit on the surface - the container - rather than
 * the canvas, so an overlay stacked above the canvas (the brush) cannot
 * swallow them; keydown stays on the canvas because that is the focusable
 * element. Positions therefore come from clientX minus the canvas rect
 * instead of offsetX, which would be relative to whichever child the event
 * happened to hit. It computes the new view with the pure helpers in view.ts
 * and hands it to deps.setView; it never touches state, pixels or the
 * tooltip directly.
 */

import {
  DRAG_THRESHOLD_PX,
  KEY_PAN_FRACTION,
  KEY_PAN_FRACTION_FAST,
  PINCH_MIN_DISTANCE_PX,
  ZOOM_STEP,
} from "./constants";
import { canvasX } from "./dom";
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
const NO_BUTTONS = 0;
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

/**
 * The view as it was when the second touch pointer went down, the two
 * pointers that own the pinch, their distance and midpoint at that moment,
 * and the block that sat under the midpoint.
 */
type PinchState = {
  view: BlockView;
  pointerIds: readonly [number, number];
  distance: number;
  midpoint: number;
  anchor: number;
};

const PINCH_POINTERS = 2;

export const attachInteraction = (
  surface: HTMLElement,
  canvas: HTMLCanvasElement,
  deps: InteractionDeps,
): (() => void) => {
  let drag: DragState | undefined;
  let pinch: PinchState | undefined;

  // Touch pointers currently down on the surface, by pointerId, with their
  // latest canvas-relative x.
  const touches = new Map<number, number>();

  // Fingers still down from a pinch that has ended. They belong to no
  // gesture, and while any remains no new touch gesture can start.
  const spent = new Set<number>();

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
    if (drag?.active || pinch) return;
    if (deps.getBinCount() === 0) return;
    event.preventDefault();

    const view = deps.getView();
    const anchor = view.start + columnsToBlocks(canvasX(canvas, event), view);
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

    const isTouch = event.pointerType === TOUCH_POINTER;

    // The primary touch pointer is the first contact of a new touch
    // sequence, so no other finger can still be down: whatever touch state
    // is still recorded is stale, from pointers whose up never arrived.
    if (isTouch && event.isPrimary) forgetTouches();

    // A pinch or an active drag owns the surface. The one exception is a
    // second finger during a touch drag, which goes on to start a pinch.
    if (pinch) return;
    const touchDrag = drag !== undefined && touches.has(drag.pointerId);
    if (drag?.active && drag.pointerId !== event.pointerId && !(isTouch && touchDrag)) return;

    if (isTouch) {
      if (spent.size > 0) return;
      touches.set(event.pointerId, canvasX(canvas, event));
      if (touches.size === PINCH_POINTERS) {
        startPinch();
        return;
      }
    }

    // Any inactive drag left from another pointer is replaced, even by a
    // press that goes on to claim nothing.
    endDrag();

    // The brush only claims mouse and pen drags, so a touch drag is the only
    // pan a touch user has and never needs the modifier they cannot hold.
    if (deps.panRequiresShift() && !isTouch && !event.shiftKey) return;

    drag = {
      downX: canvasX(canvas, event),
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
    if (spent.has(event.pointerId)) return;
    if (touches.has(event.pointerId)) touches.set(event.pointerId, canvasX(canvas, event));
    if (pinch) {
      if (pinch.pointerIds.includes(event.pointerId)) movePinch(pinch);
      return;
    }
    if (!drag) return;
    // A drag follows only the pointer that started it.
    if (drag.pointerId !== NO_POINTER && event.pointerId !== drag.pointerId) return;
    // A mouse or pen released outside the surface without capture never
    // sends its up here; a move with no button held means the press is over.
    if (!touches.has(drag.pointerId) && event.buttons === NO_BUTTONS) {
      endDrag();
      return;
    }

    const dx = canvasX(canvas, event) - drag.downX;
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
  const releaseCapture = (pointerId: number): void => {
    const hasCapture = surface.hasPointerCapture?.(pointerId) ?? true;
    if (typeof surface.releasePointerCapture === "function" && hasCapture) {
      surface.releasePointerCapture(pointerId);
    }
  };

  // The state is cleared before anything is undone, so a lostpointercapture
  // dispatched by the release finds nothing left to end.
  const endDrag = (): void => {
    const ended = drag;
    drag = undefined;
    if (!ended?.active) return;

    if (ended.pointerId !== NO_POINTER) releaseCapture(ended.pointerId);
    surface.style.cursor = "";
    deps.onDragEnd();
  };

  /**
   * Only reached with two touch pointers down and no mouse or pen drag, which
   * onPointerDown turns away beforehand. A touch drag in flight ends through
   * endDrag first, so its capture, cursor and onDragEnd unwind before the pinch
   * claims both pointers. onDragStart hides the tooltip for the pinch the
   * same way it does for a drag.
   */
  const startPinch = (): void => {
    endDrag();

    const [[firstId, firstX], [secondId, secondX]] = Array.from(touches);
    const view = deps.getView();
    const midpoint = (firstX + secondX) / HALF;
    pinch = {
      view,
      pointerIds: [firstId, secondId],
      distance: Math.max(Math.abs(firstX - secondX), PINCH_MIN_DISTANCE_PX),
      midpoint,
      anchor: deps.getBinCount() === 0 ? view.start : view.start + columnsToBlocks(midpoint, view),
    };

    if (typeof surface.setPointerCapture === "function") {
      surface.setPointerCapture(firstId);
      surface.setPointerCapture(secondId);
    }
    deps.onDragStart();
  };

  /**
   * Computed from the baseline on every move, never incrementally, like the
   * drag: the distance ratio zooms around the anchor, then a pan keeps the
   * anchor under the current midpoint. The minimum distance keeps fingers
   * that meet from dividing by zero. A pinch pointer missing from the
   * tracked set has no position to use, so the move is skipped rather than
   * guessed.
   */
  const movePinch = (state: PinchState): void => {
    if (deps.getBinCount() === 0) return;

    const [firstX, secondX] = state.pointerIds.map((id) => touches.get(id));
    if (firstX === undefined || secondX === undefined) return;
    const distance = Math.max(Math.abs(firstX - secondX), PINCH_MIN_DISTANCE_PX);
    const midpoint = (firstX + secondX) / HALF;
    const total = deps.getTotalBlocks();
    const zoomed = zoomView(state.view, state.anchor, state.distance / distance, total);
    deps.setView(panView(zoomed, -columnsToBlocks(midpoint - state.midpoint, zoomed), total));
  };

  /**
   * Releases capture only on the pointers given: the finger still down after
   * the other lifts keeps its capture, so its own up or cancel still reaches
   * the surface wherever it lifts. Teardown passes every pointer.
   */
  const endPinch = (released: readonly number[]): void => {
    if (!pinch) return;
    pinch = undefined;
    released.forEach(releaseCapture);
    deps.onDragEnd();
  };

  /**
   * Forgets one pointer: up, cancel, or a lost capture on the surface itself.
   * A spent finger releases the capture it kept. Either pinch pointer going ends the pinch; the finger left down is spent
   * and hands over to nothing, so it cannot jolt the view into a pan or pair
   * with a new finger. A pointer that owns no gesture - a third finger, a
   * press that was turned away - changes nothing. Ending is idempotent, so
   * the lostpointercapture that follows a normal up finds nothing to do.
   */
  const forgetPointer = (pointerId: number): void => {
    touches.delete(pointerId);
    if (spent.delete(pointerId)) releaseCapture(pointerId);
    if (pinch) {
      if (!pinch.pointerIds.includes(pointerId)) return;
      endPinch([pointerId]);
      touches.forEach((_x, id) => spent.add(id));
      touches.clear();
      return;
    }
    if (drag && drag.pointerId !== NO_POINTER && drag.pointerId !== pointerId) return;
    endDrag();
  };

  const onPointerEnd = (event: PointerEvent): void => forgetPointer(event.pointerId);

  // lostpointercapture bubbles, and a child such as the canvas loses the
  // browser's implicit touch capture as soon as the surface takes it; only a
  // loss on the surface itself means one of these gestures lost its pointer.
  const onLostCapture = (event: PointerEvent): void => {
    if (event.target !== surface) return;
    forgetPointer(event.pointerId);
  };

  // Ends a pinch or touch drag still recorded and drops every tracked and
  // spent finger, releasing whatever capture they still hold.
  const forgetTouches = (): void => {
    const held = [...touches.keys(), ...spent];
    endPinch(held);
    if (drag && touches.has(drag.pointerId)) endDrag();
    spent.forEach(releaseCapture);
    touches.clear();
    spent.clear();
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
    if (drag?.active || pinch) return;

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
  surface.addEventListener("pointerup", onPointerEnd);
  surface.addEventListener("pointercancel", onPointerEnd);
  surface.addEventListener("lostpointercapture", onLostCapture);
  surface.addEventListener("dblclick", onDblClick);
  canvas.addEventListener("keydown", onKeyDown);

  // Teardown ends any drag or pinch in flight first, so capture and the
  // grabbing cursor are released even if the map is destroyed mid-gesture.
  return () => {
    endDrag();
    forgetTouches();
    surface.removeEventListener("wheel", onWheel);
    surface.removeEventListener("pointerdown", onPointerDown);
    surface.removeEventListener("pointermove", onPointerMove);
    surface.removeEventListener("pointerup", onPointerEnd);
    surface.removeEventListener("pointercancel", onPointerEnd);
    surface.removeEventListener("lostpointercapture", onLostCapture);
    surface.removeEventListener("dblclick", onDblClick);
    canvas.removeEventListener("keydown", onKeyDown);
  };
};
