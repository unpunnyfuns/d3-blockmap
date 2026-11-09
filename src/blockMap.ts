/**
 * The façade: creates the canvas, wires state, renderer, tooltip, axis,
 * brush overlay and interaction together, and owns everything with a
 * lifetime - observers, media queries, the pending-view frame. The pieces it
 * composes stay unaware of each other; all cross-cutting policy (when to
 * repaint, what a gesture means for the model) lives here.
 */

import { createAxis, createScale } from "./axis";
import type { Axis, AxisOptions, BlockScale } from "./axis";
import { createBrushOverlay } from "./brush";
import type { BrushOverlay } from "./brush";
import { createColorScale, highlightColor, readTheme, watchTheme } from "./colors";
import type { PartialStyle, Theme } from "./colors";
import {
  ARIA_KEYSHORTCUTS,
  ARIA_LABEL_DEFAULT_PERCENT_DIGITS,
  ARIA_ROLEDESCRIPTION,
  CANVAS_ROWS,
  PERCENT,
  REDUCED_MOTION_QUERY,
} from "./constants";
import { canvasX } from "./dom";
import { attachInteraction } from "./interaction";
import { createRenderer } from "./renderer";
import type { Renderer } from "./renderer";
import type { BlockRange, RangeInput } from "./ranges";
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
  brush?: boolean;
  onViewChange?: (view: BlockView) => void;
  onBlockClick?: (event: BlockClickEvent) => void;
  onBrush?: (selection: BlockRange | null) => void;
  onBrushEnd?: (selection: BlockRange | null) => void;
  label?: (progress: Progress) => string;
};

// Reported from a click on the surface: block/range/completed/total mirror
// whichever mode located the pointer, discrete block or binned column, and
// originalEvent carries the native MouseEvent for modifier keys or
// preventDefault.
export type BlockClickEvent = {
  block: number;
  range: BlockRange;
  completed: number;
  total: number;
  originalEvent: MouseEvent;
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
  setBrush(selection: BlockRange | null): void;
  getBrush(): BlockRange | null;
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
// The percentage is floored, not rounded, so it only reads 100% once every
// block actually is, and reports a last block still missing as 99%.
export const defaultLabel = (progress: Progress): string => {
  const percent = Math.floor((progress.completed / progress.total) * PERCENT).toFixed(
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
  canvas.setAttribute("aria-roledescription", ARIA_ROLEDESCRIPTION);
  // Only a canvas the keyboard can reach needs to be in the tab order or
  // advertise key shortcuts; a non-interactive map has nothing for arrow
  // keys or zoom keys to do.
  if (options.interactive !== false) {
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-keyshortcuts", ARIA_KEYSHORTCUTS);
  }
  container.append(canvas);

  // Remove the canvas before throwing, so a failed construction leaves no
  // orphan element in the caller's container.
  const ctx = canvas.getContext(CONTEXT_ID);
  if (!ctx) {
    canvas.remove();
    throw new Error(`Could not acquire a ${CONTEXT_ID} canvas context`);
  }

  const renderer: Renderer = createRenderer(ctx, state);

  // Declared before the children below because the overlay measures the
  // container through these the moment it is created.
  let destroyed = false;
  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = devicePixelRatio;
  let dprMedia: MediaQueryList | undefined;
  let theme: Theme = readTheme(container);
  let highlightOn = false;
  let dragging = false;
  // Set when a pan or a brush gesture ends, so the click the browser fires
  // right after pointerup is swallowed instead of reaching onBlockClick as a
  // false hit.
  let suppressClick = false;

  // Appended straight after the canvas so it covers the bar, and before the
  // tooltip and the axis so those keep painting over it. The committed view
  // is what the canvas shows, so the overlay projects against that rather
  // than a view change still waiting for its frame.
  const overlay: BrushOverlay | undefined =
    options.brush === true
      ? createBrushOverlay(container, {
          getView: () => state.getView(),
          getWidth: () => cssWidth,
          getHeight: () => cssHeight,
          getTotalBlocks: () => state.totalBlocks,
          onBrush: (selection) => options.onBrush?.(selection),

          // A brush gesture that moved is driven by mouse events, so the
          // browser fires a click on release just as it does after a pan; the
          // container's pointerdown already cleared the flag at the start of
          // this gesture, so setting it here is what the click then consumes.
          // A press that only cleared the selection moved nothing, and the
          // click it ends with is still a click on a block.
          onBrushEnd: (selection, moved) => {
            if (moved) suppressClick = true;
            options.onBrushEnd?.(selection);
          },
        })
      : undefined;

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
    overlay?.setColor(theme.brush);
  };

  let labelPending = false;
  let labelFrame = NO_FRAME;

  // Reads the current progress through options.label when given, defaultLabel
  // otherwise, and writes it straight to the attribute - no coalescing, no
  // frame. Called directly at construction for a synchronous first label, and
  // from inside the scheduled frame below for every later update.
  const writeLabel = (): void => {
    canvas.setAttribute(ARIA_LABEL_ATTRIBUTE, (options.label ?? defaultLabel)(state.progress()));
  };

  /**
   * Coalesces to one aria-label write per animation frame: a burst of
   * addBlocks calls in a single tick only needs to announce the final count.
   * labelPending is set before requestAnimationFrame is called, not after,
   * because the test harness's rAF can run its callback synchronously; if
   * the flag were the frame handle itself, that reentrant run would clear it
   * before the still-pending assignment overwrote it right back. The handle
   * is likewise only stored if labelPending is still true once
   * requestAnimationFrame returns, so a synchronous callback - which already
   * cleared it to NO_FRAME - cannot have that clear overwritten by a stale
   * handle on the way out.
   */
  const scheduleLabel = (): void => {
    if (labelPending) return;
    labelPending = true;
    const handle = requestAnimationFrame(() => {
      labelPending = false;
      labelFrame = NO_FRAME;
      writeLabel();
    });
    if (labelPending) labelFrame = handle;
  };

  // The css size the chrome was last built for; distinct from binCount, which
  // rounds to whole device pixels and ignores height entirely, so it can stay
  // put across a size change that the chrome still needs to reflect.
  let lastChromeWidth: number | undefined;
  let lastChromeHeight: number | undefined;

  // The axis and the brush overlay are both laid out in css pixels against
  // the current view, so neither can be refreshed without the other.
  const updateChrome = (): void => {
    axis?.update(state.view, cssWidth);
    lastChromeWidth = cssWidth;
    lastChromeHeight = cssHeight;
    overlay?.update();
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
    updateChrome();
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
   * screen can resolve. A zero css width means the container has not been
   * measured yet (or has collapsed), so there is nothing to lay out and the
   * chrome is left alone rather than refreshed against a width of zero. The
   * binCount early return matters for more than speed: assigning
   * canvas.width clears the backing store, so a no-op resize would blank the
   * canvas until the next frame.
   */
  const layout = (): void => {
    if (cssWidth === 0) return;

    const binCount = Math.round(cssWidth * dpr);
    if (binCount === state.binCount) {
      // The device-pixel bin count can stay put across a css size change -
      // rounding absorbs a sub-pixel width, and height never feeds into it at
      // all - but the axis ticks and the brush extent are placed in css
      // pixels and still need refreshing.
      if (cssWidth !== lastChromeWidth || cssHeight !== lastChromeHeight) updateChrome();
      return;
    }

    canvas.width = binCount;
    state.resize(binCount);
    renderer.markAllDirty();
    updateChrome();
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
    cssHeight = entry.contentRect.height;
    layout();
  });
  resizeObserver.observe(container);

  type Hit = {
    column: number;
    block: number;
    range: BlockRange;
    completed: number;
    total: number;
  };

  /**
   * Hit test shared by the tooltip and the click listener, mirroring how the
   * renderer chose to paint: fewer blocks than columns means each block spans
   * several columns and the readout names a single block, otherwise a column
   * is a bin and the readout is a coverage count. An x outside the canvas hit
   * nothing: the listeners are on the container, so container padding or a
   * brush handle sticking out past an edge would otherwise report the nearest
   * column as a phantom hit. Within the canvas the column is still clamped,
   * since x scaled by dpr can round onto the column past the last one.
   * Returns undefined before the first layout too, when there are no bins.
   */
  const locate = (x: number): Hit | undefined => {
    const { binCount, view } = state;
    if (binCount === 0) return undefined;
    if (x < 0 || x >= cssWidth) return undefined;

    const column = Math.min(binCount - 1, Math.max(0, Math.floor(x * dpr)));
    const length = viewLength(view);

    if (length < binCount) {
      const block = discreteBlock(column, length, binCount, view.start);
      return {
        column,
        block,
        range: [block, block + 1],
        completed: state.has(block) ? 1 : 0,
        total: 1,
      };
    }

    const { start, end } = state.rangeOf(column);
    return {
      column,
      block: start,
      range: [start, end],
      completed: state.countOf(column),
      total: end - start,
    };
  };

  // Suppressed while dragging, where the pointer means pan rather than hover.
  const onPointerMove = (event: PointerEvent): void => {
    if (dragging) return;

    const x = canvasX(canvas, event);
    const hit = locate(x);
    if (!hit) return;

    const text =
      viewLength(state.view) < state.binCount
        ? formatBlockTooltip(hit.block, hit.completed === 1)
        : formatBinTooltip({ start: hit.range[0], end: hit.range[1] }, hit.completed);
    tooltip.show(x, text);
  };

  const onPointerLeave = (): void => tooltip.hide();

  // Clears a flag left over from a drag that never reached a click:
  // pointercancel - a touch gesture taken over by scrolling, say - ends the
  // drag through the same onDragEnd as pointerup, but fires no click after
  // it, so a stale suppressClick would swallow the next unrelated one. Every
  // new gesture starts clean.
  const onPointerDown = (): void => {
    suppressClick = false;
  };

  // A click right after an active pan is a drag artefact, not an intent to
  // pick a block, so suppressClick swallows exactly one. Registered
  // regardless of `interactive`, like the tooltip listeners above, since a
  // non-interactive map can still report what was clicked.
  const onClick = (event: MouseEvent): void => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (!options.onBlockClick) return;

    const hit = locate(canvasX(canvas, event));
    if (!hit) return;

    const { column: _column, ...rest } = hit;
    options.onBlockClick({ ...rest, originalEvent: event });
  };

  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerleave", onPointerLeave);
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("click", onClick);

  // Interaction reads the live view and total through getters rather than
  // captured values, since both change under it as zoom and resize happen.
  const detachInteraction =
    options.interactive === false
      ? undefined
      : attachInteraction(container, canvas, {
          getView,
          setView,
          resetView,
          getBinCount: () => state.binCount,
          getDpr: () => dpr,
          getTotalBlocks: () => state.totalBlocks,
          panRequiresShift: () => overlay !== undefined,
          onDragStart: () => {
            dragging = true;
            tooltip.hide();
          },
          onDragEnd: () => {
            dragging = false;
            suppressClick = true;
          },
        });

  const unwatchTheme = watchTheme(applyTheme);
  watchDpr();
  applyTheme();

  // Ranges first, then loose blocks on top: initialRanges replaces the whole
  // bitset, so the opposite order would discard the individual blocks.
  if (options.initialRanges) state.replaceRanges(options.initialRanges);
  if (options.initialBlocks) renderer.markDirty(state.add(options.initialBlocks));
  writeLabel();

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

    // Selections are only meaningful while there is an overlay to draw them:
    // without one setBrush has nothing to store and getBrush nothing to
    // report. A destroyed map reports none either, rather than whatever the
    // detached overlay was last holding.
    setBrush: (selection) => {
      if (destroyed) return;
      overlay?.setSelection(selection);
    },
    getBrush: () => (destroyed ? null : (overlay?.getSelection() ?? null)),

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
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("click", onClick);
      detachInteraction?.();

      renderer.destroy();
      tooltip.destroy();
      axis?.destroy();
      overlay?.destroy();
      canvas.remove();
    },
  };
};
