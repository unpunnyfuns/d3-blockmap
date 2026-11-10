import type { BlockRange } from "../ranges";
import type { BlockView } from "../view";

export type BrushOverlayDeps = {
  getView(): BlockView;
  getWidth(): number;
  getHeight(): number;
  getTotalBlocks(): number;
  // The canvas's touch-action, mirrored on the overlay so touch reaches the
  // map the same way wherever it lands; an empty string sets nothing.
  touchAction: string;
  onBrush(selection: BlockRange | null): void;
  onBrushEnd(selection: BlockRange | null): void;
};

export type BrushOverlay = {
  update(): void;
  setSelection(selection: BlockRange | null): void;
  getSelection(): BlockRange | null;
  setColor(color: string): void;
  destroy(): void;
};

export type BrushFactory = (container: HTMLElement, deps: BrushOverlayDeps) => BrushOverlay;
