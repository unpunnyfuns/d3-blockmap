/**
 * The façade: creates the canvas, wires state, renderer, tooltip, axis and
 * interaction together, and owns everything with a lifetime - observers,
 * media queries, the pending-view frame. The pieces it composes stay
 * unaware of each other; all cross-cutting policy (when to repaint, what a
 * gesture means for the model) lives here.
 */

import { createAxis, createScale } from "./axis";
import type { Axis, AxisOptions, BlockScale } from "./axis";
import { createColorScale, highlightColor, readTheme, watchTheme } from "./colors";
import type { PartialStyle, Theme } from "./colors";
import {
  ARIA_LABEL_DEFAULT_PERCENT_DIGITS,
  CANVAS_ROWS,
  PERCENT,
  REDUCED_MOTION_QUERY,
} from "./constants";
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
  label?: (progress: Progress) => string;
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
const LOCALE = "en-US";
const ARIA_LABEL_ATTRIBUTE = "aria-label";

const numberFormat = new Intl.NumberFormat(LOCALE);

// What a screen reader announces when nothing else is specified: grouped
// counts so large totals read in thousands rather than a wall of digits.
const defaultLabel = (progress: Progress): string => {
  const percent = ((progress.completed / progress.total) * PERCENT).toFixed(
    ARIA_LABEL_DEFAULT_PERCENT_DIGITS,
  );
  return `Download progress: ${numberFormat.format(progress.completed)} of ${numberFormat.format(progress.total)} blocks (${percent}%)`;
};

// devicePixelRatio fires no change event, so the current ratio is watched as
// a media query that stops matching when it moves.
const dprQuery = (dpr: number): string => `(resolution: ${dpr}dppx)`;

/**
 * Inverse of the renderer's discrete-mode column span. There, block b covers
 * columns [floor(b * binCount / length), floor((b + 1) * binCount / length)),
 * so the block under a column is the number of block boundaries that fit
 * within the first `column + 1` columns, minus one. Floor and ceil must agree
 * like this or the tooltip names a neighbour of the block you can see.
 */
const discreteBlock = (column: number, length: number, binCount: number, start: number): number =>
  start + Math.ceil(((column + 1) * length) / binCount) - 1;

export const createBlockMap = (container: HTMLElement, options: BlockMapOptions): BlockMap => {
  const state = createBlockState(options.totalBlocks);
  if (options.view) state.setView(options.view);

  // One pixel row stretched to fill the container: width is set in layout
  // once the container has been measured. touchAction none so a drag pans
  // the view instead of scrolling the page.
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    display: "block",
    width: FULL,
    height: FULL,
    touchAction: "none",
  });
  canvas.height = CANVAS_ROWS;
  canvas.setAttribute("role", "img");
  // Only a canvas the keyboard can reach needs to be in the tab order; a
  // non-interactive map has nothing for arrow keys or zoom keys to do.
  if (options.interactive !== false) canvas.tabIndex = 0;
  container.append(canvas);

  // Remove the canvas before throwing, so a failed construction leaves no
  // orphan element in the caller's container.
  const ctx = canvas.getContext(CONTEXT_ID);
  if (!ctx) {
    canvas.remove();
    throw new Error(`Could not acquire a ${CONTEXT_ID} canvas context`);
  }

  const renderer: Renderer = createRenderer(ctx, state);
  const tooltip = createTooltip(container);

  // `axis: true` means defaults, an object means those options, and both
  // false and absent mean no axis at all.
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

  // Created once and read live, rather than re-queried per call, so the
  // change listener below can be attached to this exact MediaQueryList.
  const motionMedia = matchMedia(REDUCED_MOTION_QUERY);
  const blinkAllowed = (): boolean => !motionMedia.matches;

  const applyHighlight = (): void => {
    renderer.setHighlight(highlightOn, highlightColor(theme), blinkAllowed());
  };

  // The preference can flip while the highlight is already running and its
  // blink timer mid-flight; only a fresh call to applyHighlight picks up the
  // new blinkAllowed() value, and only the active highlight needs it.
  const onMotionChange = (): void => {
    if (highlightOn) applyHighlight();
  };
  motionMedia.addEventListener("change", onMotionChange);

  // Re-reads the custom properties and rebuilds the 256-entry table; the
  // highlight colour is separate from that table, so it needs its own push.
  const applyTheme = (): void => {
    theme = readTheme(container);
    renderer.setColors(createColorScale(theme, options.partial));
    if (highlightOn) renderer.setHighlightColor(highlightColor(theme));
  };

  let labelPending = false;
  let labelFrame = NO_FRAME;

  /**
   * Coalesces to one aria-label write per animation frame: a burst of
   * addBlocks calls in a single tick only needs to announce the final count.
   * labelPending is set before requestAnimationFrame is called, not after,
   * because the test harness's rAF can run its callback synchronously; if
   * the flag were the frame handle itself, that reentrant run would clear it
   * before the still-pending assignment overwrote it right back.
   */
  const scheduleLabel = (): void => {
    if (labelPending) return;
    labelPending = true;
    labelFrame = requestAnimationFrame(() => {
      labelPending = false;
      labelFrame = NO_FRAME;
      canvas.setAttribute(ARIA_LABEL_ATTRIBUTE, (options.label ?? defaultLabel)(state.progress()));
    });
  };

  let pendingView: BlockView | undefined;
  let viewFrame = NO_FRAME;

  // Reports the requested view, not the committed one, so a read straight
  // after setView sees what the caller just asked for.
  const getView = (): BlockView => ({ ...(pendingView ?? state.view) });

  /**
   * Applies at most one view change per frame. Rebinning a view change is the
   * expensive part - it recounts every bin - so a wheel spin or a drag that
   * produces several candidates per frame only pays for the last one.
   */
  const commitView = (): void => {
    viewFrame = NO_FRAME;
    const next = pendingView;
    pendingView = undefined;
    if (!next || !state.setView(next)) return;

    renderer.markAllDirty();
    axis?.update(state.view, cssWidth);
    options.onViewChange?.(state.getView());
  };

  /**
   * pendingView doubles as the "a frame is already queued" flag, so repeated
   * calls overwrite the target instead of queueing more frames; viewFrame is
   * kept only so destroy can cancel a frame that will never run. Comparing
   * against the pending view means a gesture that ends where it started is
   * dropped without a repaint.
   */
  const setView = (view: BlockView): void => {
    if (!Number.isFinite(view.start) || !Number.isFinite(view.end)) return;

    const clamped = clampView(view, state.totalBlocks);
    if (sameView(clamped, pendingView ?? state.view)) return;

    const hasPendingFrame = pendingView !== undefined;
    pendingView = clamped;
    if (!hasPendingFrame) viewFrame = requestAnimationFrame(commitView);
  };

  const resetView = (): void => setView(fullView(state.totalBlocks));

  /**
   * One bin per device pixel, so the map never shows more detail than the
   * screen can resolve. The early return matters for more than speed:
   * assigning canvas.width clears the backing store, so a no-op resize would
   * blank the canvas until the next frame.
   */
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

  // The query only tells us when the ratio stops being what it was, so it is
  // a one-shot listener that is re-armed at the new ratio each time - page
  // zoom and dragging the window to another display both land here.
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

  /**
   * Hit test for the tooltip, mirroring how the renderer chose to paint:
   * fewer blocks than columns means each block spans several columns and the
   * readout names a single block, otherwise a column is a bin and the readout
   * is a coverage count. The column is clamped because offsetX can reach the
   * far edge, and suppressed while dragging, where the pointer means pan.
   */
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

  // Interaction reads the live view and total through getters rather than
  // captured values, since both change under it as zoom and resize happen.
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

  // Ranges first, then loose blocks on top: initialRanges replaces the whole
  // bitset, so the opposite order would discard the individual blocks.
  if (options.initialRanges) state.replaceRanges(options.initialRanges);
  if (options.initialBlocks) renderer.markDirty(state.add(options.initialBlocks));
  scheduleLabel();

  // Every mutating method checks `destroyed`, so a late async update from a
  // caller that has already torn the map down is a no-op rather than a write
  // to a detached canvas.
  return {
    setBlocks: (indices) => {
      if (destroyed) return;
      state.replace(indices);
      renderer.markAllDirty();
      scheduleLabel();
    },
    setRanges: (ranges) => {
      if (destroyed) return;
      state.replaceRanges(ranges);
      renderer.markAllDirty();
      scheduleLabel();
    },

    // The incremental paths repaint only the bins the state reports changed.
    addBlocks: (indices) => {
      if (destroyed) return;
      renderer.markDirty(state.add(indices));
      scheduleLabel();
    },
    addRanges: (ranges) => {
      if (destroyed) return;
      renderer.markDirty(state.addRanges(ranges));
      scheduleLabel();
    },
    removeRanges: (ranges) => {
      if (destroyed) return;
      renderer.markDirty(state.removeRanges(ranges));
      scheduleLabel();
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

    // Built from the committed view, so the scale always matches what is on
    // screen rather than a change still waiting for its frame.
    getScale: () => createScale(state.getView(), cssWidth),

    setHighlight: (on) => {
      if (destroyed) return;
      highlightOn = on;
      applyHighlight();
    },
    getProgress: () => (destroyed ? { completed: 0, total: state.totalBlocks } : state.progress()),

    // Idempotent, and unwinds in the reverse order of construction: pending
    // frame, observers, listeners, owned children, then the canvas itself.
    destroy: () => {
      if (destroyed) return;
      destroyed = true;

      if (viewFrame !== NO_FRAME) cancelAnimationFrame(viewFrame);
      viewFrame = NO_FRAME;
      pendingView = undefined;

      if (labelFrame !== NO_FRAME) cancelAnimationFrame(labelFrame);
      labelFrame = NO_FRAME;
      labelPending = false;

      resizeObserver.disconnect();
      unwatchTheme();
      dprMedia?.removeEventListener("change", onDprChange);
      motionMedia.removeEventListener("change", onMotionChange);
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
