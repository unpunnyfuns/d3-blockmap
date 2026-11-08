import { MIN_VIEW_LENGTH } from "./constants";

export type BlockView = { start: number; end: number };

export const fullView = (totalBlocks: number): BlockView => ({ start: 0, end: totalBlocks });

export const viewLength = (view: BlockView): number => view.end - view.start;

export const sameView = (a: BlockView, b: BlockView): boolean =>
  a.start === b.start && a.end === b.end;

export const clampView = (view: BlockView, totalBlocks: number): BlockView => {
  let start = Math.round(Math.min(view.start, view.end));
  let end = Math.round(Math.max(view.start, view.end));
  if (end - start < MIN_VIEW_LENGTH) end = start + MIN_VIEW_LENGTH;
  const length = Math.min(end - start, totalBlocks);
  start = Math.max(0, Math.min(start, totalBlocks - length));
  return { start, end: start + length };
};

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

export const panView = (view: BlockView, deltaBlocks: number, totalBlocks: number): BlockView => {
  const length = viewLength(view);
  const start = Math.round(view.start + deltaBlocks);
  return clampView({ start, end: start + length }, totalBlocks);
};
