/**
 * Turns the container's CSS custom properties into a 256-entry RGBA lookup
 * table, so painting a bin is an array slice rather than a colour
 * computation. Owns theme reading and colour maths only; it never touches
 * the canvas or the bin counts.
 */

import { rgb } from "d3-color";
import { interpolateRgb, piecewise } from "d3-interpolate";
import {
  BYTES_PER_PIXEL,
  COLOR_TABLE_SIZE,
  CSS_VAR_BRUSH,
  CSS_VAR_COMPLETE,
  CSS_VAR_HIGHLIGHT,
  CSS_VAR_MISSING,
  CSS_VAR_PARTIAL,
  CSS_VAR_PARTIAL_HIGH,
  CSS_VAR_PARTIAL_LOW,
  DARK_SCHEME_QUERY,
  DEFAULT_THEME,
  OPAQUE_ALPHA,
  THEME_ATTRIBUTES,
} from "./constants";

export type Theme = {
  missing: string;
  partialLow: string;
  partialHigh: string;
  partial: string;
  complete: string;
  highlight: string;
  brush: string;
};

export type ColorScale = (fraction: number) => Uint8ClampedArray;

export type PartialStyle = "gradient" | "coverage";

const THEME_VARS: Record<keyof Theme, string> = {
  missing: CSS_VAR_MISSING,
  partialLow: CSS_VAR_PARTIAL_LOW,
  partialHigh: CSS_VAR_PARTIAL_HIGH,
  partial: CSS_VAR_PARTIAL,
  complete: CSS_VAR_COMPLETE,
  highlight: CSS_VAR_HIGHLIGHT,
  brush: CSS_VAR_BRUSH,
};

// Entry 0 is reserved for "nothing complete" and the last entry for "all
// complete"; the partial ramp occupies everything strictly between, so the
// two certainties are never approximated by a nearby ramp colour.
const LAST_INDEX = COLOR_TABLE_SIZE - 1;
const FIRST_PARTIAL_INDEX = 1;
const LAST_PARTIAL_INDEX = LAST_INDEX - 1;

/**
 * d3-color's rgb() accepts any CSS colour string and yields NaN channels for
 * input it cannot parse, and NaN is not displayable - so displayable() works
 * as the parse check. The installed d3-color returns a non-displayable colour
 * rather than throwing; the catch is defensive, so a future version that does
 * throw cannot break theme reading.
 */
const parseOr = (value: string, fallback: string): string => {
  try {
    return rgb(value).displayable() ? value : fallback;
  } catch {
    return fallback;
  }
};

const writeColor = (table: Uint8ClampedArray, index: number, css: string): void => {
  const color = rgb(css);
  const offset = index * BYTES_PER_PIXEL;
  table.set([color.r, color.g, color.b, OPAQUE_ALPHA], offset);
};

// Reads the theme off the element's computed style, so a cascade change or a
// dark-mode switch is picked up without the caller passing colours in.
export const readTheme = (el: HTMLElement): Theme => {
  const style = getComputedStyle(el);
  const read = (key: keyof Theme): string =>
    style.getPropertyValue(THEME_VARS[key]).trim() || DEFAULT_THEME[key];

  return {
    missing: read("missing"),
    partialLow: read("partialLow"),
    partialHigh: read("partialHigh"),
    partial: read("partial"),
    complete: read("complete"),
    highlight: read("highlight"),
    brush: read("brush"),
  };
};

/**
 * Builds the ramp once and samples it into the table. Both d3-interpolate
 * helpers return a function of t in [0, 1] that yields a CSS colour string:
 * interpolateRgb blends two colours channel-wise in sRGB, and piecewise
 * chains several such interpolators over equal sub-intervals, so "coverage"
 * puts `partial` exactly at t = 0.5 between missing and complete. "gradient"
 * ignores coverage endpoints and runs low -> high instead.
 */
export const createColorScale = (theme: Theme, partial: PartialStyle = "coverage"): ColorScale => {
  const table = new Uint8ClampedArray(COLOR_TABLE_SIZE * BYTES_PER_PIXEL);
  const missing = parseOr(theme.missing, DEFAULT_THEME.missing);
  const complete = parseOr(theme.complete, DEFAULT_THEME.complete);
  const partialScale =
    partial === "coverage"
      ? piecewise(interpolateRgb, [
          missing,
          parseOr(theme.partial, DEFAULT_THEME.partial),
          complete,
        ])
      : interpolateRgb(
          parseOr(theme.partialLow, DEFAULT_THEME.partialLow),
          parseOr(theme.partialHigh, DEFAULT_THEME.partialHigh),
        );

  writeColor(table, 0, missing);
  writeColor(table, LAST_INDEX, complete);
  for (let i = FIRST_PARTIAL_INDEX; i <= LAST_PARTIAL_INDEX; i += 1) {
    writeColor(table, i, partialScale(i / LAST_INDEX));
  }

  /**
   * Nudges rounding away from the two reserved entries: a bin with a single
   * completed block out of a million must not read as empty, and one missing
   * block must not read as done. Returns a view into the table, not a copy,
   * so a full repaint allocates nothing - callers must use it immediately.
   */
  return (fraction) => {
    let index = Math.round(fraction * LAST_INDEX);
    if (fraction > 0 && index < FIRST_PARTIAL_INDEX) index = FIRST_PARTIAL_INDEX;
    if (fraction < 1 && index > LAST_PARTIAL_INDEX) index = LAST_PARTIAL_INDEX;

    const offset = index * BYTES_PER_PIXEL;
    return table.subarray(offset, offset + BYTES_PER_PIXEL);
  };
};

// Standalone RGBA quad rather than a table entry: the highlight replaces a
// bin's colour wholesale and so needs no ramp.
export const highlightColor = (theme: Theme): Uint8ClampedArray => {
  const color = rgb(parseOr(theme.highlight, DEFAULT_THEME.highlight));
  return Uint8ClampedArray.of(color.r, color.g, color.b, OPAQUE_ALPHA);
};

/**
 * Custom properties do not fire change events, so theme switches are
 * inferred: a class/style/data-theme mutation on <html> covers app-driven
 * switching, and the colour-scheme media query covers the OS.
 */
export const watchTheme = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [...THEME_ATTRIBUTES],
  });

  const media = matchMedia(DARK_SCHEME_QUERY);
  media.addEventListener("change", onChange);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
};
