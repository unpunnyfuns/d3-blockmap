import { rgb } from "d3-color";
import { interpolateRgb, piecewise } from "d3-interpolate";
import {
  BYTES_PER_PIXEL,
  COLOR_TABLE_SIZE,
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
};

const LAST_INDEX = COLOR_TABLE_SIZE - 1;
const FIRST_PARTIAL_INDEX = 1;
const LAST_PARTIAL_INDEX = LAST_INDEX - 1;

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
  };
};

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

  return (fraction) => {
    let index = Math.round(fraction * LAST_INDEX);
    if (fraction > 0 && index < FIRST_PARTIAL_INDEX) index = FIRST_PARTIAL_INDEX;
    if (fraction < 1 && index > LAST_PARTIAL_INDEX) index = LAST_PARTIAL_INDEX;
    const offset = index * BYTES_PER_PIXEL;
    return table.subarray(offset, offset + BYTES_PER_PIXEL);
  };
};

export const highlightColor = (theme: Theme): Uint8ClampedArray => {
  const color = rgb(parseOr(theme.highlight, DEFAULT_THEME.highlight));
  return Uint8ClampedArray.of(color.r, color.g, color.b, OPAQUE_ALPHA);
};

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
