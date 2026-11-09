# d3-blockmap: incremental range updates

`addRanges` and `removeRanges` apply `[start, end)` tuples on top of the
current state without resending a snapshot, with overlap handled exactly by
the bitset.

## Goals

- `addRanges(ranges)`: mark blocks complete; progress moves by the number
  of blocks that were not already complete. Overlap with existing state or
  among the new tuples never double-counts.
- `removeRanges(ranges)`: mark blocks missing; progress moves by the number
  that were complete.
- Cost O(ranges log ranges + bytes covered / 8 + bins touched); independent
  of totalBlocks. Only touched bins repaint.
- Ranges outside the current view update the bitset and progress but no
  bins, like `addBlocks`.

## Non-goals

- A declarative React prop for incremental updates. `ranges` stays the
  snapshot path; incremental calls go through the handle.

## API

```ts
export type BlockMap = {
  // existing
  addRanges(ranges: RangeInput): void;
  removeRanges(ranges: RangeInput): void;
};
// BlockMapHandle gains "addRanges" | "removeRanges"
```

## Algorithm

For each merged, clamped range `[s, e)`:

- add: `already = bitset.countRange(s, e)`; `bitset.fill(s, e)`;
  `delta += (e − s) − already`.
- remove: `present = bitset.countRange(s, e)`; `bitset.clearRange(s, e)`;
  `delta −= present`.
- bins: for the bins overlapping `[s, e)` clipped to the view, set
  `counts[bin] = countRange(rangeOf(bin))` from the bitset after the
  mutation. Recounting from the source avoids any delta arithmetic. Collect
  those bins as dirty.

Finally `bitset.setCount(count + delta)`.

## Modules

- `src/bitset.ts`: `clearRange(start, end)` mirroring `fill` with masks
  cleared and `bytes.fill(0, …)` for whole bytes.
- `src/bins.ts`: `recount(start, end, countInRange): number[]` clips to the
  view, recounts each overlapping bin, returns the bin indices (empty when
  no overlap or `binCount === 0`).
- `src/state.ts`: `addRanges(input): Uint32Array`, `removeRanges(input):
  Uint32Array` returning dirty bins.
- `src/blockMap.ts`, `src/react/BlockMap.tsx`: pass-through methods with
  the destroyed guard; `renderer.markDirty(dirty)`.
- Demo: the range map sends only growth deltas each tick via `addRanges`
  instead of a full snapshot; Reset still uses `setRanges([])`.
- README: methods, handle, a Behaviour bullet on overlap semantics.

## Testing

- bitset: `clearRange` within a byte, across bytes, whole bytes; count
  unchanged by `clearRange` (callers use `setCount`).
- bins: `recount` returns the touched bins and sets exact counts; clipped to
  view; empty for no overlap.
- state: add overlapping existing blocks and overlapping new tuples → progress
  equals union size; counts equal a fresh `rebuild`; dirty bins exact;
  out-of-view ranges leave bins untouched; remove restores progress and
  counts; remove of missing blocks is a no-op.
- blockMap: `addRanges` repaints only dirty columns (one `putImageData`,
  columns changed); `removeRanges` turns a column back to missing.
- React: handle forwards both.
