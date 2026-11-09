import { createAxis, createScale } from "./axis";
import type { Axis, AxisOptions, BlockScale } from "./axis";
import { createColorScale, highlightColor, readTheme, watchTheme } from "./colors";
import type { PartialStyle, Theme } from "./colors";
import { CANVAS_ROWS, REDUCED_MOTION_QUERY } from "./constants";
import { attachInteraction } from "./interaction";
import { createRenderer } from "./renderer";
import type { Renderer } from "./renderer";
import type { RangeInput } from "./ranges";
import { createBlockState } from "./state";
import type { Progress } from "./state";
import { createTooltip, formatBinTooltip, formatBlockTooltip } from "./tooltip";
import { clampView, fullView, sameView, viewLength } from "./view";
import type { BlockView } from "./view";

export type BlockMapOptions = {
  totalBlocks: number;
  initialBlocks?: ArrayLike<number>;
  initialRanges?: RangeInput;
  partial?: PartialStyle;
  view?: BlockView;
  interactive?: boolean;
  axis?: boolean | AxisOptions;
  onViewChange?: (view: BlockView) => void;
};

export type BlockMap = {
  setBlocks(indices: ArrayLike<number>): void;
  setRanges(ranges: RangeInput): void;
  addBlocks(indices: ArrayLike<number>): void;
  addRanges(ranges: RangeInput): void;
  removeRanges(ranges: RangeInput): void;
  setView(view: BlockView): void;
  resetView(): void;
  getView(): BlockView;
  getScale(): BlockScale;
  setHighlight(on: boolean): void;
  getProgress(): Progress;
  destroy(): void;
};

const FULL = "100%";
const CONTEXT_ID = "2d";
const NO_FRAME = 0;

const dprQuery = (dpr: number): string => `(resolution: ${dpr}dppx)`;

const discreteBlock = (column: number, length: number, binCount: number, start: number): number =>
  start + Math.ceil(((column + 1) * length) / binCount) - 1;

export const createBlockMap = (container: HTMLElement, options: BlockMapOptions): BlockMap => {
  const state = createBlockState(options.totalBlocks);
  if (options.view) state.setView(options.view);

  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    display: "block",
    width: FULL,
    height: FULL,
    touchAction: "none",
  });
  canvas.height = CANVAS_ROWS;
  container.append(canvas);

  const ctx = canvas.getContext(CONTEXT_ID);
  if (!ctx) {
    canvas.remove();
    throw new Error(`Could not acquire a ${CONTEXT_ID} canvas context`);
  }

  const renderer: Renderer = createRenderer(ctx, state);
  const tooltip = createTooltip(container);
  const axisOptions: AxisOptions | undefined =
    options.axis === true
      ? {}
      : options.axis === false || options.axis === undefined
        ? undefined
        : options.axis;
  const axis: Axis | undefined = axisOptions ? createAxis(container, axisOptions) : undefined;
  let destroyed = false;
  let cssWidth = 0;
  let dpr = devicePixelRatio;
  let dprMedia: MediaQueryList | undefined;
  let theme: Theme = readTheme(container);
  let highlightOn = false;
  let dragging = false;

  const blinkAllowed = (): boolean => !matchMedia(REDUCED_MOTION_QUERY).matches;

  const applyHighlight = (): void => {
    renderer.setHighlight(highlightOn, highlightColor(theme), blinkAllowed());
  };

  const applyTheme = (): void => {
    theme = readTheme(container);
    renderer.setColors(createColorScale(theme, options.partial));
    if (highlightOn) renderer.setHighlightColor(highlightColor(theme));
  };

  let pendingView: BlockView | undefined;
  let viewFrame = NO_FRAME;

  const getView = (): BlockView => ({ ...(pendingView ?? state.view) });

  const commitView = (): void => {
    viewFrame = NO_FRAME;
    const next = pendingView;
    pendingView = undefined;
    if (!next || !state.setView(next)) return;
    renderer.markAllDirty();
    axis?.update(state.view, cssWidth);
    options.onViewChange?.(state.getView());
  };

  const setView = (view: BlockView): void => {
    if (!Number.isFinite(view.start) || !Number.isFinite(view.end)) return;
    const clamped = clampView(view, state.totalBlocks);
    if (sameView(clamped, pendingView ?? state.view)) return;
    const hasPendingFrame = pendingView !== undefined;
    pendingView = clamped;
    if (!hasPendingFrame) viewFrame = requestAnimationFrame(commitView);
  };
  const resetView = (): void => setView(fullView(state.totalBlocks));

  const layout = (): void => {
    const binCount = Math.round(cssWidth * dpr);
    if (binCount === state.binCount) return;
    canvas.width = binCount;
    state.resize(binCount);
    renderer.markAllDirty();
    axis?.update(state.view, cssWidth);
  };

  const onDprChange = (): void => {
    dpr = devicePixelRatio;
    layout();
    watchDpr();
  };

  const watchDpr = (): void => {
    dprMedia?.removeEventListener("change", onDprChange);
    dprMedia = matchMedia(dprQuery(dpr));
    dprMedia.addEventListener("change", onDprChange, { once: true });
  };

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    cssWidth = entry.contentRect.width;
    layout();
  });
  resizeObserver.observe(container);

  const onPointerMove = (event: PointerEvent): void => {
    if (dragging) return;
    const { binCount, view } = state;
    if (binCount === 0) return;
    const column = Math.min(binCount - 1, Math.max(0, Math.floor(event.offsetX * dpr)));
    const length = viewLength(view);
    let text: string;
    if (length < binCount) {
      const block = discreteBlock(column, length, binCount, view.start);
      text = formatBlockTooltip(block, state.has(block));
    } else {
      text = formatBinTooltip(state.rangeOf(column), state.countOf(column));
    }
    tooltip.show(event.offsetX, text);
  };
  const onPointerLeave = (): void => tooltip.hide();

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  const detachInteraction =
    options.interactive === false
      ? undefined
      : attachInteraction(canvas, {
          getView,
          setView,
          resetView,
          getBinCount: () => state.binCount,
          getDpr: () => dpr,
          getTotalBlocks: () => state.totalBlocks,
          onDragStart: () => {
            dragging = true;
            tooltip.hide();
          },
          onDragEnd: () => {
            dragging = false;
          },
        });
  const unwatchTheme = watchTheme(applyTheme);
  watchDpr();
  applyTheme();
  if (options.initialRanges) state.replaceRanges(options.initialRanges);
  if (options.initialBlocks) renderer.markDirty(state.add(options.initialBlocks));

  return {
    setBlocks: (indices) => {
      if (destroyed) return;
      state.replace(indices);
      renderer.markAllDirty();
    },
    setRanges: (ranges) => {
      if (destroyed) return;
      state.replaceRanges(ranges);
      renderer.markAllDirty();
    },
    addBlocks: (indices) => {
      if (destroyed) return;
      renderer.markDirty(state.add(indices));
    },
    addRanges: (ranges) => {
      if (destroyed) return;
      renderer.markDirty(state.addRanges(ranges));
    },
    removeRanges: (ranges) => {
      if (destroyed) return;
      renderer.markDirty(state.removeRanges(ranges));
    },
    setView: (view) => {
      if (destroyed) return;
      setView(view);
    },
    resetView: () => {
      if (destroyed) return;
      resetView();
    },
    getView,
    getScale: () => createScale(state.getView(), cssWidth),
    setHighlight: (on) => {
      if (destroyed) return;
      highlightOn = on;
      applyHighlight();
    },
    getProgress: () => (destroyed ? { completed: 0, total: state.totalBlocks } : state.progress()),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (viewFrame !== NO_FRAME) cancelAnimationFrame(viewFrame);
      viewFrame = NO_FRAME;
      pendingView = undefined;
      resizeObserver.disconnect();
      unwatchTheme();
      dprMedia?.removeEventListener("change", onDprChange);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      detachInteraction?.();
      renderer.destroy();
      tooltip.destroy();
      axis?.destroy();
      canvas.remove();
    },
  };
};
