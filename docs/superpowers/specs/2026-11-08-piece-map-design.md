# d3-blockmap: piece map design

A D3 v7 + TypeScript component that renders download progress across up to
~10 million opaque blocks as a horizontal canvas bar. Ships as one npm package
with a vanilla factory and a thin React wrapper.

## Goals

- Render completion state for `totalBlocks` blocks, one column per device pixel.
- Incremental updates cost O(new blocks); never redraw more than once per frame.
- Memory: ~1 bit per block (packed bitset) plus one `Uint32` per bin.
- Colours come from CSS custom properties and follow theme changes.
- Leave seams for a multi-row layout, an availability overlay, and moving
  state into a Web Worker. None of those are built now.

## Non-goals

- Byte sizes. Blocks are opaque units; no byte count appears anywhere.
- Hierarchical or multi-row layouts.
- SVG or DOM-per-bin rendering.

## Package

- Name `d3-blockmap`, ESM only, built with tsup, types emitted.
- `exports`: `.` (core) and `./react` (wrapper).
- Dependencies: `d3-scale`, `d3-interpolate`, `d3-color` (not the `d3` bundle).
- Peer dependency: `react >= 18` marked optional.
- Tooling: npm, TypeScript strict, Vitest + happy-dom, oxlint, oxfmt.
- Release: GitHub Actions with npm trusted publishing and provenance.

## Modules (`src/`)

Each module is a factory function returning a plain object. No classes.

### `bitset.ts`

`createBitset(size: number)` over a `Uint8Array` of `ceil(size / 8)` bytes.

- `has(i): boolean`, `set(i): boolean` (returns true if newly set),
  `clear(): void`, `count: number` (maintained incrementally).
- No bounds checking; callers guarantee range.

### `bins.ts`

`createBins(totalBlocks: number, binCount: number)`.

- `counts: Uint32Array` of length `binCount`.
- `binOf(index) = Math.floor(index * binCount / totalBlocks)`.
- `rangeOf(bin): { start, end }` where `end` is exclusive. Derived by
  inverting `binOf`: `start = ceil(bin * totalBlocks / binCount)`,
  `end = ceil((bin + 1) * totalBlocks / binCount)`.
- `sizeOf(bin) = end - start`.
- `rebuild(has: (i) => boolean)`: zeroes counts, single pass over all blocks.

Integer overflow: `index * binCount` stays below 2^53 for the stated ranges
(10M blocks × a few thousand bins), so plain number arithmetic is safe.

### `state.ts`

`createPieceState(totalBlocks: number)` composes bitset and bins. This is the
layout layer and has no DOM or D3 imports so it can later run in a worker.

- `resize(binCount): void` recreates bins and rebuilds from the bitset.
- `add(indices: ArrayLike<number>): Uint32Array` filters out-of-range and
  already-set indices, sets the bit, increments the bin, and returns the
  distinct dirty bin indices.
- `replace(indices): void` clears the bitset and counts, then `add`s.
- `fraction(bin): number` = `counts[bin] / sizeOf(bin)`.
- `progress(): { completed, total }`.
- `binCount: number`, `rangeOf(bin)`, `countOf(bin)` pass-throughs.

Throws `RangeError` if `totalBlocks < 1` or not an integer.

### `colors.ts`

- `readTheme(el: HTMLElement): Theme` reads
  `--piece-missing`, `--piece-partial-low`, `--piece-partial-high`,
  `--piece-complete` via `getComputedStyle`. Falls back to built-in defaults
  for any missing property.
- `createColorScale(theme)` returns `(fraction) => [r, g, b, a]` as a
  `Uint8ClampedArray`:
  - `fraction === 0` → missing, exact.
  - `fraction === 1` → complete, exact.
  - otherwise `interpolateRgb(partialLow, partialHigh)(fraction)`.
  Results are cached in a 256-entry lookup table; partial fractions are
  quantised to that table.
- `watchTheme(el, onChange): () => void` listens to a `MutationObserver` on
  `document.documentElement` (attributes `class`, `style`, `data-theme`) and
  the `prefers-color-scheme` media query. Returns a disposer.

### `renderer.ts`

`createRenderer(canvas: HTMLCanvasElement)`.

- Owns the 2D context and an `ImageData` of `binCount × 1` pixels. The canvas
  is scaled by CSS to the container height; one device row is enough for a
  column fill. (A multi-row layout would change this and is out of scope.)
- `resize(widthPx, heightPx, dpr)` sets canvas backing size and CSS size,
  reallocates `ImageData`.
- `setColors(scale)`.
- `markDirty(bins: ArrayLike<number>)` adds to a `Set<number>` and schedules a
  `requestAnimationFrame` if none is pending.
- `markAllDirty()`.
- On frame: for each dirty bin write 4 bytes at `bin * 4` from the colour
  scale of `fraction(bin)`, then a single `putImageData`. Clear the set.
- Discrete mode: when `totalBlocks < binCount`, each block maps to a span of
  columns `[floor(b * binCount / totalBlocks), floor((b + 1) * binCount / totalBlocks))`
  and is painted missing or complete, never partial. The state layer is
  unchanged; the renderer just paints per block instead of per bin.
- `destroy()` cancels any pending frame.

The renderer takes a `fraction(bin)` accessor and `totalBlocks` from the
caller rather than importing state, so it stays testable with a stub context.

### `tooltip.ts`

`createTooltip(container)` appends one absolutely positioned `div` (hidden
by default) and exposes `show(x, text)`, `hide()`, `destroy()`. Text format:

```
Blocks 1,234,000–1,235,249 · 812 / 1,250 (65.0%)
```

Number formatting uses `Intl.NumberFormat` with `maximumFractionDigits: 1`
for the percentage and default grouping for counts.

### `pieceMap.ts`

`createPieceMap(container: HTMLElement, options: PieceMapOptions)`.

```ts
export type PieceMapOptions = {
  totalBlocks: number;
  initialBlocks?: ArrayLike<number>;
};

export type PieceMap = {
  setBlocks(indices: ArrayLike<number>): void;
  addBlocks(indices: ArrayLike<number>): void;
  getProgress(): { completed: number; total: number };
  destroy(): void;
};
```

Wiring:

1. Create canvas, append to container, create state, renderer, tooltip.
2. `ResizeObserver` on container → `binCount = round(cssWidth × dpr)`,
   `state.resize`, `renderer.resize`, `markAllDirty`.
3. `matchMedia('(resolution: ...)')` listener re-reads `devicePixelRatio` and
   triggers the same path as a resize.
4. `watchTheme` → `readTheme`, `renderer.setColors`, `markAllDirty`.
5. `pointermove` on canvas → bin from `offsetX × dpr`, tooltip text from
   `state.rangeOf`, `countOf`, `sizeOf`. In discrete mode the column maps
   to a single block, `floor(column × totalBlocks / binCount)`, and the
   tooltip shows `Block N · complete|missing`. `pointerleave` → hide.
6. `addBlocks` → `state.add` → `renderer.markDirty(dirty)`.
7. `setBlocks` → `state.replace` → `markAllDirty`.
8. `destroy` disconnects observers, removes listeners, removes canvas and
   tooltip, and turns all methods into no-ops.

### `react/PieceMap.tsx`

```tsx
export type PieceMapProps = {
  totalBlocks: number;
  blocks?: ArrayLike<number>;
  className?: string;
  style?: CSSProperties;
};

export type PieceMapHandle = Pick<PieceMap, 'addBlocks' | 'getProgress'>;
```

- `forwardRef` component rendering a `<div>`; `useImperativeHandle` exposes
  `addBlocks` and `getProgress` for the streaming case.
- Effect on `[totalBlocks]`: create instance, destroy on cleanup.
- Effect on `[blocks]`: `setBlocks(blocks ?? [])` when the prop identity
  changes.

### `index.ts` / `react/index.ts`

Named exports only. Core exports `createPieceMap` and the types. React entry
exports `PieceMap` and its prop/handle types.

## Constants

All in `constants.ts`, ALL_UPPER_CASE: `BITS_PER_BYTE`, `BYTES_PER_PIXEL`,
`COLOR_TABLE_SIZE`, `DEFAULT_THEME`, `THEME_ATTRIBUTES`, `CSS_VAR_*` names.

## Error handling

- Out-of-range, non-integer, and duplicate indices are skipped silently.
- `totalBlocks < 1` throws `RangeError` at construction.
- Missing CSS variables fall back to defaults; no warning.
- A zero-width container (hidden) yields `binCount = 0`; state keeps the
  bitset, rendering is skipped until a non-zero resize.

## Testing

- `bitset`, `bins`, `state`, `colors`: pure unit tests. Cover the floor
  mapping at boundaries (first/last block, bin count not dividing evenly),
  every block counted exactly once across a rebuild, dedupe, range filter,
  `rangeOf` inverting `binOf`.
- `renderer`: stub `CanvasRenderingContext2D` recording `putImageData` and
  inspect the `ImageData` buffer for written columns. Fake rAF to assert
  one paint per frame across many `markDirty` calls. Discrete mode asserts
  span painting.
- `pieceMap`: happy-dom, stubbed `ResizeObserver` and `matchMedia`,
  verifies wiring and `destroy` idempotence.
- `react/PieceMap`: Testing Library mount/unmount, ref handle, prop change.

## Open seams (not built)

- Multi-row: renderer `ImageData` becomes `cols × rows`; state gains a
  2D `binOf`. Current renderer API is sized to allow that swap.
- Availability overlay: a second `Uint32Array` in state and a second colour
  channel or alpha in the renderer.
- Worker: `state.ts` has no DOM or D3 imports; `add` already returns a
  transferable `Uint32Array` of dirty bins.
