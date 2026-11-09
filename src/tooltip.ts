/**
 * Hover readout: the label strings and the single absolutely positioned div
 * that shows them. The formatters take a range and a count rather than the
 * state object, so they are pure and testable; this module does no hit
 * testing - the caller decides which bin or block is under the pointer.
 */

import type { BlockRange } from "./bins";
import { DECIMAL_BASE, PERCENT, PERCENT_FRACTION_DIGITS, TOOLTIP_OFFSET_PX } from "./constants";
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

// Smallest percentage one fraction digit can show, and the fixed-point
// strings that rounding collapses onto at either end of the range.
const MIN_PARTIAL_STEP = 1 / DECIMAL_BASE ** PERCENT_FRACTION_DIGITS;
const MAX_PARTIAL = (PERCENT - MIN_PARTIAL_STEP).toFixed(PERCENT_FRACTION_DIGITS);
const MIN_PARTIAL = MIN_PARTIAL_STEP.toFixed(PERCENT_FRACTION_DIGITS);
const MAX_FIXED = PERCENT.toFixed(PERCENT_FRACTION_DIGITS);
const MIN_FIXED = (0).toFixed(PERCENT_FRACTION_DIGITS);

/**
 * At a million blocks per bin, one missing block rounds to 100.0% and one
 * present block to 0.0%, which would read as finished or untouched. Only an
 * exact count gets a bare 0% or 100%; anything that merely rounds there is
 * reported as a bound instead, ">99.9%" or "<0.1%".
 */
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

// Ranges are half-open, so the label's last block is end - 1, and a bin that
// covers a single block is named rather than given a degenerate range.
export const formatBinTooltip = (range: BlockRange, count: number): string => {
  const size = range.end - range.start;
  const label =
    size === 1
      ? `Block ${countFormat.format(range.start)}`
      : `Blocks ${countFormat.format(range.start)}${EN_DASH}${countFormat.format(range.end - 1)}`;
  return `${label}${SEPARATOR}${countFormat.format(count)} / ${countFormat.format(size)} (${formatPercent(count, size)})`;
};

// Used when zoomed in far enough that a column is one block, where coverage
// is binary and a percentage would be noise.
export const formatBlockTooltip = (index: number, complete: boolean): string =>
  `Block ${countFormat.format(index)}${SEPARATOR}${complete ? "complete" : "missing"}`;

export const createTooltip = (container: HTMLElement): Tooltip => {
  // translateY(-100%) lifts the box clear of the canvas, and pointerEvents
  // none keeps it from intercepting the pointermove events on the canvas
  // that position it in the first place.
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
    // x is in container-relative CSS pixels; the offset keeps the label from
    // sitting directly under the cursor.
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
