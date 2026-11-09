/**
 * Shared numeric and string literals, kept in one place because the
 * no-magic-numbers lint rule forbids them inline. Values only: no logic,
 * no imports, so every module can depend on this without cycles.
 */

// Bit addressing inside the bitset's Uint8Array: `index >>> BYTE_SHIFT`
// selects the byte, `index & BYTE_MASK` the bit within it.
export const BITS_PER_BYTE = 8;
export const BYTE_SHIFT = 3;
export const BYTE_MASK = 0b111;
export const FULL_BYTE = 0xff;

// RGBA pixel layout, shared by the colour lookup table and the canvas
// ImageData buffer. 256 entries means one per 1/255 step of coverage.
export const BYTES_PER_PIXEL = 4;
export const OPAQUE_ALPHA = 255;
export const COLOR_TABLE_SIZE = 256;

// The canvas is a single pixel row stretched vertically by CSS, so one bin
// is one column and there is never a second row to write.
export const CANVAS_ROWS = 1;

// Tooltip readout: percentage precision and the cursor offset.
export const PERCENT = 100;
export const PERCENT_FRACTION_DIGITS = 1;
export const TOOLTIP_OFFSET_PX = 8;

// Custom properties read off the container so colours stay themeable in CSS;
// DEFAULT_THEME is the fallback when a property is unset or unparseable.
export const CSS_VAR_MISSING = "--blockmap-missing";
export const CSS_VAR_PARTIAL_LOW = "--blockmap-partial-low";
export const CSS_VAR_PARTIAL_HIGH = "--blockmap-partial-high";
export const CSS_VAR_PARTIAL = "--blockmap-partial";
export const CSS_VAR_COMPLETE = "--blockmap-complete";
export const CSS_VAR_HIGHLIGHT = "--blockmap-highlight";

export const DEFAULT_THEME = {
  missing: "#2b2b2b",
  partialLow: "#5b3a00",
  partialHigh: "#e0a500",
  partial: "#e0a500",
  complete: "#2ecc71",
  highlight: "#ff4d4f",
} as const;

// Theme re-reads are triggered by these attribute mutations on <html> (a
// class swap, an inline style, a data-theme toggle) and by the colour scheme.
export const THEME_ATTRIBUTES = ["class", "style", "data-theme"] as const;
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

// Interaction tuning: one wheel notch multiplies the view length by 1.25
// (out) or 0.8 (in), a pointer must travel 3px before it counts as a drag
// rather than a click, and MIN_VIEW_LENGTH keeps the view from collapsing
// to zero blocks.
export const ZOOM_STEP = 1.25;
export const DRAG_THRESHOLD_PX = 3;
export const BLINK_INTERVAL_MS = 500;
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const MIN_VIEW_LENGTH = 1;

// Keyboard panning moves the view by a fraction of its own length: 10%
// normally, 50% with Shift held, for a faster traverse of a large view.
export const KEY_PAN_FRACTION = 0.1;
export const KEY_PAN_FRACTION_FAST = 0.5;

// The default aria-label reports a whole percentage, no decimal places.
export const ARIA_LABEL_DEFAULT_PERCENT_DIGITS = 0;

// Describes the canvas's role to assistive tech beyond plain "img", and
// lists the keys a focused, interactive map responds to.
export const ARIA_ROLEDESCRIPTION = "zoomable block map";
export const ARIA_KEYSHORTCUTS = "Plus Minus ArrowLeft ArrowRight Home";

// Axis layout: aim for one tick per 80px, never fewer than two, and treat a
// tick within half that spacing of an edge as needing an edge-aligned label.
export const CSS_VAR_AXIS_COLOR = "--blockmap-axis-color";
export const TICK_SPACING_PX = 80;
export const MIN_TICKS = 2;
export const EDGE_ANCHOR_RATIO = 0.5;
export const DECIMAL_BASE = 10;

// Limits: ranges arrive as flat [start, end] pairs, and block indices must
// stay addressable as unsigned 32-bit integers.
export const RANGE_PAIR = 2;
export const MAX_BLOCKS = 0xffffffff;
