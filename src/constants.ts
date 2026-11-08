export const BITS_PER_BYTE = 8;
export const BYTE_SHIFT = 3;
export const BYTE_MASK = 0b111;
export const BYTES_PER_PIXEL = 4;
export const OPAQUE_ALPHA = 255;
export const COLOR_TABLE_SIZE = 256;
export const PERCENT = 100;
export const PERCENT_FRACTION_DIGITS = 1;
export const TOOLTIP_OFFSET_PX = 8;
export const CANVAS_ROWS = 1;

export const CSS_VAR_MISSING = "--block-missing";
export const CSS_VAR_PARTIAL_LOW = "--block-partial-low";
export const CSS_VAR_PARTIAL_HIGH = "--block-partial-high";
export const CSS_VAR_PARTIAL = "--block-partial";
export const CSS_VAR_COMPLETE = "--block-complete";

export const DEFAULT_THEME = {
  missing: "#2b2b2b",
  partialLow: "#5b3a00",
  partialHigh: "#e0a500",
  partial: "#e0a500",
  complete: "#2ecc71",
} as const;

export const THEME_ATTRIBUTES = ["class", "style", "data-theme"] as const;
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export const RANGE_PAIR = 2;
export const FULL_BYTE = 0xff;
export const MAX_BLOCKS = 0xffffffff;
