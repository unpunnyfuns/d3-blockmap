# CSS Namespace, Zoom View, Highlight Blink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Namespace the CSS hooks as `--blockmap-*`, add a zoomable view window with ctrl+wheel and drag interaction, and add a blinking highlight for incomplete bins.

**Architecture:** Bins become view-relative (`createBins(view, binCount)`), state owns the view and rebuilds via popcount on change, a pure `view.ts` does clamp/zoom/pan math, `interaction.ts` translates DOM events into view changes, and the renderer gains a highlight colour plus a phase toggled by an injectable interval timer. The factory and React wrapper expose the new options and methods.

**Tech Stack:** unchanged (TypeScript strict, Vitest + happy-dom, d3-color, d3-interpolate, tsup).

## Global Constraints

- CSS hooks are `--blockmap-missing`, `--blockmap-partial-low`, `--blockmap-partial-high`, `--blockmap-partial`, `--blockmap-complete`, `--blockmap-highlight`; tooltip attribute `data-blockmap-tooltip`. No `--block-` or `data-block-` strings remain in src, README, or demo.
- A view is `{ start, end }`, `end` exclusive, clamped to `[0, totalBlocks]`, length at least 1. Bins map `binOf(i) = floor((i - start) * binCount / (end - start))`; `rangeOf` returns absolute indices. Discrete mode when `end - start < binCount`.
- `addBlocks` always sets bits; bins change only for indices inside the view. Progress is independent of the view.
- Zoom keeps the block under the cursor at the same column. `ZOOM_STEP = 1.25`. Drag threshold `DRAG_THRESHOLD_PX = 3`. Wheel is intercepted only with ctrl or meta.
- Highlight alternates incomplete bins (`fraction < 1`) between their normal colour and the highlight colour every `BLINK_INTERVAL_MS = 500`; under `prefers-reduced-motion: reduce` the highlight is steady. Complete bins never change.
- `onViewChange` fires only when the view actually changed, not on construction.
- TypeScript strict. Named exports only. `import type` for type-only imports. No `any`. No magic numbers outside `src/constants.ts` (module-local derived constants tolerated). camelCase except constants. Factories not classes. No inline end-of-line comments. Block byte sizes nowhere. All existing tests keep passing except where a step explicitly changes an expectation.
- Run `npm run typecheck && npm run lint && npm run format && npm test` before every commit. Never run `npx biome`.

---

## File Structure

| Path | Change |
|---|---|
| `src/constants.ts` | renamed CSS vars; `CSS_VAR_HIGHLIGHT`, `DEFAULT_THEME.highlight`, `ZOOM_STEP`, `DRAG_THRESHOLD_PX`, `BLINK_INTERVAL_MS`, `REDUCED_MOTION_QUERY`, `MIN_VIEW_LENGTH` |
| `src/view.ts` (new) | `BlockView`, `fullView`, `viewLength`, `sameView`, `clampView`, `zoomView`, `panView` |
| `src/bins.ts` | view-relative bins, `addRange` clips |
| `src/state.ts` | view ownership, `setView`, `getView`, `view` |
| `src/colors.ts` | `Theme.highlight`, `highlightColor` |
| `src/renderer.ts` | `RenderSource.view`, `setHighlight`, phase timer |
| `src/interaction.ts` (new) | wheel, drag, dblclick |
| `src/blockMap.ts`, `src/index.ts` | options, methods, exports |
| `src/react/BlockMap.tsx` | props, handle |
| `src/tooltip.ts` | attribute rename |
| `demo/index.html`, `README.md` | docs and controls |

---

### Task 1: CSS namespace rename

**Files:**
- Modify: `src/constants.ts`, `src/tooltip.ts`, `src/colors.test.ts`, `src/tooltip.test.ts`, `src/blockMap.test.ts`, `README.md`, `demo/index.html`

- [ ] **Step 1: Find every occurrence**

Run: `grep -rn -- "--block-\|data-block-tooltip" src README.md demo | wc -l`
Expected: a non-zero count (these are the lines to change).

- [ ] **Step 2: Rename**

```bash
grep -rl -- "--block-\|data-block-tooltip" src README.md demo | xargs sed -i '' -e 's/--block-/--blockmap-/g' -e 's/data-block-tooltip/data-blockmap-tooltip/g'
```

- [ ] **Step 3: Verify no leftovers and tests pass**

Run: `grep -rn -- "--block-\|data-block-tooltip" src README.md demo | wc -l`
Expected: `0`.
Run: `npm run typecheck && npm run lint && npm run format && npm test`
Expected: 100 passing.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: namespace CSS hooks as --blockmap-* and data-blockmap-tooltip"
```

---

### Task 2: View math and new constants

**Files:**
- Modify: `src/constants.ts`
- Create: `src/view.ts`, `src/view.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type BlockView = { start: number; end: number };
  fullView(totalBlocks: number): BlockView
  viewLength(view: BlockView): number
  sameView(a: BlockView, b: BlockView): boolean
  clampView(view: BlockView, totalBlocks: number): BlockView   // swaps inverted, min length 1, inside [0, totalBlocks]
  zoomView(view: BlockView, anchor: number, factor: number, totalBlocks: number): BlockView
  panView(view: BlockView, deltaBlocks: number, totalBlocks: number): BlockView
  ```
  Constants: `ZOOM_STEP = 1.25`, `DRAG_THRESHOLD_PX = 3`, `BLINK_INTERVAL_MS = 500`, `MIN_VIEW_LENGTH = 1`, `REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"`, `CSS_VAR_HIGHLIGHT = "--blockmap-highlight"`, `DEFAULT_THEME.highlight = "#ff4d4f"`.

- [ ] **Step 1: Constants**

Append to `src/constants.ts`:
```ts
export const CSS_VAR_HIGHLIGHT = "--blockmap-highlight";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const ZOOM_STEP = 1.25;
export const DRAG_THRESHOLD_PX = 3;
export const BLINK_INTERVAL_MS = 500;
export const MIN_VIEW_LENGTH = 1;
```
And add `highlight: "#ff4d4f",` to `DEFAULT_THEME` after `complete`.

- [ ] **Step 2: Failing tests**

`src/view.test.ts`:
```ts
import { clampView, fullView, panView, sameView, viewLength, zoomView } from "./view";

describe("view helpers", () => {
  it("fullView, viewLength, sameView", () => {
    expect(fullView(10)).toEqual({ start: 0, end: 10 });
    expect(viewLength({ start: 3, end: 8 })).toBe(5);
    expect(sameView({ start: 1, end: 2 }, { start: 1, end: 2 })).toBe(true);
    expect(sameView({ start: 1, end: 2 }, { start: 1, end: 3 })).toBe(false);
  });

  it("clampView swaps inverted bounds and enforces a minimum length", () => {
    expect(clampView({ start: 8, end: 3 }, 10)).toEqual({ start: 3, end: 8 });
    expect(clampView({ start: 4, end: 4 }, 10)).toEqual({ start: 4, end: 5 });
    expect(clampView({ start: 9.6, end: 9.6 }, 10)).toEqual({ start: 9, end: 10 });
  });

  it("clampView keeps the view inside the block range", () => {
    expect(clampView({ start: -5, end: 5 }, 10)).toEqual({ start: 0, end: 10 });
    expect(clampView({ start: 7, end: 15 }, 10)).toEqual({ start: 2, end: 10 });
    expect(clampView({ start: -100, end: 100 }, 10)).toEqual({ start: 0, end: 10 });
  });

  it("zoomView keeps the anchor block at the same relative position", () => {
    expect(zoomView({ start: 0, end: 1000 }, 500, 0.5, 1000)).toEqual({ start: 250, end: 750 });
    expect(zoomView({ start: 0, end: 1000 }, 250, 0.5, 1000)).toEqual({ start: 125, end: 625 });
    expect(zoomView({ start: 250, end: 750 }, 500, 2, 1000)).toEqual({ start: 0, end: 1000 });
  });

  it("zoomView clamps to the full range and to one block", () => {
    expect(zoomView({ start: 250, end: 750 }, 500, 10, 1000)).toEqual({ start: 0, end: 1000 });
    expect(zoomView({ start: 10, end: 12 }, 11, 0.1, 1000)).toEqual({ start: 11, end: 12 });
  });

  it("panView shifts and clamps", () => {
    expect(panView({ start: 100, end: 200 }, 50, 1000)).toEqual({ start: 150, end: 250 });
    expect(panView({ start: 100, end: 200 }, -150, 1000)).toEqual({ start: 0, end: 100 });
    expect(panView({ start: 800, end: 900 }, 150, 1000)).toEqual({ start: 900, end: 1000 });
  });
});
```

- [ ] **Step 3: Run, expect failure**

Run: `npx vitest run src/view.test.ts`
Expected: FAIL, cannot resolve `./view`.

- [ ] **Step 4: Implement**

`src/view.ts`:
```ts
import { MIN_VIEW_LENGTH } from "./constants";

export type BlockView = { start: number; end: number };

export const fullView = (totalBlocks: number): BlockView => ({ start: 0, end: totalBlocks });

export const viewLength = (view: BlockView): number => view.end - view.start;

export const sameView = (a: BlockView, b: BlockView): boolean =>
  a.start === b.start && a.end === b.end;

export const clampView = (view: BlockView, totalBlocks: number): BlockView => {
  let start = Math.round(Math.min(view.start, view.end));
  let end = Math.round(Math.max(view.start, view.end));
  if (end - start < MIN_VIEW_LENGTH) end = start + MIN_VIEW_LENGTH;
  const length = Math.min(end - start, totalBlocks);
  start = Math.max(0, Math.min(start, totalBlocks - length));
  return { start, end: start + length };
};

export const zoomView = (
  view: BlockView,
  anchor: number,
  factor: number,
  totalBlocks: number,
): BlockView => {
  const length = viewLength(view);
  const nextLength = Math.max(MIN_VIEW_LENGTH, Math.min(totalBlocks, Math.round(length * factor)));
  const ratio = (anchor - view.start) / length;
  const start = Math.round(anchor - ratio * nextLength);
  return clampView({ start, end: start + nextLength }, totalBlocks);
};

export const panView = (view: BlockView, deltaBlocks: number, totalBlocks: number): BlockView => {
  const length = viewLength(view);
  const start = Math.round(view.start + deltaBlocks);
  return clampView({ start, end: start + length }, totalBlocks);
};
```

- [ ] **Step 5: Run, expect pass**

Run: `npx vitest run src/view.test.ts`
Expected: 6 passing. If `zoomView({10,12}, 11, 0.1, 1000)` yields `{ start: 10, end: 11 }` instead of `{ 11, 12 }`, check the rounding: length 2, nextLength 1, ratio 0.5, start = round(11 − 0.5) = round(10.5) = 11 in JS. Keep the test as written.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "feat: view math helpers and interaction constants"
```

---

### Task 3: View-relative bins

**Files:**
- Modify: `src/bins.ts`, `src/bins.test.ts`, `src/state.ts` (constructor call only)

**Interfaces:**
- Consumes: `BlockView`, `fullView` from `./view`.
- Produces: `createBins(view: BlockView, binCount: number): Bins`; `Bins` gains `readonly view: BlockView`. `addRange(start, end)` clips to the view and is a no-op with no overlap. `rebuild(countInRange)` passes absolute ranges.

- [ ] **Step 1: Update existing tests and add new ones**

In `src/bins.test.ts`, add at the top after the import:
```ts
const full = (totalBlocks: number) => ({ start: 0, end: totalBlocks });
```
Replace every `createBins(N, M)` with `createBins(full(N), M)`. Then append inside `describe("createBins", ...)`:
```ts
  it("maps indices relative to a view offset", () => {
    const bins = createBins({ start: 100, end: 110 }, 3);
    expect([100, 103, 104, 106, 107, 109].map(bins.binOf)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(bins.rangeOf(1)).toEqual({ start: 104, end: 107 });
    expect(bins.sizeOf(0)).toBe(4);
    expect(bins.view).toEqual({ start: 100, end: 110 });
  });

  it("addRange clips to the view", () => {
    const bins = createBins({ start: 100, end: 110 }, 3);
    bins.addRange(95, 105);
    expect(Array.from(bins.counts)).toEqual([4, 1, 0]);
    bins.addRange(0, 50);
    bins.addRange(110, 200);
    expect(Array.from(bins.counts)).toEqual([4, 1, 0]);
  });

  it("rebuild asks for absolute ranges", () => {
    const bins = createBins({ start: 100, end: 110 }, 3);
    const asked: Array<[number, number]> = [];
    bins.rebuild((s, e) => {
      asked.push([s, e]);
      return 1;
    });
    expect(asked).toEqual([
      [100, 104],
      [104, 107],
      [107, 110],
    ]);
    expect(Array.from(bins.counts)).toEqual([1, 1, 1]);
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/bins.test.ts`
Expected: FAIL (type/arity errors, `bins.view` undefined).

- [ ] **Step 3: Implement**

Replace `src/bins.ts` with:
```ts
import type { BlockView } from "./view";

export type BlockRange = { start: number; end: number };

export type Bins = {
  readonly view: BlockView;
  readonly binCount: number;
  readonly counts: Uint32Array;
  binOf(index: number): number;
  rangeOf(bin: number): BlockRange;
  sizeOf(bin: number): number;
  rebuild(countInRange: (start: number, end: number) => number): void;
  addRange(start: number, end: number): void;
};

export const createBins = (view: BlockView, binCount: number): Bins => {
  const { start: viewStart, end: viewEnd } = view;
  const length = viewEnd - viewStart;
  const counts = new Uint32Array(binCount);
  const binOf = (index: number): number => Math.floor(((index - viewStart) * binCount) / length);
  const rangeOf = (bin: number): BlockRange => ({
    start: viewStart + Math.ceil((bin * length) / binCount),
    end: viewStart + Math.ceil(((bin + 1) * length) / binCount),
  });
  const sizeOf = (bin: number): number => {
    const { start, end } = rangeOf(bin);
    return end - start;
  };

  return {
    view,
    binCount,
    counts,
    binOf,
    rangeOf,
    sizeOf,
    rebuild: (countInRange) => {
      counts.fill(0);
      if (binCount === 0) return;
      for (let bin = 0; bin < binCount; bin += 1) {
        const { start, end } = rangeOf(bin);
        counts[bin] = countInRange(start, end);
      }
    },
    addRange: (rawStart, rawEnd) => {
      const start = Math.max(rawStart, viewStart);
      const end = Math.min(rawEnd, viewEnd);
      if (binCount === 0 || end <= start) return;
      const first = binOf(start);
      const last = binOf(end - 1);
      if (first === last) {
        counts[first] += end - start;
        return;
      }
      counts[first] += rangeOf(first).end - start;
      for (let bin = first + 1; bin < last; bin += 1) counts[bin] += sizeOf(bin);
      counts[last] += end - rangeOf(last).start;
    },
  };
};
```

In `src/state.ts`, add `import { fullView } from "./view";` and change both `createBins(totalBlocks, …)` calls to `createBins(fullView(totalBlocks), …)`.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/bins.test.ts src/state.test.ts`
Expected: all passing (bins 14, state unchanged).

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "feat: view-relative bins with clipped addRange"
```

---

### Task 4: State owns the view

**Files:**
- Modify: `src/state.ts`, `src/state.test.ts`

**Interfaces:**
- Consumes: `clampView`, `fullView`, `sameView`, `BlockView`.
- Produces on `BlockState`: `readonly view: BlockView`; `setView(view: BlockView): boolean` (returns whether it changed; ignores non-finite input); `getView(): BlockView` (copy).

- [ ] **Step 1: Failing tests**

Append inside `describe("createBlockState", ...)` in `src/state.test.ts`:
```ts
  it("defaults to the full view", () => {
    const state = createBlockState(100);
    expect(state.getView()).toEqual({ start: 0, end: 100 });
  });

  it("setView rebuilds bins over the window", () => {
    const state = createBlockState(100);
    state.resize(5);
    state.replaceRanges([[0, 50]]);
    expect(state.setView({ start: 40, end: 60 })).toBe(true);
    expect(state.getView()).toEqual({ start: 40, end: 60 });
    expect([0, 1, 2, 3, 4].map(state.countOf)).toEqual([4, 4, 2, 0, 0]);
    expect(state.rangeOf(0)).toEqual({ start: 40, end: 44 });
    expect(state.progress().completed).toBe(50);
  });

  it("setView ignores same, inverted and non-finite input appropriately", () => {
    const state = createBlockState(100);
    state.resize(5);
    expect(state.setView({ start: 0, end: 100 })).toBe(false);
    expect(state.setView({ start: 60, end: 40 })).toBe(true);
    expect(state.getView()).toEqual({ start: 40, end: 60 });
    expect(state.setView({ start: Number.NaN, end: 10 })).toBe(false);
    expect(state.getView()).toEqual({ start: 40, end: 60 });
  });

  it("add outside the view sets bits and progress but not bins", () => {
    const state = createBlockState(100);
    state.resize(5);
    state.setView({ start: 40, end: 60 });
    const dirty = state.add([10, 45]);
    expect(Array.from(dirty)).toEqual([1]);
    expect(state.has(10)).toBe(true);
    expect(state.progress().completed).toBe(2);
    expect([0, 1, 2, 3, 4].map(state.countOf)).toEqual([0, 1, 0, 0, 0]);
  });

  it("replaceRanges under a view clips bins but keeps full progress", () => {
    const state = createBlockState(100);
    state.resize(5);
    state.setView({ start: 40, end: 60 });
    state.replaceRanges([[0, 44], [58, 100]]);
    expect([0, 1, 2, 3, 4].map(state.countOf)).toEqual([4, 0, 0, 0, 2]);
    expect(state.progress().completed).toBe(86);
  });

  it("resize keeps the current view", () => {
    const state = createBlockState(100);
    state.setView({ start: 40, end: 60 });
    state.resize(4);
    expect(state.rangeOf(3)).toEqual({ start: 55, end: 60 });
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/state.test.ts`
Expected: FAIL, `state.getView is not a function`.

- [ ] **Step 3: Implement**

In `src/state.ts`:
- Imports: replace the `fullView` import with `import { clampView, fullView, sameView } from "./view";` and `import type { BlockView } from "./view";`.
- Add to `BlockState`: `readonly view: BlockView; setView(view: BlockView): boolean; getView(): BlockView;`.
- After `const bitset = …`: `let view: BlockView = fullView(totalBlocks); let bins: Bins = createBins(view, 0);`
- Add `const inView = (index: number): boolean => index >= view.start && index < view.end;`
- In `add`, change `if (!hasBins) continue;` to `if (!hasBins || !inView(index)) continue;`.
- `resize: (binCount) => { bins = createBins(view, binCount); bins.rebuild(bitset.countRange); }`.
- Add to the returned object:
```ts
    get view() {
      return view;
    },
    setView: (next) => {
      if (!Number.isFinite(next.start) || !Number.isFinite(next.end)) return false;
      const clamped = clampView(next, totalBlocks);
      if (sameView(clamped, view)) return false;
      view = clamped;
      bins = createBins(view, bins.binCount);
      bins.rebuild(bitset.countRange);
      return true;
    },
    getView: () => ({ ...view }),
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/state.test.ts src/scale.test.ts`
Expected: all passing (state 20).

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "feat: state view window with setView and getView"
```

---

### Task 5: Highlight colour and renderer phase, view-aware discrete mode

**Files:**
- Modify: `src/colors.ts`, `src/colors.test.ts`, `src/renderer.ts`, `src/renderer.test.ts`

**Interfaces:**
- Consumes: `BlockView`, `CSS_VAR_HIGHLIGHT`, `BLINK_INTERVAL_MS`, `BYTES_PER_PIXEL`, `OPAQUE_ALPHA`.
- Produces:
  ```ts
  // colors.ts
  Theme.highlight: string
  highlightColor(theme: Theme): Uint8ClampedArray   // 4 bytes RGBA
  // renderer.ts
  type RenderSource = { readonly binCount; readonly view: BlockView; fraction(bin); has(index) };
  type IntervalTimer = { set(callback: () => void, ms: number): number; clear(id: number): void };
  Renderer.setHighlight(on: boolean, color: Uint8ClampedArray, blink: boolean): void
  createRenderer(ctx, source, scheduler = RAF_SCHEDULER, timer = WINDOW_TIMER)
  ```
  `RenderSource` no longer has `totalBlocks`; discrete mode uses `viewLength(view) < binCount` and `has(view.start + block)`.

- [ ] **Step 1: Colour tests**

In `src/colors.test.ts`, add `highlight: "#00ff00"` to the `theme` fixture and append a describe:
```ts
describe("highlightColor", () => {
  it("returns RGBA bytes for the highlight colour", () => {
    expect(Array.from(highlightColor(theme))).toEqual([0, 255, 0, 255]);
  });

  it("falls back to the default when unparsable", () => {
    expect(Array.from(highlightColor({ ...theme, highlight: "nope" }))).toEqual(
      Array.from(highlightColor({ ...theme, highlight: DEFAULT_THEME.highlight })),
    );
  });
});
```
Import `highlightColor` from `./colors`.

- [ ] **Step 2: Renderer tests**

In `src/renderer.test.ts`: add `highlight: "#00ff00"` to the theme fixture; add a manual timer helper after `createManualScheduler`:
```ts
const createManualTimer = () => {
  const timers = new Map<number, () => void>();
  let next = 1;
  const cleared: number[] = [];
  const timer: IntervalTimer = {
    set: (callback) => {
      const id = next;
      next += 1;
      timers.set(id, callback);
      return id;
    },
    clear: (id) => {
      cleared.push(id);
      timers.delete(id);
    },
  };
  const tick = () => timers.forEach((callback) => callback());
  return { timer, tick, cleared, active: () => timers.size };
};
```
Import `IntervalTimer` with the other renderer types and `highlightColor` from `./colors`. In the "skips painting with zero bins" test, change the stub source to `{ binCount: 0, view: { start: 0, end: 10 }, fraction: () => 0, has: () => false }`. Append tests:
```ts
  it("highlight paints incomplete bins with the highlight colour while phase is on", () => {
    const state = createBlockState(10);
    state.resize(5);
    state.add([0, 1, 4]);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const { timer, tick, active } = createManualTimer();
    const renderer = createRenderer(ctx, state, scheduler, timer);
    renderer.setColors(createColorScale(theme));
    renderer.setHighlight(true, highlightColor(theme), true);
    flush();
    let image = puts.at(-1) as ImageDataLike;
    expect(pixel(image, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(image, 1)).toEqual([0, 255, 0, 255]);
    expect(pixel(image, 2)).toEqual([0, 255, 0, 255]);
    expect(active()).toBe(1);
    tick();
    flush();
    image = puts.at(-1) as ImageDataLike;
    expect(pixel(image, 1)).toEqual([0, 0, 0, 255]);
    expect(pixel(image, 2)).not.toEqual([0, 255, 0, 255]);
    renderer.setHighlight(false, highlightColor(theme), true);
    expect(active()).toBe(0);
    flush();
    expect(pixel(puts.at(-1) as ImageDataLike, 1)).toEqual([0, 0, 0, 255]);
  });

  it("highlight without blink is steady and starts no timer", () => {
    const state = createBlockState(10);
    state.resize(5);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const { timer, active } = createManualTimer();
    const renderer = createRenderer(ctx, state, scheduler, timer);
    renderer.setColors(createColorScale(theme));
    renderer.setHighlight(true, highlightColor(theme), false);
    flush();
    expect(active()).toBe(0);
    expect(pixel(puts.at(-1) as ImageDataLike, 3)).toEqual([0, 255, 0, 255]);
    renderer.destroy();
  });

  it("discrete mode paints over the view and highlights missing blocks", () => {
    const state = createBlockState(100);
    state.resize(9);
    state.setView({ start: 50, end: 53 });
    state.add([51]);
    const { ctx, puts } = createStubContext();
    const { scheduler, flush } = createManualScheduler();
    const { timer } = createManualTimer();
    const renderer = createRenderer(ctx, state, scheduler, timer);
    renderer.setColors(createColorScale(theme));
    flush();
    let image = puts.at(-1) as ImageDataLike;
    expect([0, 3, 6].map((c) => pixel(image, c))).toEqual([
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);
    renderer.setHighlight(true, highlightColor(theme), false);
    flush();
    image = puts.at(-1) as ImageDataLike;
    expect(pixel(image, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(image, 3)).toEqual([255, 255, 255, 255]);
  });

  it("destroy clears the blink timer", () => {
    const state = createBlockState(10);
    state.resize(5);
    const { ctx } = createStubContext();
    const { scheduler } = createManualScheduler();
    const { timer, active } = createManualTimer();
    const renderer = createRenderer(ctx, state, scheduler, timer);
    renderer.setColors(createColorScale(theme));
    renderer.setHighlight(true, highlightColor(theme), true);
    expect(active()).toBe(1);
    renderer.destroy();
    expect(active()).toBe(0);
  });
```

- [ ] **Step 3: Run, expect failure**

Run: `npx vitest run src/colors.test.ts src/renderer.test.ts`
Expected: FAIL (`highlightColor` missing, `setHighlight` missing, type errors on `RenderSource`).

- [ ] **Step 4: Implement colours**

In `src/colors.ts`: import `CSS_VAR_HIGHLIGHT`; add `highlight: string` to `Theme`; add `highlight: CSS_VAR_HIGHLIGHT` to `THEME_VARS`; add `highlight: read("highlight")` in `readTheme`; append:
```ts
export const highlightColor = (theme: Theme): Uint8ClampedArray => {
  const color = rgb(parseOr(theme.highlight, DEFAULT_THEME.highlight));
  return Uint8ClampedArray.of(color.r, color.g, color.b, OPAQUE_ALPHA);
};
```

- [ ] **Step 5: Implement renderer**

Replace `src/renderer.ts` with:
```ts
import type { ColorScale } from "./colors";
import { BLINK_INTERVAL_MS, BYTES_PER_PIXEL, CANVAS_ROWS } from "./constants";
import { viewLength } from "./view";
import type { BlockView } from "./view";

export type ImageDataLike = {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
};

export type Canvas2dLike = {
  createImageData(width: number, height: number): ImageDataLike;
  putImageData(image: ImageDataLike, dx: number, dy: number): void;
};

export type RenderSource = {
  readonly binCount: number;
  readonly view: BlockView;
  fraction(bin: number): number;
  has(index: number): boolean;
};

export type Scheduler = {
  request(callback: () => void): number;
  cancel(handle: number): void;
};

export type IntervalTimer = {
  set(callback: () => void, ms: number): number;
  clear(id: number): void;
};

export type Renderer = {
  setColors(scale: ColorScale): void;
  setHighlight(on: boolean, color: Uint8ClampedArray, blink: boolean): void;
  markDirty(bins: ArrayLike<number>): void;
  markAllDirty(): void;
  destroy(): void;
};

const NO_FRAME = 0;
const NO_TIMER = 0;
const COMPLETE = 1;

export const RAF_SCHEDULER: Scheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export const WINDOW_TIMER: IntervalTimer = {
  set: (callback, ms) => window.setInterval(callback, ms),
  clear: (id) => window.clearInterval(id),
};

export const createRenderer = (
  ctx: Canvas2dLike,
  source: RenderSource,
  scheduler: Scheduler = RAF_SCHEDULER,
  timer: IntervalTimer = WINDOW_TIMER,
): Renderer => {
  let image: ImageDataLike | undefined;
  let scale: ColorScale | undefined;
  let frame = NO_FRAME;
  let scheduled = false;
  let allDirty = false;
  let highlight: Uint8ClampedArray | undefined;
  let phase = false;
  let blinkId = NO_TIMER;
  const dirty = new Set<number>();

  const ensureImage = (): ImageDataLike | undefined => {
    const { binCount } = source;
    if (binCount === 0) return undefined;
    if (!image || image.width !== binCount) {
      image = ctx.createImageData(binCount, CANVAS_ROWS);
      allDirty = true;
    }
    return image;
  };

  const colorFor = (colors: ColorScale, fraction: number): Uint8ClampedArray =>
    highlight && phase && fraction < COMPLETE ? highlight : colors(fraction);

  const writeColumn = (target: ImageDataLike, column: number, color: Uint8ClampedArray): void => {
    target.data.set(color, column * BYTES_PER_PIXEL);
  };

  const paintDiscrete = (target: ImageDataLike, colors: ColorScale): void => {
    const { view, binCount } = source;
    const length = viewLength(view);
    for (let block = 0; block < length; block += 1) {
      const color = colorFor(colors, source.has(view.start + block) ? COMPLETE : 0);
      const start = Math.floor((block * binCount) / length);
      const end = Math.floor(((block + 1) * binCount) / length);
      for (let column = start; column < end; column += 1) writeColumn(target, column, color);
    }
  };

  const paintBins = (target: ImageDataLike, colors: ColorScale): void => {
    if (allDirty) {
      for (let bin = 0; bin < source.binCount; bin += 1)
        writeColumn(target, bin, colorFor(colors, source.fraction(bin)));
      return;
    }
    for (const bin of dirty) {
      if (bin >= target.width) continue;
      writeColumn(target, bin, colorFor(colors, source.fraction(bin)));
    }
  };

  const paint = (): void => {
    scheduled = false;
    frame = NO_FRAME;
    const target = ensureImage();
    if (!target || !scale) {
      dirty.clear();
      allDirty = false;
      return;
    }
    if (viewLength(source.view) < source.binCount) paintDiscrete(target, scale);
    else paintBins(target, scale);
    ctx.putImageData(target, 0, 0);
    dirty.clear();
    allDirty = false;
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    frame = scheduler.request(paint);
  };

  const markAllDirty = (): void => {
    allDirty = true;
    schedule();
  };

  const stopBlink = (): void => {
    if (blinkId !== NO_TIMER) timer.clear(blinkId);
    blinkId = NO_TIMER;
  };

  return {
    setColors: (next) => {
      scale = next;
      markAllDirty();
    },
    setHighlight: (on, color, blink) => {
      stopBlink();
      highlight = on ? color : undefined;
      phase = on;
      if (on && blink) {
        blinkId = timer.set(() => {
          phase = !phase;
          markAllDirty();
        }, BLINK_INTERVAL_MS);
      }
      markAllDirty();
    },
    markDirty: (bins) => {
      for (let i = 0; i < bins.length; i += 1) dirty.add(bins[i]);
      if (bins.length > 0) schedule();
    },
    markAllDirty,
    destroy: () => {
      stopBlink();
      if (scheduled) scheduler.cancel(frame);
      scheduled = false;
      frame = NO_FRAME;
      dirty.clear();
    },
  };
};
```

Note: `window.setInterval` returns `0` only never in browsers (ids start at 1), so `NO_TIMER = 0` is a safe sentinel.

- [ ] **Step 6: Run, expect pass**

Run: `npx vitest run src/colors.test.ts src/renderer.test.ts`
Expected: all passing (colours 11, renderer 11). `src/blockMap.ts` will fail typecheck until Task 7 because `state` still satisfies `RenderSource` (it has `view`), so typecheck should actually pass; if `npm run typecheck` reports `totalBlocks` usage in `blockMap.ts`'s tooltip code, that is pre-existing code using `state.totalBlocks` directly, not `RenderSource`, and is fine.

- [ ] **Step 7: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "feat: renderer highlight phase and view-aware discrete mode"
```

---

### Task 6: Pointer and wheel interaction

**Files:**
- Create: `src/interaction.ts`, `src/interaction.test.ts`

**Interfaces:**
- Consumes: `zoomView`, `panView`, `viewLength`, `BlockView`, `ZOOM_STEP`, `DRAG_THRESHOLD_PX`.
- Produces:
  ```ts
  type InteractionDeps = {
    getView(): BlockView; setView(view: BlockView): void; resetView(): void;
    getBinCount(): number; getDpr(): number; getTotalBlocks(): number;
    onDragStart(): void; onDragEnd(): void;
  };
  attachInteraction(canvas: HTMLCanvasElement, deps: InteractionDeps): () => void
  ```

- [ ] **Step 1: Failing tests**

`src/interaction.test.ts`:
```ts
import { attachInteraction } from "./interaction";
import type { InteractionDeps } from "./interaction";

const PRIMARY_BUTTON = 0;

const createDeps = (view = { start: 0, end: 1000 }) => {
  const calls: Array<{ start: number; end: number }> = [];
  const deps: InteractionDeps = {
    getView: () => view,
    setView: (next) => {
      calls.push(next);
      view = next;
    },
    resetView: vi.fn(),
    getBinCount: () => 100,
    getDpr: () => 1,
    getTotalBlocks: () => 1000,
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  };
  return { deps, calls };
};

const fire = (
  target: EventTarget,
  type: string,
  init: Record<string, unknown>,
  props: Record<string, unknown> = {},
) => {
  const Ctor = type === "wheel" ? WheelEvent : MouseEvent;
  const event = new Ctor(type, { bubbles: true, cancelable: true, ...init });
  Object.entries(props).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  target.dispatchEvent(event);
  return event;
};

describe("attachInteraction", () => {
  it("ctrl+wheel zooms around the cursor and prevents default", () => {
    const canvas = document.createElement("canvas");
    const { deps, calls } = createDeps();
    attachInteraction(canvas, deps);
    const event = fire(canvas, "wheel", { ctrlKey: true, deltaY: -100 }, { offsetX: 50 });
    expect(event.defaultPrevented).toBe(true);
    expect(calls).toEqual([{ start: 100, end: 900 }]);
  });

  it("plain wheel is ignored", () => {
    const canvas = document.createElement("canvas");
    const { deps, calls } = createDeps();
    attachInteraction(canvas, deps);
    const event = fire(canvas, "wheel", { deltaY: -100 }, { offsetX: 50 });
    expect(event.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it("drag past the threshold pans and reports start and end", () => {
    const canvas = document.createElement("canvas");
    const { deps, calls } = createDeps({ start: 100, end: 200 });
    attachInteraction(canvas, deps);
    fire(canvas, "pointerdown", { button: PRIMARY_BUTTON }, { offsetX: 50, pointerId: 1 });
    fire(canvas, "pointermove", {}, { offsetX: 51, pointerId: 1 });
    expect(deps.onDragStart).not.toHaveBeenCalled();
    fire(canvas, "pointermove", {}, { offsetX: 60, pointerId: 1 });
    expect(deps.onDragStart).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toEqual({ start: 90, end: 190 });
    fire(canvas, "pointerup", {}, { pointerId: 1 });
    expect(deps.onDragEnd).toHaveBeenCalledTimes(1);
    expect(canvas.style.cursor).toBe("");
  });

  it("double click resets and dispose removes listeners", () => {
    const canvas = document.createElement("canvas");
    const { deps, calls } = createDeps();
    const dispose = attachInteraction(canvas, deps);
    fire(canvas, "dblclick", {});
    expect(deps.resetView).toHaveBeenCalledTimes(1);
    dispose();
    fire(canvas, "wheel", { ctrlKey: true, deltaY: -100 }, { offsetX: 50 });
    fire(canvas, "dblclick", {});
    expect(calls).toEqual([]);
    expect(deps.resetView).toHaveBeenCalledTimes(1);
  });
});
```

Zoom trace for the first test: view 0..1000, 100 bins, offsetX 50 → anchor 500, deltaY < 0 → factor 1/1.25 = 0.8 → length 800, start = 500 − 0.5·800 = 100 → `{100, 900}`. Drag trace: dx = +10 px over 100 bins of a 100-block view → −10 blocks → `{90, 190}`.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/interaction.test.ts`
Expected: FAIL, cannot resolve `./interaction`.

- [ ] **Step 3: Implement**

`src/interaction.ts`:
```ts
import { DRAG_THRESHOLD_PX, ZOOM_STEP } from "./constants";
import { panView, viewLength, zoomView } from "./view";
import type { BlockView } from "./view";

export type InteractionDeps = {
  getView(): BlockView;
  setView(view: BlockView): void;
  resetView(): void;
  getBinCount(): number;
  getDpr(): number;
  getTotalBlocks(): number;
  onDragStart(): void;
  onDragEnd(): void;
};

const PRIMARY_BUTTON = 0;
const GRABBING = "grabbing";
const NO_POINTER = -1;

type DragState = { downX: number; view: BlockView; pointerId: number; active: boolean };

export const attachInteraction = (canvas: HTMLCanvasElement, deps: InteractionDeps): (() => void) => {
  let drag: DragState | undefined;

  const columnsToBlocks = (px: number, view: BlockView): number =>
    ((px * deps.getDpr()) / deps.getBinCount()) * viewLength(view);

  const onWheel = (event: WheelEvent): void => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (deps.getBinCount() === 0) return;
    event.preventDefault();
    const view = deps.getView();
    const anchor = view.start + columnsToBlocks(event.offsetX, view);
    const factor = event.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    deps.setView(zoomView(view, anchor, factor, deps.getTotalBlocks()));
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== PRIMARY_BUTTON) return;
    drag = { downX: event.offsetX, view: deps.getView(), pointerId: event.pointerId ?? NO_POINTER, active: false };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag) return;
    const dx = event.offsetX - drag.downX;
    if (!drag.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      if (typeof canvas.setPointerCapture === "function" && drag.pointerId !== NO_POINTER) {
        canvas.setPointerCapture(drag.pointerId);
      }
      canvas.style.cursor = GRABBING;
      deps.onDragStart();
    }
    if (deps.getBinCount() === 0) return;
    deps.setView(panView(drag.view, -columnsToBlocks(dx, drag.view), deps.getTotalBlocks()));
  };

  const endDrag = (): void => {
    if (!drag) return;
    if (drag.active) {
      if (typeof canvas.releasePointerCapture === "function" && drag.pointerId !== NO_POINTER) {
        canvas.releasePointerCapture(drag.pointerId);
      }
      canvas.style.cursor = "";
      deps.onDragEnd();
    }
    drag = undefined;
  };

  const onDblClick = (): void => deps.resetView();

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("dblclick", onDblClick);

  return () => {
    endDrag();
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", endDrag);
    canvas.removeEventListener("pointercancel", endDrag);
    canvas.removeEventListener("dblclick", onDblClick);
  };
};
```

If happy-dom's `releasePointerCapture` throws for an uncaptured pointer, wrap those two calls in `try { … } catch { /* no capture */ }`—but a block comment would violate the comment rule; instead guard with `canvas.hasPointerCapture?.(drag.pointerId)` when available.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/interaction.test.ts`
Expected: 4 passing. If `event.pointerId` is undefined on a `MouseEvent` in happy-dom, the `?? NO_POINTER` fallback handles it.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "feat: wheel zoom, drag pan and double-click reset interaction"
```

---

### Task 7: Factory wiring

**Files:**
- Modify: `src/blockMap.ts`, `src/blockMap.test.ts`, `src/index.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  ```ts
  type BlockMapOptions = { totalBlocks; initialBlocks?; initialRanges?; partial?; view?: BlockView; interactive?: boolean; onViewChange?: (view: BlockView) => void };
  type BlockMap = { setBlocks; setRanges; addBlocks; setView(view: BlockView): void; resetView(): void; getView(): BlockView; setHighlight(on: boolean): void; getProgress; destroy };
  ```
  `src/index.ts` also exports type `BlockView`.

- [ ] **Step 1: Failing tests**

In `src/blockMap.test.ts`, change the `matchMedia` stub to return `matches: false` as well:
```ts
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    addEventListener: (_type: string, listener: () => void) => {
      mediaListeners.push({ query, listener });
    },
    removeEventListener: (_type: string) => {
      removed.push(query);
    },
  }));
```
Append inside `describe("createBlockMap", ...)`:
```ts
  it("setView repaints and reports changes only when the view changes", () => {
    const container = mount();
    const onViewChange = vi.fn();
    const map = createBlockMap(container, { totalBlocks: 1000, onViewChange });
    triggerResize(50);
    const before = puts.length;
    map.setView({ start: 100, end: 200 });
    expect(map.getView()).toEqual({ start: 100, end: 200 });
    expect(onViewChange).toHaveBeenCalledWith({ start: 100, end: 200 });
    expect(puts.length).toBe(before + 1);
    map.setView({ start: 100, end: 200 });
    expect(onViewChange).toHaveBeenCalledTimes(1);
    map.resetView();
    expect(map.getView()).toEqual({ start: 0, end: 1000 });
    expect(onViewChange).toHaveBeenCalledTimes(2);
    map.destroy();
  });

  it("applies an initial view without reporting it", () => {
    const container = mount();
    const onViewChange = vi.fn();
    const map = createBlockMap(container, {
      totalBlocks: 1000,
      view: { start: 10, end: 20 },
      onViewChange,
    });
    expect(map.getView()).toEqual({ start: 10, end: 20 });
    expect(onViewChange).not.toHaveBeenCalled();
    map.destroy();
  });

  it("ctrl+wheel zooms by default and does nothing when interactive is false", () => {
    const zoomable = mount();
    const map = createBlockMap(zoomable, { totalBlocks: 1000 });
    triggerResize(50);
    const canvas = zoomable.querySelector("canvas") as HTMLCanvasElement;
    const wheel = new WheelEvent("wheel", { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true });
    Object.defineProperty(wheel, "offsetX", { value: 25 });
    canvas.dispatchEvent(wheel);
    expect(map.getView()).toEqual({ start: 100, end: 900 });
    map.destroy();

    const fixed = mount();
    const still = createBlockMap(fixed, { totalBlocks: 1000, interactive: false });
    triggerResize(50);
    const canvas2 = fixed.querySelector("canvas") as HTMLCanvasElement;
    const wheel2 = new WheelEvent("wheel", { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true });
    Object.defineProperty(wheel2, "offsetX", { value: 25 });
    canvas2.dispatchEvent(wheel2);
    expect(still.getView()).toEqual({ start: 0, end: 1000 });
    still.destroy();
  });

  it("setHighlight paints incomplete bins with the highlight colour and starts a blink timer", () => {
    const setInterval = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    triggerResize(5);
    map.addBlocks([0]);
    map.setHighlight(true);
    const image = puts.at(-1) as ImageData;
    expect(Array.from(image.data.subarray(0, 4))).toEqual([46, 204, 113, 255]);
    expect(Array.from(image.data.subarray(4, 8))).toEqual([255, 77, 79, 255]);
    expect(setInterval).toHaveBeenCalledTimes(1);
    map.setHighlight(false);
    expect(clearInterval).toHaveBeenCalledTimes(1);
    map.destroy();
  });

  it("highlight is steady under reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduced-motion"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const setInterval = vi.spyOn(window, "setInterval");
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 10 });
    triggerResize(5);
    map.setHighlight(true);
    expect(setInterval).not.toHaveBeenCalled();
    expect(Array.from((puts.at(-1) as ImageData).data.subarray(0, 4))).toEqual([255, 77, 79, 255]);
    map.destroy();
  });

  it("tooltip shows absolute block ranges under a view", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 1000, view: { start: 500, end: 600 } });
    triggerResize(5);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const tooltip = container.querySelector("[data-blockmap-tooltip]") as HTMLElement;
    const move = new MouseEvent("pointermove", { bubbles: true });
    Object.defineProperty(move, "offsetX", { value: 0 });
    canvas.dispatchEvent(move);
    expect(tooltip.textContent).toBe("Blocks 500–509 · 0 / 10 (0%)");
    map.destroy();
  });
```

Zoom trace: 50 CSS px × DPR 2 = 100 bins; offsetX 25 → column 50 → anchor 500; factor 0.8 → `{100, 900}`. Highlight bytes: default complete `#2ecc71` = [46, 204, 113], default highlight `#ff4d4f` = [255, 77, 79].

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/blockMap.test.ts`
Expected: FAIL (`setView`, `setHighlight` missing, `view` option unknown).

- [ ] **Step 3: Implement**

In `src/blockMap.ts`:

Imports:
```ts
import { createColorScale, highlightColor, readTheme, watchTheme } from "./colors";
import type { PartialStyle, Theme } from "./colors";
import { CANVAS_ROWS, REDUCED_MOTION_QUERY } from "./constants";
import { attachInteraction } from "./interaction";
import { createRenderer } from "./renderer";
import type { Renderer } from "./renderer";
import type { RangeInput } from "./ranges";
import { createBlockState } from "./state";
import type { Progress } from "./state";
import { createTooltip, formatBinTooltip, formatBlockTooltip } from "./tooltip";
import { fullView, viewLength } from "./view";
import type { BlockView } from "./view";
```

Types:
```ts
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

Inside `createBlockMap`, after `const state = …`: `if (options.view) state.setView(options.view);`

After `let dprMedia …` add:
```ts
  let theme: Theme = readTheme(container);
  let highlightOn = false;
  let dragging = false;

  const blinkAllowed = (): boolean => !matchMedia(REDUCED_MOTION_QUERY).matches;

  const applyHighlight = (): void => {
    renderer.setHighlight(highlightOn, highlightColor(theme), blinkAllowed());
  };

  const applyTheme = (): void => {
    theme = readTheme(container);
    renderer.setColors(createColorScale(theme, options.partial));
    if (highlightOn) applyHighlight();
  };

  const setView = (view: BlockView): void => {
    if (!state.setView(view)) return;
    renderer.markAllDirty();
    options.onViewChange?.(state.getView());
  };
  const resetView = (): void => setView(fullView(state.totalBlocks));
```
Remove the old `applyTheme` definition.

Tooltip handler becomes:
```ts
  const onPointerMove = (event: PointerEvent): void => {
    if (dragging) return;
    const { binCount, view } = state;
    if (binCount === 0) return;
    const column = Math.min(binCount - 1, Math.max(0, Math.floor(event.offsetX * dpr)));
    const length = viewLength(view);
    const text =
      length < binCount
        ? formatBlockTooltip(
            view.start + Math.floor((column * length) / binCount),
            state.has(view.start + Math.floor((column * length) / binCount)),
          )
        : formatBinTooltip(state.rangeOf(column), state.countOf(column));
    tooltip.show(event.offsetX, text);
  };
```
(Compute the block once into a `const block` inside a small helper `discreteBlock(column)` if you prefer; keep behaviour identical.)

After the listeners are attached and before `applyTheme()`:
```ts
  const detachInteraction =
    options.interactive === false
      ? undefined
      : attachInteraction(canvas, {
          getView: () => state.view,
          setView,
          resetView,
          getBinCount: () => state.binCount,
          getDpr: () => dpr,
          getTotalBlocks: () => state.totalBlocks,
          onDragStart: () => {
            dragging = true;
            tooltip.hide();
          },
          onDragEnd: () => {
            dragging = false;
          },
        });
```

Returned object additions:
```ts
    setView: (view) => {
      if (destroyed) return;
      setView(view);
    },
    resetView: () => {
      if (destroyed) return;
      resetView();
    },
    getView: () => state.getView(),
    setHighlight: (on) => {
      if (destroyed) return;
      highlightOn = on;
      applyHighlight();
    },
```
In `destroy`, call `detachInteraction?.();` before `renderer.destroy()`.

`src/index.ts`: add `export type { BlockView } from "./view";`.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/blockMap.test.ts`
Expected: all passing (existing + 6). If the highlight test's first pixel is not `[46, 204, 113, 255]`, check that happy-dom returns empty strings for the CSS variables so `DEFAULT_THEME` applies; the earlier discrete-mode test in this file already relies on that.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "feat: view, interaction and highlight on createBlockMap"
```

---

### Task 8: React props and handle

**Files:**
- Modify: `src/react/BlockMap.tsx`, `src/react/BlockMap.test.tsx`

**Interfaces:**
- Produces: `BlockMapProps` gains `view?: BlockView`, `interactive?: boolean`, `onViewChange?: (view: BlockView) => void`, `highlight?: boolean`. `BlockMapHandle = Pick<BlockMapInstance, "addBlocks" | "setRanges" | "setView" | "resetView" | "getView" | "setHighlight" | "getProgress">`. `interactive` joins the create-effect deps; `onViewChange` is forwarded through a ref; `createBlockMap` is always passed an `onViewChange` function.

- [ ] **Step 1: Update tests**

In `src/react/BlockMap.test.tsx`: extend `createInstance` with `setView: vi.fn(), resetView: vi.fn(), getView: vi.fn(() => ({ start: 0, end: 0 })), setHighlight: vi.fn(),`. In the first test, change the exact-args assertion to:
```tsx
    expect(spy).toHaveBeenCalledWith(
      container.firstElementChild,
      expect.objectContaining({ totalBlocks: 10, onViewChange: expect.any(Function) }),
    );
    expect(spy.mock.calls[0][1]).not.toHaveProperty("partial");
```
In the "passes partial … recreates" test, change both exact-args assertions to `expect.objectContaining({ totalBlocks: 10, partial: "coverage" })` and `expect.objectContaining({ totalBlocks: 10, partial: "gradient" })`. Append:
```tsx
  it("applies view and highlight props and forwards the latest onViewChange without recreating", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValue(instance);
    const first = vi.fn();
    const second = vi.fn();
    const view = { start: 1, end: 5 };
    const { rerender } = render(
      <BlockMap totalBlocks={10} view={view} highlight onViewChange={first} />,
    );
    expect(instance.setView).toHaveBeenCalledWith(view);
    expect(instance.setHighlight).toHaveBeenCalledWith(true);
    rerender(<BlockMap totalBlocks={10} view={view} highlight onViewChange={second} />);
    expect(spy).toHaveBeenCalledTimes(1);
    const passed = spy.mock.calls[0][1].onViewChange as (v: { start: number; end: number }) => void;
    passed({ start: 2, end: 3 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ start: 2, end: 3 });
    rerender(<BlockMap totalBlocks={10} view={view} highlight={false} onViewChange={second} />);
    expect(instance.setHighlight).toHaveBeenLastCalledWith(false);
    spy.mockRestore();
  });

  it("recreates when interactive changes and exposes view methods on the handle", () => {
    const a = createInstance();
    const b = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValueOnce(a).mockReturnValueOnce(b);
    const ref = createRef<BlockMapHandle>();
    const { rerender } = render(<BlockMap ref={ref} totalBlocks={10} />);
    rerender(<BlockMap ref={ref} totalBlocks={10} interactive={false} />);
    expect(a.destroy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[1][1]).toMatchObject({ interactive: false });
    act(() => ref.current?.setView({ start: 0, end: 2 }));
    act(() => ref.current?.resetView());
    act(() => ref.current?.setHighlight(true));
    expect(b.setView).toHaveBeenCalledWith({ start: 0, end: 2 });
    expect(b.resetView).toHaveBeenCalledTimes(1);
    expect(b.setHighlight).toHaveBeenCalledWith(true);
    expect(ref.current?.getView()).toEqual({ start: 0, end: 0 });
    spy.mockRestore();
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/react/BlockMap.test.tsx`
Expected: FAIL (unknown props, handle methods missing).

- [ ] **Step 3: Implement**

Replace `src/react/BlockMap.tsx` with:
```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties } from "react";
import type { PartialStyle } from "../colors";
import { createBlockMap } from "../blockMap";
import type { BlockMap as BlockMapInstance, BlockMapOptions } from "../blockMap";
import type { RangeInput } from "../ranges";
import type { BlockView } from "../view";

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

const EMPTY_BLOCKS: readonly number[] = [];
const EMPTY_PROGRESS = { completed: 0, total: 0 };
const EMPTY_VIEW: BlockView = { start: 0, end: 0 };

export const BlockMap = forwardRef<BlockMapHandle, BlockMapProps>(
  (
    { totalBlocks, blocks, ranges, partial, view, interactive, onViewChange, highlight, className, style },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<BlockMapInstance>(null);
    const onViewChangeRef = useRef(onViewChange);
    onViewChangeRef.current = onViewChange;

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return undefined;
      const options: BlockMapOptions = {
        totalBlocks,
        onViewChange: (next) => onViewChangeRef.current?.(next),
      };
      if (partial) options.partial = partial;
      if (interactive !== undefined) options.interactive = interactive;
      const instance = createBlockMap(container, options);
      instanceRef.current = instance;
      return () => {
        instance.destroy();
        instanceRef.current = null;
      };
    }, [totalBlocks, partial, interactive]);

    useEffect(() => {
      const instance = instanceRef.current;
      if (!instance) return;
      if (ranges !== undefined) {
        instance.setRanges(ranges);
        if (blocks !== undefined) instance.addBlocks(blocks);
        return;
      }
      instance.setBlocks(blocks ?? EMPTY_BLOCKS);
    }, [totalBlocks, partial, interactive, ranges, blocks]);

    useEffect(() => {
      if (view !== undefined) instanceRef.current?.setView(view);
    }, [totalBlocks, partial, interactive, view]);

    useEffect(() => {
      instanceRef.current?.setHighlight(highlight ?? false);
    }, [totalBlocks, partial, interactive, highlight]);

    useImperativeHandle(
      ref,
      () => ({
        addBlocks: (indices) => instanceRef.current?.addBlocks(indices),
        setRanges: (next) => instanceRef.current?.setRanges(next),
        setView: (next) => instanceRef.current?.setView(next),
        resetView: () => instanceRef.current?.resetView(),
        getView: () => instanceRef.current?.getView() ?? EMPTY_VIEW,
        setHighlight: (on) => instanceRef.current?.setHighlight(on),
        getProgress: () =>
          instanceRef.current?.getProgress() ?? { ...EMPTY_PROGRESS, total: totalBlocks },
      }),
      [totalBlocks],
    );

    return <div ref={containerRef} className={className} style={style} />;
  },
);

BlockMap.displayName = "BlockMap";
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/react/BlockMap.test.tsx`
Expected: all passing (existing 7 + 2). Output must be pristine (no act warnings).

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "feat: React view, interactive, onViewChange and highlight props"
```

---

### Task 9: Demo and README

**Files:**
- Modify: `demo/index.html`, `README.md`

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: success; `grep -c setHighlight dist/index.d.ts` ≥ 1.

- [ ] **Step 2: Demo**

In `demo/index.html`:
- Add `--blockmap-highlight: #ff4d4f;` to the dark theme block and `--blockmap-highlight: #d4380d;` to the light block.
- Replace the buttons paragraph with:
```html
<p>
  <button id="toggle">Pause</button>
  <button id="theme">Toggle theme</button>
  <button id="reset">Reset</button>
  <button id="highlight">Highlight incomplete</button>
  <button id="reset-view">Reset view</button>
</p>
<p class="label">Ctrl+wheel (or pinch) zooms around the cursor, drag pans, double-click resets. <span id="view"></span></p>
```
- In the script: give the third map `onViewChange: (view) => { document.querySelector("#view").textContent = \`View ${fmt.format(view.start)}–${fmt.format(view.end - 1)}\`; }`. Add:
```js
const maps = [big, small, rangeMap];
let highlighted = false;
document.querySelector("#highlight").onclick = (e) => {
  highlighted = !highlighted;
  maps.forEach((map) => map.setHighlight(highlighted));
  e.target.textContent = highlighted ? "Stop highlight" : "Highlight incomplete";
};
document.querySelector("#reset-view").onclick = () => maps.forEach((map) => map.resetView());
```

- [ ] **Step 3: Verify in the browser**

A static server may already be running on port 4173 (`curl -s -o /dev/null -w "%{http_code}" http://localhost:4173/demo/`); start `npm run demo` only if it is not. If Playwright browser tools are available: load the page, dispatch a ctrl+wheel on the third canvas, confirm the view label changes and the bar re-renders; click "Highlight incomplete" and screenshot to `demo/screenshot-ranges.png` after ~600 ms. Otherwise state that verification was skipped.

- [ ] **Step 4: README**

- Theming table: rename all variables to `--blockmap-*` (Task 1 did this; verify) and add `--blockmap-highlight` default `#ff4d4f` with "Blink colour for incomplete bins while highlight is on."
- Options table rows:
```
| `view` | `BlockView` | Optional. Initial `{ start, end }` window in block indices, `end` exclusive. |
| `interactive` | `boolean` | Default `true`. Ctrl+wheel or pinch zooms around the cursor, drag pans, double-click resets. |
| `onViewChange` | `(view: BlockView) => void` | Called after the view changes by API or interaction. |
```
- Methods rows:
```
| `setView(view)` | Clamp and apply a view window; repaints and calls `onViewChange` if it changed. |
| `resetView()` | Back to the full range. |
| `getView()` | Current `{ start, end }`. |
| `setHighlight(on)` | Blink every incomplete bin between its colour and `--blockmap-highlight` at 2 Hz. Steady under `prefers-reduced-motion`. |
```
- React section: document `view`, `interactive`, `onViewChange`, `highlight` props and the extended handle. Note that `interactive` recreates the instance.
- Behaviour bullets: "Zooming keeps the block under the cursor at the same column; the view is clamped to the block range with a minimum of one block." and "Bins are computed over the current view, so zooming far enough in switches to discrete per-block segments."

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "docs: zoom and highlight in demo and README"
```

---

## Self-review notes

- Spec coverage: rename (T1), view math + constants (T2), view-relative bins (T3), state view (T4), highlight colour + renderer phase + view-aware discrete (T5), interaction (T6), factory wiring + exports (T7), React (T8), demo + README (T9).
- Type names consistent: `BlockView`, `IntervalTimer`, `InteractionDeps`, `setHighlight(on, color, blink)` on the renderer vs `setHighlight(on)` on the factory.
- Traces: zoom `{0,1000}` anchor 500 factor 0.8 → `{100,900}`; drag +10 px over 100 bins of a 100-block view → −10 blocks.
