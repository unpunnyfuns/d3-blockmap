import type { BlockRange } from "./bins";
import { PERCENT, PERCENT_FRACTION_DIGITS, TOOLTIP_OFFSET_PX } from "./constants";

export type Tooltip = {
  show(x: number, text: string): void;
  hide(): void;
  destroy(): void;
};

const TOOLTIP_ATTRIBUTE = "data-piece-tooltip";
const SEPARATOR = " · ";
const EN_DASH = "–";

const countFormat = new Intl.NumberFormat("en-US");
const percentFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: PERCENT_FRACTION_DIGITS,
});

const formatPercent = (count: number, size: number): string => {
  const value = size === 0 ? 0 : (count / size) * PERCENT;
  const text =
    value === PERCENT ? percentFormat.format(value) : value.toFixed(PERCENT_FRACTION_DIGITS);
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
  if (getComputedStyle(container).position === "static") container.style.position = "relative";
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
