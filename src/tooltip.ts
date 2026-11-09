import type { BlockRange } from "./bins";
import { PERCENT, PERCENT_FRACTION_DIGITS, TOOLTIP_OFFSET_PX } from "./constants";
import { ensureRelative } from "./dom";

export type Tooltip = {
  show(x: number, text: string): void;
  hide(): void;
  destroy(): void;
};

const LOCALE = "en-US";
const TOOLTIP_ATTRIBUTE = "data-blockmap-tooltip";
const SEPARATOR = " · ";
const EN_DASH = "–";

const countFormat = new Intl.NumberFormat(LOCALE);

const MIN_PARTIAL_STEP = 1 / 10 ** PERCENT_FRACTION_DIGITS;
const MAX_PARTIAL = (PERCENT - MIN_PARTIAL_STEP).toFixed(PERCENT_FRACTION_DIGITS);
const MIN_PARTIAL = MIN_PARTIAL_STEP.toFixed(PERCENT_FRACTION_DIGITS);
const MAX_FIXED = PERCENT.toFixed(PERCENT_FRACTION_DIGITS);
const MIN_FIXED = (0).toFixed(PERCENT_FRACTION_DIGITS);

const formatPercent = (count: number, size: number): string => {
  if (count === 0) return "0%";
  if (count === size) return "100%";
  const value = (count / size) * PERCENT;
  const text = value.toFixed(PERCENT_FRACTION_DIGITS);
  if (text === MAX_FIXED) {
    return `>${MAX_PARTIAL}%`;
  }
  if (text === MIN_FIXED) {
    return `<${MIN_PARTIAL}%`;
  }
  return `${text}%`;
};

export const formatBinTooltip = (range: BlockRange, count: number): string => {
  const size = range.end - range.start;
  const label =
    size === 1
      ? `Block ${countFormat.format(range.start)}`
      : `Blocks ${countFormat.format(range.start)}${EN_DASH}${countFormat.format(range.end - 1)}`;
  return `${label}${SEPARATOR}${countFormat.format(count)} / ${countFormat.format(size)} (${formatPercent(count, size)})`;
};

export const formatBlockTooltip = (index: number, complete: boolean): string =>
  `Block ${countFormat.format(index)}${SEPARATOR}${complete ? "complete" : "missing"}`;

export const createTooltip = (container: HTMLElement): Tooltip => {
  const el = document.createElement("div");
  el.setAttribute(TOOLTIP_ATTRIBUTE, "");
  Object.assign(el.style, {
    position: "absolute",
    top: "0",
    left: "0",
    display: "none",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    transform: "translateY(-100%)",
  });
  ensureRelative(container);
  container.append(el);

  return {
    show: (x, text) => {
      el.textContent = text;
      el.style.left = `${x + TOOLTIP_OFFSET_PX}px`;
      el.style.display = "block";
    },
    hide: () => {
      el.style.display = "none";
    },
    destroy: () => {
      el.remove();
    },
  };
};
