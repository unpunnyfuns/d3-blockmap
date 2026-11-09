/**
 * The visible block window as a half-open [start, end) range, with the
 * clamp/zoom/pan arithmetic that keeps it legal. Pure functions over plain
 * objects: no DOM, no event handling, so the maths is testable on its own.
 */

import { MIN_VIEW_LENGTH } from "./constants";

export type BlockView = { start: number; end: number };

export const fullView = (totalBlocks: number): BlockView => ({ start: 0, end: totalBlocks });

export const viewLength = (view: BlockView): number => view.end - view.start;

export const sameView = (a: BlockView, b: BlockView): boolean =>
  a.start === b.start && a.end === b.end;

/**
 * Normalises any candidate view: swaps inverted bounds, rounds to whole
 * blocks, enforces a minimum length, then slides the window inside
 * [0, totalBlocks) while preserving its length rather than truncating it.
 */
export const clampView = (view: BlockView, totalBlocks: number): BlockView => {
  let start = Math.round(Math.min(view.start, view.end));
  let end = Math.round(Math.max(view.start, view.end));
  if (end - start < MIN_VIEW_LENGTH) end = start + MIN_VIEW_LENGTH;

  const length = Math.min(end - start, totalBlocks);
  start = Math.max(0, Math.min(start, totalBlocks - length));
  return { start, end: start + length };
};

/**
 * Scales the view by `factor` while holding `anchor` (the block under the
 * cursor) at the same fractional offset, so the block you point at does not
 * drift. Rounding follows the gesture's direction: zooming in (factor < 1)
 * floors and zooming out ceils, so every notch changes the length by at
 * least one block instead of rounding back to where it started.
 */
export const zoomView = (
  view: BlockView,
  anchor: number,
  factor: number,
  totalBlocks: number,
): BlockView => {
  const length = viewLength(view);
  const scaled = length * factor;
  const nextLength = Math.max(
    MIN_VIEW_LENGTH,
    Math.min(totalBlocks, factor < 1 ? Math.floor(scaled) : Math.ceil(scaled)),
  );

  const ratio = (anchor - view.start) / length;
  const start = Math.round(anchor - ratio * nextLength);
  return clampView({ start, end: start + nextLength }, totalBlocks);
};

/**
 * Shifts the window by `deltaBlocks`, keeping its length. Callers pass the
 * view captured at pointerdown plus the total pointer travel, not the
 * previous frame's view, so accumulated rounding cannot make a drag creep.
 */
export const panView = (view: BlockView, deltaBlocks: number, totalBlocks: number): BlockView => {
  const length = viewLength(view);
  const start = Math.round(view.start + deltaBlocks);
  return clampView({ start, end: start + length }, totalBlocks);
};
