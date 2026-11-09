# d3-blockmap

Canvas progress bar for millions of blocks: one pixel column per bin, drawn from a packed bitset. Zoomable, themable with CSS variables, with an optional axis and a React component.

## Install

```bash
npm i @unpunnyfuns/d3-blockmap
```

Peer dependency for the React component: `react >= 19`.

## Quick start

```ts
import { createBlockMap } from '@unpunnyfuns/d3-blockmap';

const map = createBlockMap(document.querySelector('#progress')!, {
  totalBlocks: 10_000_000,
});

map.addBlocks(newIndices);              // Uint32Array or number[]
map.addRanges([[0, 123], [256, 1024]]); // [start, end) tuples
map.getProgress();                      // { completed, total }
```

The container needs a height; the canvas fills it. Leave a little space below if you turn the axis on.

```tsx
import { useRef, useState } from 'react';
import { BlockMap } from '@unpunnyfuns/d3-blockmap/react';
import type { BlockMapHandle } from '@unpunnyfuns/d3-blockmap/react';

export const Download = ({ totalBlocks }: { totalBlocks: number }) => {
  const ref = useRef<BlockMapHandle>(null);
  const [highlight, setHighlight] = useState(false);

  // Call ref.current?.addRanges(...) from your data source as ranges complete.

  return (
    <>
      <BlockMap ref={ref} totalBlocks={totalBlocks} axis highlight={highlight} style={{ height: 12 }} />
      <button onClick={() => setHighlight((on) => !on)}>Highlight missing</button>
    </>
  );
};
```

## Options

| Option | Type | Default | What it does |
|---|---|---|---|
| `totalBlocks` | `number` | required | Number of blocks, up to 2^32 − 1. |
| `initialBlocks` | `ArrayLike<number>` | | Indices already complete. |
| `initialRanges` | `RangeInput` | | `[start, end)` tuples (or a flat `Uint32Array` of pairs) already complete. |
| `partial` | `"coverage" \| "gradient"` | `"coverage"` | How partly filled columns are coloured. See Theming. |
| `view` | `{ start, end }` | full range | Initial zoom window, `end` exclusive. |
| `interactive` | `boolean` | `true` | Ctrl/⌘+wheel zooms, drag pans, double-click resets. |
| `onViewChange` | `(view) => void` | | Called when the view changes. |
| `axis` | `boolean \| { format?, tickCount? }` | `false` | Tick labels under the bar. |

## Methods

| Method | What it does |
|---|---|
| `setBlocks(indices)` | Replace everything with these indices. |
| `addBlocks(indices)` | Mark indices complete. Cheapest way to add single blocks. |
| `setRanges(ranges)` | Replace everything with a snapshot of ranges. |
| `addRanges(ranges)` | Mark ranges complete. Overlap is fine and counted once. |
| `removeRanges(ranges)` | Mark ranges missing again. |
| `getProgress()` | `{ completed, total }`. |
| `setView(view)` / `resetView()` / `getView()` | Zoom window control. |
| `setHighlight(on)` | Blink incomplete columns. Steady under `prefers-reduced-motion`. |
| `getScale()` | `{ domain, range, x(block), block(x) }` to draw your own axis. |
| `destroy()` | Remove everything. |

Ranges use exclusive ends: `[0, 10]` means blocks 0 through 9. Unsorted, overlapping, and out-of-range input is normalised.

## React

Props mirror the options plus `blocks`, `ranges`, `highlight`, `className`, `style`. `ref` is a plain prop exposing the methods above, except `setBlocks` and `destroy`, as `BlockMapHandle`.

- `blocks` and `ranges` apply when their identity changes, so keep the references stable.
- `partial`, `interactive`, and `axis` recreate the instance when they change; memoise an object `axis`.
- For high-frequency updates use the ref (`addBlocks`, `addRanges`) rather than props.

## Theming

Set these CSS custom properties on the container or an ancestor:

| Property | Default | Used for |
|---|---|---|
| `--blockmap-missing` | `#2b2b2b` | empty columns |
| `--blockmap-complete` | `#2ecc71` | full columns |
| `--blockmap-partial` | `#e0a500` | midpoint of the `coverage` fade |
| `--blockmap-partial-low` / `-high` | `#5b3a00` / `#e0a500` | the `gradient` style |
| `--blockmap-highlight` | `#ff4d4f` | blinking incomplete columns |
| `--blockmap-axis-color` | `currentColor` | tick labels |

`coverage` fades missing → partial → complete by how full a column is, so range edges look crisp. `gradient` fades low → high instead, which shows density when blocks arrive scattered.

The tooltip is a `div[data-blockmap-tooltip]` and ticks are `span[data-blockmap-tick]` inside `div[data-blockmap-axis]`; style them with CSS.

## Notes

- Memory is 1 bit per block plus one counter per pixel column. Updates cost in proportion to what changed, not to `totalBlocks`.
- When the view is narrower than the pixel width, each block is drawn as a discrete segment.
- The axis sits just below the container at `top: 100%`; don't clip it with `overflow: hidden`.

## Development

```bash
npm run verify      # lint, format check, typecheck, tests, build
npm run demo        # serves the repo; open /demo/
```

Tests run in headless Chromium through Vitest browser mode; pure modules run in Node. One-time setup: `npx playwright install chromium`. Shared test fakes live in `src/testing/`.
