# Incremental Ranges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `addRanges` and `removeRanges` apply `[start, end)` tuples on top of current state with exact overlap handling and partial repaint.

**Architecture:** Bitset gains `clearRange`; bins gain `recount` (recompute touched bins from the bitset, clipped to the view); state composes them into `addRanges`/`removeRanges` returning dirty bins; factory and React handle pass through; the demo switches to delta updates.

**Tech Stack:** unchanged.

## Global Constraints

- Progress after `addRanges` increases by exactly the number of blocks that were not already complete; after `removeRanges` decreases by exactly the number that were complete. Bin counts always equal a fresh `rebuild` over the same bitset.
- Only bins overlapping the (view-clipped) ranges are touched and returned as dirty. `binCount === 0` or no overlap → empty dirty array.
- Cost independent of totalBlocks: O(ranges log ranges + bytes covered / 8 + bins touched).
- TypeScript strict. Named exports only. `import type`. No `any`. No magic numbers outside `src/constants.ts`. camelCase except constants. Factories not classes. No inline end-of-line comments. All 169 existing tests keep passing.
- Run `npm run typecheck && npm run lint && npm run format && npm test` before every commit. Never run `npx biome`.

---

### Task 1: `bitset.clearRange` and `bins.recount`

**Files:**
- Modify: `src/bitset.ts`, `src/bitset.test.ts`, `src/bins.ts`, `src/bins.test.ts`

**Interfaces:**
- Produces: `Bitset.clearRange(start: number, end: number): void` (does not change `count`); `Bins.recount(start: number, end: number, countInRange: (s: number, e: number) => number): number[]` returning touched bin indices in ascending order.

- [ ] **Step 1: Failing tests**

Append inside `describe("createBitset", ...)` in `src/bitset.test.ts`:
```ts
  it("clearRange clears a span across byte boundaries without touching neighbours", () => {
    const bits = createBitset(24);
    bits.fill(0, 24);
    bits.clearRange(5, 19);
    for (let i = 0; i < 24; i += 1) expect(bits.has(i)).toBe(i < 5 || i >= 19);
  });

  it("clearRange within one byte and whole bytes", () => {
    const bits = createBitset(16);
    bits.fill(0, 16);
    bits.clearRange(2, 5);
    expect([1, 2, 4, 5].map(bits.has)).toEqual([true, false, false, true]);
    bits.clearRange(0, 16);
    expect(bits.countRange(0, 16)).toBe(0);
    bits.clearRange(3, 3);
    expect(bits.countRange(0, 16)).toBe(0);
  });

  it("clearRange leaves count to the caller", () => {
    const bits = createBitset(8);
    bits.fill(0, 8);
    bits.setCount(8);
    bits.clearRange(0, 4);
    expect(bits.count).toBe(8);
  });
```

Append inside `describe("createBins", ...)` in `src/bins.test.ts`:
```ts
  it("recount recomputes touched bins from the source and returns them", () => {
    const bins = createBins(full(10), 3);
    const set = new Set([0, 1, 5]);
    const count = (s: number, e: number) => {
      let n = 0;
      for (let i = s; i < e; i += 1) if (set.has(i)) n += 1;
      return n;
    };
    expect(bins.recount(1, 6, count)).toEqual([0, 1]);
    expect(Array.from(bins.counts)).toEqual([2, 1, 0]);
    set.add(9);
    expect(bins.recount(9, 10, count)).toEqual([2]);
    expect(Array.from(bins.counts)).toEqual([2, 1, 1]);
  });

  it("recount clips to the view and returns nothing for no overlap or zero bins", () => {
    const bins = createBins({ start: 100, end: 110 }, 2);
    const count = () => 1;
    expect(bins.recount(0, 50, count)).toEqual([]);
    expect(bins.recount(95, 103, count)).toEqual([0]);
    expect(bins.recount(108, 200, count)).toEqual([1]);
    expect(createBins(full(10), 0).recount(0, 10, count)).toEqual([]);
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/bitset.test.ts src/bins.test.ts`
Expected: FAIL, `clearRange` / `recount` not functions.

- [ ] **Step 3: Implement**

`src/bitset.ts`: add to the type `clearRange(start: number, end: number): void;` and to the object, after `fill`:
```ts
    clearRange: (start, end) => {
      if (end <= start) return;
      const firstByte = start >>> BYTE_SHIFT;
      const lastByte = (end - 1) >>> BYTE_SHIFT;
      const fromBit = start & BYTE_MASK;
      const toBit = ((end - 1) & BYTE_MASK) + 1;
      if (firstByte === lastByte) {
        bytes[firstByte] &= ~maskRange(fromBit, toBit);
        return;
      }
      bytes[firstByte] &= ~maskRange(fromBit, BITS_PER_BYTE);
      bytes.fill(0, firstByte + 1, lastByte);
      bytes[lastByte] &= ~maskRange(0, toBit);
    },
```

`src/bins.ts`: add to the type `recount(start: number, end: number, countInRange: (start: number, end: number) => number): number[];` and to the object:
```ts
    recount: (rawStart, rawEnd, countInRange) => {
      const start = Math.max(rawStart, viewStart);
      const end = Math.min(rawEnd, viewEnd);
      if (binCount === 0 || end <= start) return [];
      const first = binOf(start);
      const last = binOf(end - 1);
      const touched: number[] = [];
      for (let bin = first; bin <= last; bin += 1) {
        const range = rangeOf(bin);
        counts[bin] = countInRange(range.start, range.end);
        touched.push(bin);
      }
      return touched;
    },
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/bitset.test.ts src/bins.test.ts`
Expected: all passing (bitset +3, bins +2).

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "feat: bitset clearRange and bins recount"
```

---

### Task 2: State `addRanges` and `removeRanges`

**Files:**
- Modify: `src/state.ts`, `src/state.test.ts`

**Interfaces:**
- Produces: `BlockState.addRanges(input: RangeInput): Uint32Array` and `removeRanges(input: RangeInput): Uint32Array` (dirty bins, ascending, deduplicated).

- [ ] **Step 1: Failing tests**

Append inside `describe("createBlockState", ...)`:
```ts
  it("addRanges counts only newly completed blocks and recounts touched bins", () => {
    const state = createBlockState(100);
    state.resize(10);
    state.add([5, 6, 50]);
    const dirty = state.addRanges([[0, 10], [8, 12], [48, 52]]);
    expect(Array.from(dirty)).toEqual([0, 1, 4, 5]);
    expect(state.progress().completed).toBe(16);
    expect([0, 1, 4, 5].map(state.countOf)).toEqual([10, 2, 2, 2]);
    const fresh = createBlockState(100);
    fresh.resize(10);
    fresh.replaceRanges([[0, 12], [48, 52]]);
    expect([0, 1, 2, 4, 5].map(state.countOf)).toEqual([0, 1, 2, 4, 5].map(fresh.countOf));
  });

  it("addRanges outside the view updates progress but not bins", () => {
    const state = createBlockState(100);
    state.resize(5);
    state.setView({ start: 40, end: 60 });
    const dirty = state.addRanges([[0, 10], [58, 70]]);
    expect(Array.from(dirty)).toEqual([4]);
    expect(state.progress().completed).toBe(22);
    expect([0, 1, 2, 3, 4].map(state.countOf)).toEqual([0, 0, 0, 0, 2]);
  });

  it("removeRanges subtracts only present blocks and recounts", () => {
    const state = createBlockState(100);
    state.resize(10);
    state.replaceRanges([[0, 30]]);
    const dirty = state.removeRanges([[5, 15], [25, 40]]);
    expect(Array.from(dirty)).toEqual([0, 1, 2, 3]);
    expect(state.progress().completed).toBe(15);
    expect([0, 1, 2, 3].map(state.countOf)).toEqual([5, 5, 5, 0]);
    expect(state.has(4)).toBe(true);
    expect(state.has(5)).toBe(false);
    expect(Array.from(state.removeRanges([[50, 60]]))).toEqual([5]);
    expect(state.progress().completed).toBe(15);
  });

  it("addRanges with no bins still sets bits and progress", () => {
    const state = createBlockState(100);
    expect(Array.from(state.addRanges([[10, 20]]))).toEqual([]);
    expect(state.progress().completed).toBe(10);
    state.resize(10);
    expect(state.countOf(1)).toBe(10);
  });
```

Trace for the first test: 10 bins of 10. Existing bits 5, 6, 50. Merged input `[0,12)`, `[48,52)`. Add `[0,12)`: already 2 (5, 6) → +10; bins 0, 1 recounted → 10, 2. Add `[48,52)`: already 1 (50) → +3; bins 4, 5 → 2, 2. Progress 3 + 13 = 16.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/state.test.ts`
Expected: FAIL, `addRanges is not a function`.

- [ ] **Step 3: Implement**

In `src/state.ts` add to the type:
```ts
  addRanges(input: RangeInput): Uint32Array;
  removeRanges(input: RangeInput): Uint32Array;
```
Add a helper above the return:
```ts
  const applyRanges = (input: RangeInput, complete: boolean): Uint32Array => {
    const flat = normalizeRanges(input, totalBlocks);
    const dirty = new Set<number>();
    let delta = 0;
    for (let i = 0; i < flat.length; i += RANGE_PAIR) {
      const start = flat[i];
      const end = flat[i + 1];
      const present = bitset.countRange(start, end);
      if (complete) {
        bitset.fill(start, end);
        delta += end - start - present;
      } else {
        bitset.clearRange(start, end);
        delta -= present;
      }
      for (const bin of bins.recount(start, end, bitset.countRange)) dirty.add(bin);
    }
    bitset.setCount(bitset.count + delta);
    return dirty.size === 0 ? EMPTY_DIRTY : Uint32Array.from(dirty).sort();
  };
```
And to the returned object: `addRanges: (input) => applyRanges(input, true),` and `removeRanges: (input) => applyRanges(input, false),`.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/state.test.ts src/scale.test.ts`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "feat: state addRanges and removeRanges with exact overlap handling"
```

---

### Task 3: Factory, React handle, README

**Files:**
- Modify: `src/blockMap.ts`, `src/blockMap.test.ts`, `src/react/BlockMap.tsx`, `src/react/BlockMap.test.tsx`, `README.md`

- [ ] **Step 1: Failing tests**

`src/blockMap.test.ts`, inside the describe:
```ts
  it("addRanges repaints only touched columns and removeRanges reverts them", () => {
    const container = mount();
    const map = createBlockMap(container, { totalBlocks: 100 });
    triggerResize(5);
    const before = puts.length;
    map.addRanges([[20, 30]]);
    expect(puts.length).toBe(before + 1);
    let image = puts.at(-1) as ImageData;
    expect(Array.from(image.data.subarray(2 * 4, 2 * 4 + 4))).toEqual([46, 204, 113, 255]);
    expect(Array.from(image.data.subarray(3 * 4, 3 * 4 + 4))).toEqual([43, 43, 43, 255]);
    expect(map.getProgress().completed).toBe(10);
    map.removeRanges([[25, 35]]);
    image = puts.at(-1) as ImageData;
    expect(map.getProgress().completed).toBe(5);
    expect(Array.from(image.data.subarray(2 * 4, 2 * 4 + 4))).not.toEqual([46, 204, 113, 255]);
    map.destroy();
    expect(() => map.addRanges([[0, 1]])).not.toThrow();
  });
```
`src/react/BlockMap.test.tsx`: add `addRanges: vi.fn(), removeRanges: vi.fn(),` to `createInstance`; append:
```tsx
  it("forwards addRanges and removeRanges through the handle", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValue(instance);
    const ref = createRef<BlockMapHandle>();
    render(<BlockMap ref={ref} totalBlocks={10} />);
    act(() => ref.current?.addRanges([[0, 2]]));
    act(() => ref.current?.removeRanges([[1, 2]]));
    expect(instance.addRanges).toHaveBeenCalledWith([[0, 2]]);
    expect(instance.removeRanges).toHaveBeenCalledWith([[1, 2]]);
    spy.mockRestore();
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/blockMap.test.ts src/react/BlockMap.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/blockMap.ts`: type gains `addRanges(ranges: RangeInput): void; removeRanges(ranges: RangeInput): void;`. Object:
```ts
    addRanges: (ranges) => {
      if (destroyed) return;
      renderer.markDirty(state.addRanges(ranges));
    },
    removeRanges: (ranges) => {
      if (destroyed) return;
      renderer.markDirty(state.removeRanges(ranges));
    },
```
`src/react/BlockMap.tsx`: handle `Pick` adds `"addRanges" | "removeRanges"`; implementations `addRanges: (next) => instanceRef.current?.addRanges(next), removeRanges: (next) => instanceRef.current?.removeRanges(next),`.

README: Methods rows `| \`addRanges(ranges)\` | Mark ranges complete on top of current state. Overlap with existing blocks or between tuples is counted once. Repaints only touched columns. |` and `| \`removeRanges(ranges)\` | Mark ranges missing. Progress drops by the number of blocks that were complete. |`; React handle list updated; Behaviour bullet: "Incremental range updates recount touched bins from the bitset, so overlap never double-counts; cost is proportional to the blocks covered, not to totalBlocks."

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/blockMap.test.ts src/react/BlockMap.test.tsx`
Expected: all passing. The first assertion trace: 100 blocks, 5 CSS px × DPR 2 = 10 bins of 10; `[20, 30)` fills bin 2 → complete colour `#2ecc71` = [46,204,113]; bin 3 untouched missing `#2b2b2b` = [43,43,43].

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "feat: addRanges and removeRanges on createBlockMap and React handle"
```

---

### Task 4: Demo uses delta updates

**Files:**
- Modify: `demo/index.html`

- [ ] **Step 1: Change the range map to deltas**

Each run keeps `[start, length]`. Before mutating, remember `prevStart = run[0]`, `prevEnd = run[0] + run[1]`. After growth compute `newStart`, `newEnd`. Collect deltas `[newStart, prevStart]` when `newStart < prevStart` and `[prevEnd, newEnd]` when `newEnd > prevEnd`. New runs contribute their whole span. Every `SNAPSHOT_EVERY` ticks call `rangeMap.addRanges(deltas)` with the accumulated deltas and clear the list, instead of `setRanges` of everything. Reset keeps `setRanges([])` then reseeds and sends the seed runs via `addRanges`. Update the section label to "10,000,000 blocks, incremental ranges, coverage style".

- [ ] **Step 2: Verify**

`npm run build`; if `http://localhost:4173/demo/` returns 200 and Playwright tools are available, load, wait 3 s, confirm the third bar fills progressively and the progress label increases monotonically; read `document.querySelector("#ranges-progress").textContent` twice 1 s apart. Otherwise state verification was skipped.

- [ ] **Step 3: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "docs: demo range map uses incremental addRanges"
```

---

## Self-review notes

- Spec coverage: clearRange + recount (T1), state add/remove (T2), factory + React + README (T3), demo deltas (T4).
- `recount` uses the post-mutation bitset so counts are exact regardless of overlap.
- Dirty result sorted ascending for deterministic tests; `Uint32Array.prototype.sort` sorts numerically.
