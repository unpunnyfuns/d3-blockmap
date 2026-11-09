import { rgb } from "d3-color";
import type { Theme } from "../colors";
import { DEFAULT_THEME, OPAQUE_ALPHA } from "../constants";

export const TEST_THEME: Theme = {
  missing: "#000000",
  partialLow: "#ff0000",
  partialHigh: "#0000ff",
  partial: "#ff0000",
  complete: "#ffffff",
  highlight: "#00ff00",
  brush: "#ff00ff",
};

export const rgba = (css: string): number[] => {
  const color = rgb(css);
  return [color.r, color.g, color.b, OPAQUE_ALPHA];
};

export const COMPLETE_RGBA = rgba(DEFAULT_THEME.complete);
export const MISSING_RGBA = rgba(DEFAULT_THEME.missing);
export const HIGHLIGHT_RGBA = rgba(DEFAULT_THEME.highlight);
