# d3-blockmap

Canvas block map for download progress across millions of opaque blocks. One column per device pixel, D3 colour interpolation, dirty-column blitting once per frame.

## Install

```bash
npm i d3-blockmap
```

## Structure

| Export | From | Purpose |
|---|---|---|
| `createBlockMap(container, options)` | `d3-blockmap` | Vanilla factory. Returns `BlockMap`. |
| `BlockMap`, `BlockMapOptions`, `Progress`, `Theme`, `BlockRangeTuple`, `RangeInput`, `PartialStyle` | `d3-blockmap` | Types. |
| `<BlockMap>` | `d3-blockmap/react` | React wrapper, `forwardRef` to `BlockMapHandle`. |
| `BlockMapProps`, `BlockMapHandle` | `d3-blockmap/react` | Types. |

## Usage

```html
<div id="blocks" style="height: 12px"></div>
```

```ts
import { createBlockMap } from 'd3-blockmap';

const map = createBlockMap(document.querySelector('#blocks')!, {
  totalBlocks: 10_000_000,
  initialBlocks: downloadedSoFar,
});

socket.on('blocks', (indices: Uint32Array) => map.addBlocks(indices));
map.setRanges([[0, 123], [256, 1024]]);
map.getProgress(); // { completed, total }
map.destroy();
```

```tsx
import { useRef } from 'react';
import { BlockMap } from 'd3-blockmap/react';
import type { BlockMapHandle } from 'd3-blockmap/react';

const ref = useRef<BlockMapHandle>(null);
<BlockMap ref={ref} totalBlocks={total} blocks={initial} style={{ height: 12 }} />;
ref.current?.addBlocks(newIndices);
```

A new `blocks` array identity triggers `setBlocks`; keep the reference stable between renders unless the full set changed. `ranges` (`RangeInput`) behaves the same way via `setRanges`. When both `ranges` and `blocks` are given, ranges are applied first and blocks are added on top; any identity change of either prop re-applies the `ranges` snapshot and then adds `blocks` on top again, so keep both references stable between renders. `partial` (`"gradient" | "coverage"`) recreates the underlying instance when its value changes.

## API

### `createBlockMap(container, options)`

| Option | Type | Notes |
|---|---|---|
| `totalBlocks` | `number` | Positive integer. No fixed upper bound; memory is 1 bit per block plus one counter per pixel. |
| `initialBlocks` | `ArrayLike<number>` | Optional. Indices already complete. |
| `initialRanges` | `RangeInput` | Optional. `[start, end)` tuples or a flat `Uint32Array` of pairs. Applied before `initialBlocks`. |
| `partial` | `"gradient" \| "coverage"` | Default `"gradient"`. `"coverage"` blends missing to complete so range edges look crisp. |

Returns:

| Method | Description |
|---|---|
| `setBlocks(indices)` | Replace all state. |
| `setRanges(ranges)` | Replace all state from a snapshot of `[start, end)` tuples. Any sizes, unsorted and overlapping allowed. O(ranges + bins). |
| `addBlocks(indices)` | Add newly completed indices. O(indices). Duplicates and out-of-range skipped. |
| `getProgress()` | `{ completed, total }`. |
| `destroy()` | Remove canvas, tooltip, observers. Idempotent. |

### Theming

Colours are read from CSS custom properties on the container at start and on theme change (`class`, `style`, `data-theme` on `<html>`, or `prefers-color-scheme`).

| Property | Default |
|---|---|
| `--block-missing` | `#2b2b2b` |
| `--block-partial-low` | `#5b3a00` |
| `--block-partial-high` | `#e0a500` |
| `--block-complete` | `#2ecc71` |

Fully missing and fully complete bins use the exact endpoint colours; partial bins interpolate between the two partial colours. `partial: "coverage"` instead interpolates partial bins between `--block-missing` and `--block-complete`, so it relies on those two differing; the two partial colour variables are unused in that style.

#### Tooltip

The tooltip element carries the attribute `data-block-tooltip` and ships unstyled apart from positioning. Style it yourself:

```css
[data-block-tooltip] {
  background: #111;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}
```

### Behaviour

- Bin count equals rendered width in device pixels. Blocks map to bins by `floor(index × binCount / totalBlocks)`.
- When `totalBlocks` is less than the width, each block is drawn as a discrete segment.
- Hovering shows block range, count, and percentage for the column.
- Resize and `devicePixelRatio` changes rebuild bins from the internal bitset in one pass.
- Resize rebuilds bin counts with a byte-level popcount over the bitset, O(totalBlocks / 8 + bins).
- The container is set to `position: relative` if it is static, so the tooltip can be positioned inside it.
- The container must have a height; the canvas fills it via `width: 100%; height: 100%`.
- Range ends are exclusive. Tuples are clamped to the block range; empty or inverted tuples are dropped; overlapping and touching tuples merge.

## Development

```bash
npm test
npm run lint
npm run format
npm run typecheck
npm run build
```
