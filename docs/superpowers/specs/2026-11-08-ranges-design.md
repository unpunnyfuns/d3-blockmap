# d3-blockmap: range snapshots and coverage rendering

Extends the piece map with a range-based input path and an anti-aliased
partial style so contiguous download runs render as crisp segments at
any scale.

## Goals

- Accept the downloaded set as a snapshot of `[start, end)` tuples of any
  size, e.g. `[[0, 123], [256, 1024], ...]`, replacing all state.
- Update cost O(ranges log ranges + bins), never O(totalBlocks) on the
  counting path. The bitset is still kept in sync via byte-level fills so
  `addBlocks`, `has`, and the tooltip keep working on one model.
- Optional `partial: "coverage"` style that blends missing toward complete
  by fraction, so a range edge inside a pixel reads as an anti-aliased
  rectangle edge rather than an amber band.

## Non-goals

- Incremental range updates (`addRanges`). Snapshot only.
- Returning ranges (`getRanges`).
- Changing the under-width discrete mode.

## API

```ts
export type BlockRangeTuple = readonly [start: number, end: number];
export type RangeInput = ArrayLike<BlockRangeTuple> | Uint32Array;

export type PieceMapOptions = {
  totalBlocks: number;
  initialBlocks?: ArrayLike<number>;
  initialRanges?: RangeInput;
  partial?: "gradient" | "coverage";
};

export type PieceMap = {
  setBlocks(indices: ArrayLike<number>): void;
  setRanges(ranges: RangeInput): void;
  addBlocks(indices: ArrayLike<number>): void;
  getProgress(): Progress;
  destroy(): void;
};
```

- A `Uint32Array` is interpreted as flat pairs `[s0, e0, s1, e1, ...]`. An
  odd length ignores the trailing element.
- `end` is exclusive. Tuples with `end <= start` after clamping are dropped.
- `partial` defaults to `"gradient"`. If both `initialBlocks` and
  `initialRanges` are given, ranges are applied first, then blocks added.

React:

```tsx
export type PieceMapProps = {
  totalBlocks: number;
  blocks?: ArrayLike<number>;
  ranges?: RangeInput;
  partial?: "gradient" | "coverage";
  className?: string;
  style?: CSSProperties;
};
```

`ranges` and `blocks` are both applied when their identity changes, ranges
first. `partial` is a creation option, so changing it recreates the
instance (it joins `totalBlocks` in the create-effect deps).

## Modules

### `src/ranges.ts` (new)

Pure, no DOM.

- `normalizeRanges(input: RangeInput, totalBlocks: number): Uint32Array`
  returns flat sorted, merged, clamped pairs. Steps: read tuples or pairs,
  clamp `start` to `>= 0` and `end` to `<= totalBlocks`, drop non-integer
  or empty, sort by start, merge when `next.start <= current.end`
  (touching ranges merge). Output is a fresh `Uint32Array` of even length.
- `rangesLength(flat: Uint32Array): number` sum of `end - start`.

### `src/bitset.ts`

- Add `fill(start: number, end: number): void` setting bits in `[start,
  end)`. Partial head byte, `bytes.fill(0xff)` for whole bytes, partial
  tail byte. Does not update `count` (callers that use `fill` set the
  count explicitly via a new `setCount(n)`), because a merged range list
  knows its total length without scanning. Precondition: bitset is clear
  and ranges do not overlap, which `normalizeRanges` guarantees.

### `src/bins.ts`

- Add `addRange(start: number, end: number): void` incrementing counts:
  `first = binOf(start)`, `last = binOf(end - 1)`. If `first === last`,
  `counts[first] += end - start`. Otherwise head bin gets
  `rangeOf(first).end - start`, bins strictly between get `sizeOf(bin)`,
  tail bin gets `end - rangeOf(last).start`. O(bins touched).

### `src/state.ts`

- `replaceRanges(input: RangeInput): void`: `flat = normalizeRanges(...)`,
  `bitset.clear()`, for each pair `bitset.fill`, `bitset.setCount(
  rangesLength(flat))`, `bins.counts.fill(0)`, for each pair
  `bins.addRange` when `binCount > 0`.
- `resize` is unchanged; it rebuilds from the bitset. That is still a
  single O(totalBlocks) pass and only runs on width changes.

### `src/colors.ts`

- `createColorScale(theme, partial: PartialStyle = "gradient")`. For
  `"coverage"` the partial band interpolates `theme.missing` to
  `theme.complete` with `interpolateRgb`. Endpoints remain exact and the
  1..254 clamp still applies, so a 99.99% bin is one table step away from
  complete rather than identical.

### `src/pieceMap.ts`

- Reads `options.partial`, passes it to `createColorScale` on every theme
  application.
- `setRanges` → `state.replaceRanges` → `renderer.markAllDirty()`.
- Applies `initialRanges` then `initialBlocks` at construction.

### `src/react/PieceMap.tsx`

- `ranges` and `partial` props as above. Effect on `[totalBlocks, partial]`
  creates; effect on `[totalBlocks, partial, ranges, blocks]` applies
  `setRanges(ranges ?? [])` when `ranges` is defined, then
  `setBlocks(blocks ?? [])` only when `blocks` is defined, so passing only
  `ranges` does not wipe them with an empty `setBlocks`. When neither is
  defined, call `setBlocks([])`.

### `src/index.ts`

Also exports `BlockRangeTuple`, `RangeInput`, `PartialStyle`.

### Demo

Third section: 10M blocks, a few hundred runs of random lengths that grow
and merge over time, delivered as a fresh snapshot each tick through
`setRanges`, rendered with `partial: "coverage"`.

### README

Document `setRanges`, `initialRanges`, `partial`, the React props, and the
exclusive-end convention.

## Error handling

- Out-of-range portions of a tuple are clamped, not rejected.
- Non-integer or NaN endpoints drop the tuple.
- Overlapping and touching tuples merge silently.

## Testing

- `ranges.test.ts`: empty input; single tuple; unsorted input; overlapping
  and touching merges; clamping at both ends; dropped inverted and
  non-integer tuples; flat `Uint32Array` input; odd-length flat input.
- `bitset.test.ts`: `fill` across byte boundaries and within one byte;
  `setCount`.
- `bins.test.ts`: `addRange` within one bin, spanning two, spanning many
  with full middle bins; result equals `rebuild` over the same set.
- `state.test.ts`: `replaceRanges` counts, progress, `has` inside and
  outside ranges, followed by `addBlocks` dedupe against a range.
- `colors.test.ts`: coverage style interpolates missing to complete, 0.5
  lies between them, endpoints exact, near-endpoints distinct.
- `pieceMap.test.ts`: `setRanges` progress and repaint; `initialRanges`
  then `initialBlocks` ordering; `partial: "coverage"` paints a half bin
  with a colour between missing and complete.
- `react/PieceMap.test.tsx`: `ranges` prop applies `setRanges`; `blocks`
  undefined does not call `setBlocks`; `partial` change recreates.

## Implementation notes

- The API was renamed from `PieceMap` to `BlockMap` to match the package
  name; all types and factories above ship as `BlockMap*`.
- The React wrapper applies `addBlocks` (not `setBlocks`) after `setRanges`
  when both the `ranges` and `blocks` props are given, so the blocks on top
  of a ranges snapshot are additive rather than a full replace.
- `coverage` is the default `partial` style; `gradient` is opt-in.
- `totalBlocks` is capped at 2^32 − 1 since indices are stored as unsigned
  32-bit values.
- `BlockMapHandle` exposes an imperative `setRanges` for high-frequency
  snapshot updates outside the `ranges` prop.
