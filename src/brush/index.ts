import { createBrushOverlay } from "./overlay";
import type { BrushFactory } from "./types";

/**
 * Brush factory for the `brush` option: a mouse or pen drag selects a block
 * range, kept in block space so it survives zoom, pan and resize.
 */
export const brush: BrushFactory = createBrushOverlay;

export type { BrushFactory, BrushOverlay, BrushOverlayDeps } from "./types";
