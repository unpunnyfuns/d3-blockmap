# d3-blockmap: x-axis ticks

An opt-in axis under the bar showing block indices, following zoom and
resize, with configurable label format and tick density. Also exposes the
block-to-pixel scale for hosts that render their own axis.

## Goals

- `axis: true` renders tick labels for the current view below the bar.
- Nice tick values (1, 2, 5 × 10^n) via `ticks` from `d3-array`; no
  `d3-scale` dependency.
- Labels default to compact notation (`1.2M`, `450k`); `format` overrides.
- Tick count defaults from width (one per `TICK_SPACING_PX = 80` CSS px);
  `tickCount` overrides.
- Rendered outside the container's height so the bar keeps its size; the
  host leaves room below.
- `getScale()` returns the mapping between block index and CSS px for the
  current view.

## Non-goals

- Minor ticks, grid lines, a y-axis, or label collision avoidance beyond
  the spacing default.
- Changing axis options after creation (recreate instead).

## API

```ts
export type AxisOptions = {
  format?: (block: number) => string;
  tickCount?: number;
};

export type BlockScale = {
  domain: readonly [number, number];
  range: readonly [number, number];
  x(block: number): number;
  block(x: number): number;
};

export type BlockMapOptions = {
  // existing options unchanged
  axis?: boolean | AxisOptions;
};

export type BlockMap = {
  // existing methods unchanged
  getScale(): BlockScale;
};
```

- `axis: true` equals `axis: {}`. `axis: false` or omitted renders nothing.
- `getScale()` works whether or not the axis is enabled. `domain` is
  `[view.start, view.end]`, `range` is `[0, cssWidth]`. `x(block)` is
  linear; `block(x)` is the inverse, unclamped. Before the first layout
  `range` is `[0, 0]` and `x` returns 0.

React:

```tsx
export type BlockMapProps = {
  // existing props unchanged
  axis?: boolean | AxisOptions;
};
```

`axis` joins the create-effect deps. `getScale` joins `BlockMapHandle`.

## Rendering

- Element: `div[data-blockmap-axis]` appended to the container after the
  canvas. Inline style: `position: absolute; left: 0; right: 0; top: 100%;
  pointer-events: none; user-select: none; color:
  var(--blockmap-axis-color, currentColor); font: inherit`. Height is
  whatever the host's CSS gives the tick spans; the default spans carry
  `display: block; position: absolute; top: 0; transform:
  translateX(-50%); white-space: nowrap`.
- Each tick: `span[data-blockmap-tick]` with `style.left = x + "px"`,
  `textContent = format(block)`, and `data-block` set to the index for host
  styling or testing. The first tick is anchored `translateX(0)` and the
  last `translateX(-100%)` when they sit within one spacing of the edges,
  so labels never overflow the container.
- The container already becomes `position: relative` for the tooltip; the
  axis relies on the same.
- Ticks are recomputed on `layout()` (width or DPR change) and on each
  committed view change. The element is rebuilt wholesale (`replaceChildren`)
  because tick count is small (tens).
- When `cssWidth` is 0 or the view length is below the tick count, fewer
  ticks appear; `ticks()` handles that.

## Modules

### `src/axis.ts` (new)

- `computeTicks(view: BlockView, cssWidth: number, tickCount?: number):
  Array<{ block: number; x: number }>`: `count = tickCount ??
  Math.max(MIN_TICKS, Math.floor(cssWidth / TICK_SPACING_PX))` with
  `MIN_TICKS = 2`; `values = ticks(view.start, view.end, count)` from
  `d3-array`, filtered to `view.start <= v <= view.end`; `x = (v −
  view.start) / viewLength(view) × cssWidth`.
- `defaultFormat(block: number): string` via `Intl.NumberFormat("en-US",
  { notation: "compact", maximumFractionDigits: 1 })`.
- `createAxis(container: HTMLElement, options: AxisOptions): Axis` with
  `update(view, cssWidth): void` and `destroy(): void`.
- `createScale(view: BlockView, cssWidth: number): BlockScale`.

### `src/blockMap.ts`

- Resolves `options.axis` to `AxisOptions | undefined`.
- Creates the axis after the tooltip; calls `axis.update(state.view,
  cssWidth)` at the end of `layout()` and inside `commitView` after the
  state change; destroys it in `destroy`.
- `getScale()` returns `createScale(getView(), cssWidth)`.

### `src/constants.ts`

`CSS_VAR_AXIS_COLOR = "--blockmap-axis-color"`, `TICK_SPACING_PX = 80`,
`MIN_TICKS = 2`, `EDGE_ANCHOR_RATIO = 0.5` (ticks within half a spacing of
an edge are edge-anchored).

### `src/react/BlockMap.tsx`

`axis` prop into create options when defined; `getScale` on the handle
with a fallback `{ domain: [0, totalBlocks], range: [0, 0], x: () => 0,
block: () => 0 }`.

### Demo

Third map gets `axis: true`; its section gains `margin-bottom` to leave room
for labels. A fourth tiny example is not needed.

### README

Theming table gains `--blockmap-axis-color`. Options table gains `axis`.
Methods table gains `getScale()`. React props and handle updated.
Behaviour bullet: ticks use nice values and follow the view; the host must
leave space below the bar.

## Dependencies

Add `d3-array` (runtime) and `@types/d3-array` (dev). `d3-array` has no
dependencies.

## Testing

- `axis.test.ts`: `computeTicks` returns nice values inside the view with
  correct `x`; default count from width; explicit `tickCount`; zero width
  gives ticks at x = 0 only or none; narrow view (length 5) gives integer
  ticks; `defaultFormat(1_250_000) === "1.3M"`, `defaultFormat(450_000) ===
  "450K"` (verify the exact casing Intl produces and pin it);
  `createAxis` renders spans with `data-block`, edge anchoring, custom
  `format`, `replaceChildren` on update, `destroy` removes the element;
  `createScale` round-trips `block(x(b)) === b`.
- `blockMap.test.ts`: `axis: true` renders ticks after `triggerResize`,
  updates after `setView` commit, nothing rendered when omitted;
  `getScale()` domain/range after resize and view change.
- `react/BlockMap.test.tsx`: `axis` prop passed as create option; handle
  `getScale` forwards.
