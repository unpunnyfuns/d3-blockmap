# d3-blockmap: CSS namespace, zoom view, highlight blink

Three changes to the block map: namespaced CSS hooks, a zoomable view
window with built-in wheel and drag interaction, and a blinking highlight
for incomplete bins.

## 1. CSS namespace

`--block-*` can collide with host styles. Rename every public CSS hook:

| Old | New |
|---|---|
| `--block-missing` | `--blockmap-missing` |
| `--block-partial-low` | `--blockmap-partial-low` |
| `--block-partial-high` | `--blockmap-partial-high` |
| `--block-partial` | `--blockmap-partial` |
| `--block-complete` | `--blockmap-complete` |
| `data-block-tooltip` | `data-blockmap-tooltip` |

Plus the new `--blockmap-highlight` (default `#ff4d4f`). Constants,
tests, README, and demo all change. No TypeScript identifiers change.

## 2. Zoom view

### Semantics

- A view is `{ start: number; end: number }` in block indices, `end`
  exclusive, clamped to `[0, totalBlocks]`, with `end - start >= 1`.
  Default is the full range.
- Bins are computed over the view: `binOf(i) = floor((i - start) *
  binCount / (end - start))` for `start <= i < end`; indices outside the
  view are not binned. `rangeOf(bin)` returns absolute indices:
  `start + ceil(bin * length / binCount)` to `start + ceil((bin + 1) *
  length / binCount)`.
- Discrete mode triggers when `end - start < binCount`.
- `addBlocks` always sets bits; it increments a bin only for indices inside
  the view. `replaceRanges` clips each merged range to the view before
  `addRange`. Resize and view change rebuild via `countRange` over the view,
  O(length / 8 + bins).
- Progress is unaffected by the view.

### API

```ts
export type BlockView = { start: number; end: number };

export type BlockMapOptions = {
  totalBlocks: number;
  initialBlocks?: ArrayLike<number>;
  initialRanges?: RangeInput;
  partial?: PartialStyle;
  view?: BlockView;
  interactive?: boolean;
  onViewChange?: (view: BlockView) => void;
};

export type BlockMap = {
  setBlocks(indices: ArrayLike<number>): void;
  setRanges(ranges: RangeInput): void;
  addBlocks(indices: ArrayLike<number>): void;
  setView(view: BlockView): void;
  resetView(): void;
  getView(): BlockView;
  setHighlight(on: boolean): void;
  getProgress(): Progress;
  destroy(): void;
};
```

`setView` clamps and normalises (`start < end`), applies, repaints, and
calls `onViewChange` only if the view actually changed. `resetView` is
`setView({ start: 0, end: totalBlocks })`.

### Interaction (`interactive` default `true`)

- **Wheel with ctrl or meta** (trackpad pinch arrives as ctrl+wheel):
  zoom around the cursor. `factor = deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP`
  with `ZOOM_STEP = 1.25`. The block under the cursor keeps its column:
  `anchor = start + (offsetX * dpr / binCount) * length`,
  `newLength = clamp(round(length * factor), 1, totalBlocks)`,
  `newStart = round(anchor - (anchor - start) * newLength / length)`, then
  clamp so the view stays inside the block range. `preventDefault` on the
  wheel event only when the modifier is held.
- **Drag**: on `pointerdown` capture the pointer, remember `offsetX` and
  the view. On `pointermove` with capture, pan by
  `round((downX - offsetX) * dpr / binCount * length)` blocks, clamped.
  Tooltip hidden while dragging; the cursor is `grabbing`. On
  `pointerup`/`pointercancel` release.
- **Double-click**: `resetView()`.
- A drag threshold of `DRAG_THRESHOLD_PX = 3` avoids treating a click as a
  pan.

### Tooltip

Unchanged in format. Column to block mapping uses `rangeOf`, which is
already absolute; discrete mode uses `start + floor(column * length /
binCount)`.

### React

```tsx
export type BlockMapProps = {
  totalBlocks: number;
  blocks?: ArrayLike<number>;
  ranges?: RangeInput;
  partial?: PartialStyle;
  view?: BlockView;
  interactive?: boolean;
  onViewChange?: (view: BlockView) => void;
  highlight?: boolean;
  className?: string;
  style?: CSSProperties;
};

export type BlockMapHandle = Pick<
  BlockMapInstance,
  "addBlocks" | "setRanges" | "setView" | "resetView" | "getView" | "setHighlight" | "getProgress"
>;
```

- `view` prop applies `setView` when its identity changes. `onViewChange`
  is forwarded via a ref so the instance is not recreated when the callback
  identity changes. `interactive` is a creation option (joins the create
  effect deps). `highlight` applies `setHighlight` when it changes.

## 3. Highlight blink

- `setHighlight(on)`. While on, each bin with `fraction < 1` alternates
  between its normal colour and `--blockmap-highlight` every
  `BLINK_INTERVAL_MS = 500`. Complete bins never change. In discrete mode,
  missing blocks alternate the same way.
- Renderer: `setHighlight(on: boolean, color: Uint8ClampedArray)` and an
  internal `phase` flag. A `setInterval` toggles `phase` and calls
  `markAllDirty`; cleared when highlight is turned off or on `destroy`.
  When painting with `phase` on, incomplete columns use the highlight
  colour; otherwise the normal scale.
- Reduced motion: when `matchMedia("(prefers-reduced-motion: reduce)")`
  matches at the time highlight is turned on, no interval is started and
  `phase` stays on, so incomplete bins show the highlight colour steadily.
- Theme changes re-read `--blockmap-highlight`.

## Modules

- `src/constants.ts`: renamed CSS vars, `CSS_VAR_HIGHLIGHT`,
  `DEFAULT_THEME.highlight`, `ZOOM_STEP`, `DRAG_THRESHOLD_PX`,
  `BLINK_INTERVAL_MS`, `REDUCED_MOTION_QUERY`.
- `src/bins.ts`: `createBins(view: BlockView, binCount)` replaces
  `createBins(totalBlocks, binCount)`. `binOf`, `rangeOf`, `sizeOf`,
  `rebuild`, `addRange` all relative to the view; `addRange` clips to the
  view and returns early when there is no overlap. Exposes `view`.
- `src/state.ts`: holds `view`; `setView(view)` normalises, recreates bins,
  rebuilds; `getView()`; `add` checks `inView(index)` before binning;
  `replaceRanges` passes merged pairs through `bins.addRange` (which clips).
  Exposes `view` for the renderer and tooltip.
- `src/renderer.ts`: `RenderSource` gains `view: BlockView`; discrete mode
  uses `view.end - view.start`; `has(view.start + block)`. Adds
  `setHighlight(on, color)` and the phase timer. Timer injection: accept an
  optional `interval: { set(cb, ms): number; clear(id): void }` for tests,
  defaulting to `setInterval`/`clearInterval`.
- `src/colors.ts`: `Theme.highlight`, read from `--blockmap-highlight`;
  `highlightColor(theme): Uint8ClampedArray` helper.
- `src/view.ts` (new, pure): `clampView(view, totalBlocks): BlockView`,
  `zoomView(view, anchorBlock, factor, totalBlocks)`, `panView(view,
  deltaBlocks, totalBlocks)`, `viewLength(view)`, `sameView(a, b)`.
- `src/interaction.ts` (new): `attachInteraction(canvas, deps): dispose`
  where `deps = { getView, setView, resetView, getBinCount, getDpr,
  getTotalBlocks, onDragStart, onDragEnd }`. Wheel, pointer, dblclick
  handlers with pointer capture and the drag threshold.
- `src/blockMap.ts`: options and methods above; wires interaction when
  `interactive !== false`; `applyTheme` also passes the highlight colour;
  `onViewChange` invoked from `setView` on actual change.
- `src/react/BlockMap.tsx`: props and handle above.
- `demo/index.html`: renamed vars; "Highlight incomplete" and "Reset view"
  buttons; a hint line about ctrl+wheel and drag.
- `README.md`: renamed vars, new options, methods, props, interaction.

## Error handling

- `setView` with non-finite numbers is ignored. Inverted views are
  normalised by swapping. Zero-length views are widened to one block.
- Wheel events without a modifier are not intercepted, so page scroll works.

## Testing

- `view.test.ts`: clamp, swap, min length, zoom keeps anchor column, zoom
  clamps at edges and at full range, pan clamps.
- `bins.test.ts`: view-relative `binOf`/`rangeOf` with offset; `addRange`
  clipping (partially overlapping and fully outside); `rebuild` with offset.
- `state.test.ts`: `setView` rebuild via `countRange`; `add` outside view
  leaves counts untouched but sets bits and progress; `replaceRanges` under
  a view; `getView` default and after set; discrete under narrow view.
- `renderer.test.ts`: highlight on paints incomplete columns with the
  highlight colour when phase is on and normal when off; interval toggles
  phase and repaints; off clears the interval; discrete highlight; destroy
  clears.
- `interaction.test.ts`: ctrl+wheel zooms around the cursor; plain wheel
  ignored; drag past threshold pans and hides tooltip; dblclick resets;
  dispose removes listeners.
- `blockMap.test.ts`: `setView` repaint and `onViewChange` only on change;
  `interactive: false` attaches nothing; `setHighlight` repaint; reduced
  motion steady; CSS var rename assertions.
- `react/BlockMap.test.tsx`: `view`, `highlight` props, handle methods,
  `onViewChange` ref forwarding without recreate.
