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

export const CSS_VAR_MISSING = "--blockmap-missing";
export const CSS_VAR_PARTIAL_LOW = "--blockmap-partial-low";
export const CSS_VAR_PARTIAL_HIGH = "--blockmap-partial-high";
export const CSS_VAR_PARTIAL = "--blockmap-partial";
export const CSS_VAR_COMPLETE = "--blockmap-complete";
export const CSS_VAR_HIGHLIGHT = "--blockmap-highlight";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const ZOOM_STEP = 1.25;
export const DRAG_THRESHOLD_PX = 3;
export const BLINK_INTERVAL_MS = 500;
export const MIN_VIEW_LENGTH = 1;

export const DEFAULT_THEME = {
  missing: "#2b2b2b",
  partialLow: "#5b3a00",
  partialHigh: "#e0a500",
  partial: "#e0a500",
  complete: "#2ecc71",
  highlight: "#ff4d4f",
} as const;

export const THEME_ATTRIBUTES = ["class", "style", "data-theme"] as const;
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export const RANGE_PAIR = 2;
export const FULL_BYTE = 0xff;
export const MAX_BLOCKS = 0xffffffff;

export const CSS_VAR_AXIS_COLOR = "--blockmap-axis-color";
export const TICK_SPACING_PX = 80;
export const MIN_TICKS = 2;
export const EDGE_ANCHOR_RATIO = 0.5;
export const DECIMAL_BASE = 10;
