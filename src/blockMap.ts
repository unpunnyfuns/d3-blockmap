import { createColorScale, readTheme, watchTheme } from "./colors";
import type { PartialStyle } from "./colors";
import { CANVAS_ROWS } from "./constants";
import { createRenderer } from "./renderer";
import type { Renderer } from "./renderer";
import type { RangeInput } from "./ranges";
import { createBlockState } from "./state";
import type { Progress } from "./state";
import { createTooltip, formatBinTooltip, formatBlockTooltip } from "./tooltip";

export type BlockMapOptions = {
  totalBlocks: number;
  initialBlocks?: ArrayLike<number>;
  initialRanges?: RangeInput;
  partial?: PartialStyle;
};

export type BlockMap = {
  setBlocks(indices: ArrayLike<number>): void;
  setRanges(ranges: RangeInput): void;
  addBlocks(indices: ArrayLike<number>): void;
  getProgress(): Progress;
  destroy(): void;
};

const FULL = "100%";
const CONTEXT_ID = "2d";

const dprQuery = (dpr: number): string => `(resolution: ${dpr}dppx)`;

export const createBlockMap = (container: HTMLElement, options: BlockMapOptions): BlockMap => {
  const state = createBlockState(options.totalBlocks);

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

  const applyTheme = (): void => {
    renderer.setColors(createColorScale(readTheme(container), options.partial));
  };

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
    const { binCount, totalBlocks } = state;
    if (binCount === 0) return;
    const column = Math.min(binCount - 1, Math.max(0, Math.floor(event.offsetX * dpr)));
    const text =
      totalBlocks < binCount
        ? (() => {
            const block = Math.floor((column * totalBlocks) / binCount);
            return formatBlockTooltip(block, state.has(block));
          })()
        : formatBinTooltip(state.rangeOf(column), state.countOf(column));
    tooltip.show(event.offsetX, text);
  };
  const onPointerLeave = (): void => tooltip.hide();

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
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
    getProgress: () => (destroyed ? { completed: 0, total: state.totalBlocks } : state.progress()),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      resizeObserver.disconnect();
      unwatchTheme();
      dprMedia?.removeEventListener("change", onDprChange);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      renderer.destroy();
      tooltip.destroy();
      canvas.remove();
    },
  };
};
