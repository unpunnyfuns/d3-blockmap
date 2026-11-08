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
import { fullView, viewLength } from "./view";
import type { BlockView } from "./view";

export type BlockMapOptions = {
  totalBlocks: number;
  initialBlocks?: ArrayLike<number>;
  initialRanges?: RangeInput;
  partial?: PartialStyle;
  view?: BlockView;
  interactive?: boolean;
  onViewChange?: (view: BlockView) => void;
};

export type BlockMap = {
  setBlocks(indices: ArrayLike<number>): void;
  setRanges(ranges: RangeInput): void;
  addBlocks(indices: ArrayLike<number>): void;
  setView(view: BlockView): void;
  resetView(): void;
  getView(): BlockView;
  setHighlight(on: boolean): void;
  getProgress(): Progress;
  destroy(): void;
};

const FULL = "100%";
const CONTEXT_ID = "2d";

const dprQuery = (dpr: number): string => `(resolution: ${dpr}dppx)`;

export const createBlockMap = (container: HTMLElement, options: BlockMapOptions): BlockMap => {
  const state = createBlockState(options.totalBlocks);
  if (options.view) state.setView(options.view);

  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { display: "block", width: FULL, height: FULL });
  canvas.height = CANVAS_ROWS;
  container.append(canvas);

  const ctx = canvas.getContext(CONTEXT_ID);
  if (!ctx) {
    canvas.remove();
    throw new Error(`Could not acquire a ${CONTEXT_ID} canvas context`);
  }

  const renderer: Renderer = createRenderer(ctx, state);
  const tooltip = createTooltip(container);
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
    if (highlightOn) applyHighlight();
  };

  const setView = (view: BlockView): void => {
    if (!state.setView(view)) return;
    renderer.markAllDirty();
    options.onViewChange?.(state.getView());
  };
  const resetView = (): void => setView(fullView(state.totalBlocks));

  const layout = (): void => {
    const binCount = Math.round(cssWidth * dpr);
    if (binCount === state.binCount) return;
    canvas.width = binCount;
    state.resize(binCount);
    renderer.markAllDirty();
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
    const text =
      length < binCount
        ? formatBlockTooltip(
            view.start + Math.floor((column * length) / binCount),
            state.has(view.start + Math.floor((column * length) / binCount)),
          )
        : formatBinTooltip(state.rangeOf(column), state.countOf(column));
    tooltip.show(event.offsetX, text);
  };
  const onPointerLeave = (): void => tooltip.hide();

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  const detachInteraction =
    options.interactive === false
      ? undefined
      : attachInteraction(canvas, {
          getView: () => state.view,
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
    setView: (view) => {
      if (destroyed) return;
      setView(view);
    },
    resetView: () => {
      if (destroyed) return;
      resetView();
    },
    getView: () => state.getView(),
    setHighlight: (on) => {
      if (destroyed) return;
      highlightOn = on;
      applyHighlight();
    },
    getProgress: () => (destroyed ? { completed: 0, total: state.totalBlocks } : state.progress()),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      resizeObserver.disconnect();
      unwatchTheme();
      dprMedia?.removeEventListener("change", onDprChange);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      detachInteraction?.();
      renderer.destroy();
      tooltip.destroy();
      canvas.remove();
    },
  };
};
