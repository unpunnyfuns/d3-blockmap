import { ticks } from "d3-array";
import { CSS_VAR_AXIS_COLOR, EDGE_ANCHOR_RATIO, MIN_TICKS, TICK_SPACING_PX } from "./constants";
import { viewLength } from "./view";
import type { BlockView } from "./view";

export type AxisOptions = {
  format?: (block: number) => string;
  tickCount?: number;
};

export type Tick = { block: number; x: number };

export type BlockScale = {
  domain: readonly [number, number];
  range: readonly [number, number];
  x(block: number): number;
  block(x: number): number;
};

export type Axis = {
  update(view: BlockView, cssWidth: number): void;
  destroy(): void;
};

const AXIS_ATTRIBUTE = "data-blockmap-axis";
const TICK_ATTRIBUTE = "data-blockmap-tick";
const FULL = "100%";
const CENTER = "translateX(-50%)";
const LEFT_EDGE = "translateX(0)";
const RIGHT_EDGE = "translateX(-100%)";
const MAX_FRACTION_DIGITS = 1;

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: MAX_FRACTION_DIGITS,
});

export const defaultFormat = (block: number): string => compact.format(block);

export const createScale = (view: BlockView, cssWidth: number): BlockScale => {
  const length = viewLength(view);
  return {
    domain: [view.start, view.end],
    range: [0, cssWidth],
    x: (block) => (cssWidth === 0 ? 0 : ((block - view.start) / length) * cssWidth),
    block: (x) => (cssWidth === 0 ? view.start : view.start + (x / cssWidth) * length),
  };
};

export const computeTicks = (view: BlockView, cssWidth: number, tickCount?: number): Tick[] => {
  if (cssWidth <= 0) return [];
  const count = tickCount ?? Math.max(MIN_TICKS, Math.floor(cssWidth / TICK_SPACING_PX));
  const scale = createScale(view, cssWidth);
  return ticks(view.start, view.end, count)
    .filter((value) => value >= view.start && value <= view.end)
    .map((value) => ({ block: value, x: scale.x(value) }));
};

const anchorFor = (x: number, cssWidth: number): string => {
  const edge = TICK_SPACING_PX * EDGE_ANCHOR_RATIO;
  if (x < edge) return LEFT_EDGE;
  if (cssWidth - x < edge) return RIGHT_EDGE;
  return CENTER;
};

export const createAxis = (container: HTMLElement, options: AxisOptions): Axis => {
  const format = options.format ?? defaultFormat;
  const root = document.createElement("div");
  root.setAttribute(AXIS_ATTRIBUTE, "");
  Object.assign(root.style, {
    position: "absolute",
    left: "0",
    right: "0",
    top: FULL,
    pointerEvents: "none",
    userSelect: "none",
    color: `var(${CSS_VAR_AXIS_COLOR}, currentColor)`,
    font: "inherit",
  });
  container.append(root);

  return {
    update: (view, cssWidth) => {
      const spans = computeTicks(view, cssWidth, options.tickCount).map((tick) => {
        const span = document.createElement("span");
        span.setAttribute(TICK_ATTRIBUTE, "");
        span.dataset.block = String(tick.block);
        span.textContent = format(tick.block);
        Object.assign(span.style, {
          display: "block",
          position: "absolute",
          top: "0",
          left: `${tick.x}px`,
          transform: anchorFor(tick.x, cssWidth),
          whiteSpace: "nowrap",
        });
        return span;
      });
      root.replaceChildren(...spans);
    },
    destroy: () => {
      root.remove();
    },
  };
};
