import { tickStep } from "d3-array";
import {
  CSS_VAR_AXIS_COLOR,
  DECIMAL_BASE,
  EDGE_ANCHOR_RATIO,
  MIN_TICKS,
  TICK_SPACING_PX,
} from "./constants";
import { ensureRelative } from "./dom";
import { viewLength } from "./view";
import type { BlockView } from "./view";

export type AxisOptions = {
  format?: (block: number, step: number) => string;
  tickCount?: number;
};

export type Tick = { block: number; x: number; step: number };

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
const COMPACT_THRESHOLD = 1000;
const MAGNITUDE_STEP = 3;
const MAX_COMPACT_FRACTION_DIGITS = 3;

const groupedFormat = new Intl.NumberFormat("en-US");
const compactFormatters = new Map<number, Intl.NumberFormat>();

const compactFormatterFor = (digits: number): Intl.NumberFormat => {
  const cached = compactFormatters.get(digits);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: digits,
  });
  compactFormatters.set(digits, formatter);
  return formatter;
};

export const defaultFormat = (block: number, step = 1): string => {
  if (block < COMPACT_THRESHOLD) return groupedFormat.format(block);
  const magnitude =
    Math.floor(Math.log10(Math.max(Math.abs(block), 1)) / MAGNITUDE_STEP) * MAGNITUDE_STEP;
  const unit = DECIMAL_BASE ** magnitude;
  const digits = Math.max(0, Math.ceil(Math.log10(unit / step)));
  if (digits > MAX_COMPACT_FRACTION_DIGITS) return groupedFormat.format(block);
  return compactFormatterFor(digits).format(block);
};

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
  const rawStep = tickStep(view.start, view.end, count);
  const step = Math.max(1, rawStep);
  const first = Math.ceil(view.start / step) * step;
  const result: Tick[] = [];
  for (let value = first; value <= view.end; value += step) {
    result.push({ block: value, x: scale.x(value), step });
  }
  return result;
};

export const anchorFor = (x: number, cssWidth: number): string => {
  const edge = TICK_SPACING_PX * EDGE_ANCHOR_RATIO;
  const nearLeft = x < edge;
  const nearRight = cssWidth - x < edge;
  if (nearLeft && nearRight) return x < cssWidth - x ? LEFT_EDGE : RIGHT_EDGE;
  if (nearLeft) return LEFT_EDGE;
  if (nearRight) return RIGHT_EDGE;
  return CENTER;
};

export const createAxis = (container: HTMLElement, options: AxisOptions): Axis => {
  const format = options.format ?? defaultFormat;
  ensureRelative(container);
  const root = document.createElement("div");
  root.setAttribute(AXIS_ATTRIBUTE, "");
  root.setAttribute("aria-hidden", "true");
  Object.assign(root.style, {
    position: "absolute",
    left: "0",
    right: "0",
    top: FULL,
    pointerEvents: "none",
    userSelect: "none",
    color: `var(${CSS_VAR_AXIS_COLOR}, currentColor)`,
  });
  container.append(root);

  return {
    update: (view, cssWidth) => {
      const spans = computeTicks(view, cssWidth, options.tickCount).map((tick) => {
        const span = document.createElement("span");
        span.setAttribute(TICK_ATTRIBUTE, "");
        span.dataset.block = String(tick.block);
        span.textContent = format(tick.block, tick.step);
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
