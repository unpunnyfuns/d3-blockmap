/**
 * d3-brush wrapped so a selection is kept in block space rather than in
 * pixels: every update re-projects the stored blocks through the current
 * view, which is what makes a selection survive zoom, pan and resize. The
 * projection maths is exported separately so it can be tested without a DOM.
 */

import { brushX } from "d3-brush";
import type { BrushSelection, D3BrushEvent } from "d3-brush";
import { select } from "d3-selection";
import { BRUSH_FILL_OPACITY, DEFAULT_THEME } from "./constants";
import { ensureRelative } from "./dom";
import type { BlockRange } from "./ranges";
import { createScale } from "./view";
import type { BlockView } from "./view";

export type BrushOverlayDeps = {
  getView(): BlockView;
  getWidth(): number;
  getHeight(): number;
  getTotalBlocks(): number;
  onBrush(selection: BlockRange | null): void;
  onBrushEnd(selection: BlockRange | null): void;
};

export type BrushOverlay = {
  update(): void;
  setSelection(selection: BlockRange | null): void;
  getSelection(): BlockRange | null;
  setColor(color: string): void;
  destroy(): void;
};

// A data attribute rather than a class, matching the axis, so consumers can
// style or query the overlay without the library shipping any CSS.
const BRUSH_ATTRIBUTE = "data-blockmap-brush";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SELECTION_CLASS = ".selection";
// Everything d3 attaches outside our own subtree during a gesture: the brush's
// window listeners plus d3-drag's page-wide suppression of text selection.
const GESTURE_LISTENERS =
  "mousemove.brush mouseup.brush keydown.brush keyup.brush dragstart.drag selectstart.drag";

// Only the properties the filter inspects: d3-brush calls it for both mouse
// and touch starts, and TouchEvent has no `button`.
type BrushGestureEvent = {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  button?: number;
};

const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));

/**
 * Blocks to pixels within the view, clipped to the container so a selection
 * reaching past either edge still paints up to it. Null means "nothing to
 * draw": the selection lies entirely outside the view, or the container has
 * not been laid out yet and every coordinate would collapse to zero.
 */
export const toPixels = (
  selection: BlockRange,
  view: BlockView,
  cssWidth: number,
): [number, number] | null => {
  if (cssWidth === 0) return null;
  if (selection[1] <= view.start || selection[0] >= view.end) return null;

  const scale = createScale(view, cssWidth);
  return [clamp(scale.x(selection[0]), cssWidth), clamp(scale.x(selection[1]), cssWidth)];
};

/**
 * Pixels back to blocks, snapped to whole ones. A zero-length result would
 * be an invisible selection, so it widens by a block, and at the very end of
 * the map it has to widen backwards instead. A map with no blocks is the one
 * case that cannot yield a non-empty range.
 */
export const toBlocks = (
  pixels: readonly [number, number],
  view: BlockView,
  cssWidth: number,
  totalBlocks: number,
): BlockRange => {
  const scale = createScale(view, cssWidth);
  const start = clamp(Math.round(scale.block(pixels[0])), totalBlocks);
  let end = clamp(Math.round(scale.block(pixels[1])), totalBlocks);

  if (end <= start) {
    end = Math.min(start + 1, totalBlocks);
    if (end <= start) return [Math.max(0, end - 1), end];
  }
  return [start, end];
};

// Caller input is trusted no further than the API promises: rounded, clamped,
// and anything that is not a forward range is simply no selection.
const normalize = (selection: BlockRange | null, totalBlocks: number): BlockRange | null => {
  if (!selection) return null;
  const start = clamp(Math.round(selection[0]), totalBlocks);
  const end = clamp(Math.round(selection[1]), totalBlocks);
  return end > start ? [start, end] : null;
};

// brushX only ever reports a one-dimensional selection, but the shared
// BrushSelection type also covers the two-dimensional shape.
const xSpan = (selection: BrushSelection | null): readonly [number, number] | null => {
  if (!selection) return null;
  const [x0, x1] = selection;
  if (typeof x0 !== "number" || typeof x1 !== "number") return null;
  return [x0, x1];
};

// Two selections are the same when both are empty or both cover the same
// blocks; used to tell a no-op gesture apart from a real change.
const sameRange = (a: BlockRange | null, b: BlockRange | null): boolean =>
  a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1]);

export const createBrushOverlay = (
  container: HTMLElement,
  deps: BrushOverlayDeps,
): BrushOverlay => {
  ensureRelative(container);

  // Stretched over the container rather than sized in pixels, so a resize
  // needs no attribute update; overflow stays visible so the handles at the
  // edges are not clipped.
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute(BRUSH_ATTRIBUTE, "");
  Object.assign(svg.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    touchAction: "none",
    overflow: "visible",
    display: "block",
  });
  container.append(svg);

  const g = select(svg).append("g");

  // A mousedown on the overlay would otherwise move focus off the canvas -
  // an svg is not focusable, so the browser walks up to the body - and the
  // keyboard gestures would stop working after the first brush. Capturing, so
  // the default is cancelled whatever d3-brush decides to do with the event.
  const onMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
  };
  svg.addEventListener("mousedown", onMouseDown, true);

  // Touch is declined so a touch drag falls through to the map's own pan: a
  // brush and a pan are the same gesture, and a touch user has no modifier
  // key to tell them apart. A held modifier means the gesture belongs to
  // panning, and a non-primary button to the context menu, so the brush
  // declines both of those too.
  const brush = brushX()
    .touchable(() => false)
    .filter(
      (event: BrushGestureEvent) =>
        !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.button,
    );

  let selection: BlockRange | null = null;
  let color: string = DEFAULT_THEME.brush;
  // d3-brush emits start/brush/end for programmatic moves too; they carry no
  // sourceEvent, and this flag covers a future version that supplies one.
  let silent = false;
  // A gesture is in flight, which is the only state in which d3 holds the
  // page-wide window listeners that destroy has to clean up by hand.
  let active = false;

  // The .selection rect does not exist until the behaviour has been applied,
  // and d3-brush gives it default colours as it creates it, so repainting
  // after every call is what makes setColor order-independent.
  const paint = (): void => {
    g.select(SELECTION_CLASS)
      .attr("fill", color)
      .attr("stroke", color)
      .attr("fill-opacity", BRUSH_FILL_OPACITY);
  };

  const update = (): void => {
    const width = deps.getWidth();
    brush.extent([
      [0, 0],
      [width, deps.getHeight()],
    ]);
    g.call(brush);
    paint();

    silent = true;
    try {
      g.call(brush.move, selection ? toPixels(selection, deps.getView(), width) : null);
    } finally {
      silent = false;
    }
  };

  const blocksFrom = (pixels: BrushSelection | null): BlockRange | null => {
    const span = xSpan(pixels);
    if (!span) return null;
    return toBlocks(span, deps.getView(), deps.getWidth(), deps.getTotalBlocks());
  };

  brush.on("start", (event: D3BrushEvent<unknown>) => {
    if (!event.sourceEvent || silent) return;
    active = true;
  });

  brush.on("brush", (event: D3BrushEvent<unknown>) => {
    if (!event.sourceEvent || silent) return;
    deps.onBrush(blocksFrom(event.selection));
  });

  /**
   * Release is where the selection becomes block space: snap, store, then
   * re-project so the rectangle sits on the block boundaries it reports.
   * d3-brush emits `end` for a bare press just as for a drag, so a gesture
   * that leaves the selection as it found it - a stray click on the map,
   * either half of a double click, a drag back to where it started - reports
   * nothing; a press that cleared a selection still does, because the
   * selection genuinely changed. The rectangle is re-projected either way,
   * so a nudge that rounds back to the same blocks snaps back onto them.
   */
  brush.on("end", (event: D3BrushEvent<unknown>) => {
    if (!event.sourceEvent || silent) return;
    active = false;

    const next = normalize(blocksFrom(event.selection), deps.getTotalBlocks());
    const changed = !sameRange(selection, next);

    selection = next;
    update();
    if (changed) deps.onBrushEnd(selection);
  });

  update();

  return {
    update,

    setSelection: (next) => {
      selection = normalize(next, deps.getTotalBlocks());
      update();
    },

    getSelection: () => (selection ? [selection[0], selection[1]] : null),

    setColor: (next) => {
      color = next;
      paint();
    },

    // d3-brush only drops its window listeners and re-enables dragging from
    // inside its own gesture end, so destroying mid-drag has to do it by
    // hand or they outlive the map. Every targeted browser has
    // onselectstart, so d3-drag suppresses selection with a listener rather
    // than an inline style and removing the listeners is the whole cleanup.
    // Those listeners are removed by name, which would take another
    // component's brush or drag down with them, so this only runs for a
    // gesture that is actually in flight.
    destroy: () => {
      brush.on("start", null).on("brush", null).on("end", null);
      g.on(".brush", null);
      svg.removeEventListener("mousedown", onMouseDown, true);
      if (active) select(window).on(GESTURE_LISTENERS, null);
      svg.remove();
    },
  };
};
