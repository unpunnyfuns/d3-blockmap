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

type DragState = { downX: number; view: BlockView; pointerId: number; active: boolean };

export const attachInteraction = (
  canvas: HTMLCanvasElement,
  deps: InteractionDeps,
): (() => void) => {
  let drag: DragState | undefined;

  const columnsToBlocks = (px: number, view: BlockView): number =>
    ((px * deps.getDpr()) / deps.getBinCount()) * viewLength(view);

  const onWheel = (event: WheelEvent): void => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (deps.getBinCount() === 0) return;
    event.preventDefault();
    const view = deps.getView();
    const anchor = view.start + columnsToBlocks(event.offsetX, view);
    const factor = event.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    deps.setView(zoomView(view, anchor, factor, deps.getTotalBlocks()));
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== PRIMARY_BUTTON) return;
    drag = {
      downX: event.offsetX,
      view: deps.getView(),
      pointerId: event.pointerId ?? NO_POINTER,
      active: false,
    };
  };

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
