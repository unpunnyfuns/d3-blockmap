# Test Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce project conventions with oxlint, share one strict test harness, remove tests that restate code, and add the integration cases earlier reviews found untested. No library behaviour changes.

**Architecture:** `.oxlintrc.json` turns on the rules that map to the project's style constraints. `src/testing/` holds the stub canvas context, manual scheduler and timer, a DOM installer with strict ResizeObserver and matchMedia fakes, an event factory for happy-dom quirks, and colour fixtures. Existing test files import from it; a new integration test file exercises the factory end to end.

**Tech Stack:** unchanged. oxlint 1.92 config file. No new dependencies.

## Global Constraints

- Library source under `src/` (non-test, non-testing) must not change behaviour. Allowed source edits: naming the three remaining magic numbers flagged by lint, nothing else.
- Every stub in the harness fails loudly on unexpected use: unknown `matchMedia` queries throw; unimplemented context methods throw; `restore()` removes every installed global.
- Test assertions carried over from existing files keep their meaning; only helper plumbing changes.
- oxlint rules enabled: `typescript/no-explicit-any`, `typescript/consistent-type-imports`, `eslint/no-inline-comments`, `eslint/no-magic-numbers` (ignore `0, 1, -1`, `ignoreArrayIndexes`, `detectObjects: false`, `enforceConst: false`), `eslint/prefer-const`, `eslint/eqeqeq`, all as errors. Test files and `src/testing/**` are exempt from `no-magic-numbers` via overrides.
- Naming is not lint-enforced (oxlint has no working rule here); README says so.
- The harness may use one `class` for the `ResizeObserver` stub because the DOM contract requires `new`; everywhere else, factories.
- TypeScript strict. Named exports only. `import type`. No `any`. No inline end-of-line comments. Run `npm run typecheck && npm run lint && npm run format && npm test` before every commit. Never run `npx biome`.

---

### Task 1: Lint configuration

**Files:**
- Create: `.oxlintrc.json`
- Modify: `src/tooltip.ts`, `src/axis.ts`, `src/colors.ts` only if lint flags a literal there (expected: `10` in tooltip's `10 ** digits`, a `3`, a `2`), `README.md`

- [ ] **Step 1: Baseline**

Run: `./node_modules/.bin/oxlint -D eslint/no-magic-numbers --ignore-pattern "*.test.ts" --ignore-pattern "*.test.tsx" src 2>&1 | grep -o "No magic number: [-0-9.e_x]*" | sort | uniq -c`
Expected: mostly `0` and `1`, plus a few others. Note the files.

- [ ] **Step 2: Config**

`.oxlintrc.json`:
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "eslint"],
  "categories": { "correctness": "error" },
  "rules": {
    "typescript/no-explicit-any": "error",
    "typescript/consistent-type-imports": ["error", { "prefer": "type-imports" }],
    "eslint/no-inline-comments": "error",
    "eslint/no-magic-numbers": [
      "error",
      { "ignore": [0, 1, -1], "ignoreArrayIndexes": true, "detectObjects": false, "enforceConst": false }
    ],
    "eslint/prefer-const": "error",
    "eslint/eqeqeq": "error"
  },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.test.tsx", "src/testing/**"],
      "rules": { "eslint/no-magic-numbers": "off" }
    }
  ]
}
```
If the `$schema` path does not exist, drop that line. If `plugins` is rejected, remove it (both plugins are default).

- [ ] **Step 3: Fix remaining source literals**

Run `npm run lint`. For each remaining `no-magic-numbers` error in non-test source, introduce a named module-local constant (e.g. `DECIMAL_BASE = 10` in tooltip.ts; whatever the `3` and `2` are, name them for what they mean). Do not add to `src/constants.ts` unless the value is shared.

- [ ] **Step 4: Prove lint bites**

Create `src/lint-probe.ts` with `export const probe = (x: any) => x;` and run `npm run lint`; expected: non-zero exit with a `no-explicit-any` error. Delete the probe file. Record the output in the report.

- [ ] **Step 5: README**

Development section: add "`npm run lint` enforces no `any`, `import type` for types, no inline end-of-line comments, and no unnamed numeric literals in library source (test files exempt). Naming conventions are reviewed by hand; oxlint has no working naming rule."

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "chore: oxlint config enforcing project conventions"
```

---

### Task 2: Shared harness

**Files:**
- Create: `src/testing/canvas.ts`, `src/testing/timers.ts`, `src/testing/dom.ts`, `src/testing/events.ts`, `src/testing/fixtures.ts`, `src/testing/index.ts`, `src/testing/dom.test.ts`

**Interfaces:**
```ts
// canvas.ts
createStubContext(): { ctx: Canvas2dLike & { puts: ImageDataLike[] }; puts: ImageDataLike[] }
pixel(image: ImageDataLike, column: number): number[]
// timers.ts
createManualScheduler(): { scheduler: Scheduler; flush(): void; pending(): number }
createManualTimer(): { timer: IntervalTimer; tick(): void; active(): number; cleared: number[] }
// dom.ts
type DomOptions = { dpr?: number; deferFrames?: boolean; media?: (query: string) => boolean };
installDom(options?: DomOptions): {
  mount(): HTMLElement; triggerResize(width: number): void; flushFrames(): void;
  puts: ImageData[]; mediaListeners: Array<{ query: string; listener: () => void }>;
  removedQueries: string[]; restore(): void;
}
// events.ts
fire(target: EventTarget, type: string, init?: Record<string, unknown>, props?: Record<string, unknown>): Event
// fixtures.ts
TEST_THEME: Theme; rgba(css: string): number[]; COMPLETE_RGBA, MISSING_RGBA, HIGHLIGHT_RGBA: number[]
```

- [ ] **Step 1: Failing harness test**

`src/testing/dom.test.ts`:
```ts
import { installDom } from "./dom";

describe("installDom", () => {
  it("throws on unknown matchMedia queries and unimplemented context methods", () => {
    const dom = installDom();
    expect(() => matchMedia("(orientation: landscape)")).toThrow(/unexpected matchMedia/);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d") as unknown as Record<string, unknown>;
    expect(() => (ctx.fillRect as () => void)()).toThrow(/unimplemented/);
    dom.restore();
  });

  it("answers the known queries and records listeners", () => {
    const dom = installDom();
    expect(matchMedia("(prefers-color-scheme: dark)").matches).toBe(false);
    expect(matchMedia("(resolution: 2dppx)").matches).toBe(false);
    const mql = matchMedia("(prefers-reduced-motion: reduce)");
    const listener = () => {};
    mql.addEventListener("change", listener);
    mql.removeEventListener("change", listener);
    expect(dom.mediaListeners.map((m) => m.query)).toEqual(["(prefers-reduced-motion: reduce)"]);
    expect(dom.removedQueries).toEqual(["(prefers-reduced-motion: reduce)"]);
    dom.restore();
  });

  it("defers frames when asked and flushes in order", () => {
    const dom = installDom({ deferFrames: true });
    const order: number[] = [];
    requestAnimationFrame(() => order.push(1));
    requestAnimationFrame(() => order.push(2));
    expect(order).toEqual([]);
    dom.flushFrames();
    expect(order).toEqual([1, 2]);
    dom.restore();
  });

  it("restore removes the installed globals", () => {
    const dom = installDom();
    dom.restore();
    expect(() => matchMedia("(orientation: landscape)")).not.toThrow(/unexpected matchMedia/);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/testing/dom.test.ts`
Expected: FAIL, cannot resolve `./dom`.

- [ ] **Step 3: Implement**

`src/testing/canvas.ts`:
```ts
import { BYTES_PER_PIXEL } from "../constants";
import type { Canvas2dLike, ImageDataLike } from "../renderer";

const unimplemented = (name: string | symbol): never => {
  throw new Error(`unimplemented: CanvasRenderingContext2D.${String(name)}`);
};

export const createStubContext = (): { ctx: Canvas2dLike; puts: ImageDataLike[] } => {
  const puts: ImageDataLike[] = [];
  const base: Canvas2dLike = {
    createImageData: (width, height) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * BYTES_PER_PIXEL),
    }),
    putImageData: (image) => {
      puts.push(image);
    },
  };
  const ctx = new Proxy(base, {
    get: (target, name) => (name in target ? target[name as keyof Canvas2dLike] : unimplemented(name)),
  });
  return { ctx, puts };
};

export const pixel = (image: ImageDataLike, column: number): number[] =>
  Array.from(image.data.subarray(column * BYTES_PER_PIXEL, column * BYTES_PER_PIXEL + BYTES_PER_PIXEL));
```

`src/testing/timers.ts`: move `createManualScheduler` and `createManualTimer` verbatim from `src/renderer.test.ts`, typed with `Scheduler` and `IntervalTimer` from `../renderer`, exported.

`src/testing/dom.ts`:
```ts
import { createStubContext } from "./canvas";

export type DomOptions = { dpr?: number; deferFrames?: boolean; media?: (query: string) => boolean };
export type MediaListener = { query: string; listener: () => void };
export type InstalledDom = {
  mount(): HTMLElement;
  triggerResize(width: number): void;
  flushFrames(): void;
  puts: ImageData[];
  mediaListeners: MediaListener[];
  removedQueries: string[];
  restore(): void;
};

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

const KNOWN_QUERIES = [/^\(resolution: [\d.]+dppx\)$/, /^\(prefers-color-scheme: dark\)$/, /^\(prefers-reduced-motion: reduce\)$/];
const DEFAULT_DPR = 2;

const defaultMedia = (query: string): boolean => {
  if (!KNOWN_QUERIES.some((pattern) => pattern.test(query))) {
    throw new Error(`unexpected matchMedia query: ${query}`);
  }
  return false;
};

export const installDom = (options: DomOptions = {}): InstalledDom => {
  const media = options.media ?? defaultMedia;
  const observers: ResizeCallback[] = [];
  const frames: FrameRequestCallback[] = [];
  const puts: ImageData[] = [];
  const mediaListeners: MediaListener[] = [];
  const removedQueries: string[] = [];
  const mounted: HTMLElement[] = [];

  class StubResizeObserver {
    constructor(callback: ResizeCallback) {
      observers.push(callback);
    }
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }

  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  vi.stubGlobal("devicePixelRatio", options.dpr ?? DEFAULT_DPR);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    if (options.deferFrames) {
      frames.push(callback);
      return frames.length;
    }
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames.splice(handle - 1, 1);
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: media(query),
    addEventListener: (_type: string, listener: () => void) => {
      mediaListeners.push({ query, listener });
    },
    removeEventListener: () => {
      removedQueries.push(query);
    },
  }));
  const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const { ctx, puts: local } = createStubContext();
    return new Proxy(ctx, {
      get: (target, name) => {
        if (name === "putImageData") {
          return (image: ImageData) => {
            local.push(image);
            puts.push(image);
          };
        }
        return target[name as keyof typeof target];
      },
    }) as unknown as CanvasRenderingContext2D;
  });

  return {
    mount: () => {
      const container = document.createElement("div");
      document.body.append(container);
      mounted.push(container);
      return container;
    },
    triggerResize: (width) =>
      observers.forEach((cb) => cb([{ contentRect: { width } } as unknown as ResizeObserverEntry])),
    flushFrames: () => {
      const pending = frames.splice(0, frames.length);
      pending.forEach((callback) => callback(0));
    },
    puts,
    mediaListeners,
    removedQueries,
    restore: () => {
      contextSpy.mockRestore();
      vi.unstubAllGlobals();
      mounted.forEach((el) => el.remove());
    },
  };
};
```
Note: the `cancelAnimationFrame` splice by handle index is approximate; keep it simple and document in the harness test that cancel removes the most recently scheduled callback for that handle. If `vi` is not in scope because the harness is not a test file, add `import { vi } from "vitest";` at the top of `dom.ts`.

`src/testing/events.ts`:
```ts
export const fire = (
  target: EventTarget,
  type: string,
  init: Record<string, unknown> = {},
  props: Record<string, unknown> = {},
): Event => {
  const Ctor = type === "wheel" ? WheelEvent : MouseEvent;
  const event = new Ctor(type, { bubbles: true, cancelable: true, ...init });
  Object.entries(props).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  target.dispatchEvent(event);
  return event;
};

export const ctrlWheel = (target: EventTarget, deltaY: number, offsetX: number): Event =>
  fire(target, "wheel", { deltaY }, { ctrlKey: true, offsetX });

export const pointer = (target: EventTarget, type: string, offsetX: number, pointerId = 1, button = 0): Event =>
  fire(target, type, { button }, { offsetX, pointerId });
```

`src/testing/fixtures.ts`:
```ts
import { rgb } from "d3-color";
import type { Theme } from "../colors";
import { DEFAULT_THEME, OPAQUE_ALPHA } from "../constants";

export const TEST_THEME: Theme = {
  missing: "#000000",
  partialLow: "#ff0000",
  partialHigh: "#0000ff",
  partial: "#ff0000",
  complete: "#ffffff",
  highlight: "#00ff00",
};

export const rgba = (css: string): number[] => {
  const color = rgb(css);
  return [color.r, color.g, color.b, OPAQUE_ALPHA];
};

export const COMPLETE_RGBA = rgba(DEFAULT_THEME.complete);
export const MISSING_RGBA = rgba(DEFAULT_THEME.missing);
export const HIGHLIGHT_RGBA = rgba(DEFAULT_THEME.highlight);
```

`src/testing/index.ts` re-exports everything from the five modules.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/testing/dom.test.ts`
Expected: 4 passing. Also `npm run typecheck` clean (harness is under `src`, included by tsconfig). Confirm `npm run build` output does not include `src/testing` (tsup only bundles from the two entries).

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "test: shared strict harness under src/testing"
```

---

### Task 3: Move existing tests onto the harness

**Files:**
- Modify: `src/renderer.test.ts`, `src/blockMap.test.ts`, `src/interaction.test.ts`, `src/colors.test.ts`, `src/react/BlockMap.test.tsx`
- Delete: `src/constants.test.ts`
- Rename: `src/scale.test.ts` → `src/state.scale.test.ts`

- [ ] **Step 1: renderer.test.ts**

Delete the local `theme`, `createStubContext`, `createManualScheduler`, `createManualTimer`, `pixel`; import `TEST_THEME as theme`, `createStubContext`, `createManualScheduler`, `createManualTimer`, `pixel` from `./testing`. Assertions unchanged. Run the file.

- [ ] **Step 2: blockMap.test.ts**

Replace the module-level arrays, `StubResizeObserver`, `triggerResize`, `beforeEach` stubs, and `mount` with:
```ts
let dom: InstalledDom;
beforeEach(() => {
  dom = installDom();
});
afterEach(() => {
  dom.restore();
  vi.restoreAllMocks();
});
```
and reference `dom.mount()`, `dom.triggerResize(...)`, `dom.puts`, `dom.mediaListeners`, `dom.removedQueries`. Tests that need deferred frames call `dom.restore(); dom = installDom({ deferFrames: true });` at their start and use `dom.flushFrames()`. The reduced-motion test passes `media: (q) => q.includes("reduced-motion")`. Tests that spy on `window.getComputedStyle` keep doing so. Replace hardcoded `[46, 204, 113, 255]` / `[43, 43, 43, 255]` / `[255, 77, 79, 255]` with `COMPLETE_RGBA` / `MISSING_RGBA` / `HIGHLIGHT_RGBA`. Replace inline `WheelEvent` construction with `ctrlWheel(canvas, -100, 25)` and pointer `MouseEvent`s with `pointer(canvas, "pointermove", 0)`. Assertions unchanged.

- [ ] **Step 3: interaction.test.ts**

Delete the local `fire`; import `fire`, `ctrlWheel`, `pointer` from `./testing`. Keep `createDeps` (test-specific). Assertions unchanged.

- [ ] **Step 4: colors.test.ts and React**

`colors.test.ts`: import `TEST_THEME as theme`. `react/BlockMap.test.tsx`: unchanged except it may import `installDom` later in Task 4; leave as is now.

- [ ] **Step 5: Delete and rename**

`git rm src/constants.test.ts`; `git mv src/scale.test.ts src/state.scale.test.ts`; in the renamed file, after measuring, `console.info` is noise, so instead append the elapsed ms to the test name via `expect(elapsedMs, \`resize took ${elapsedMs}ms\`).toBeLessThan(1500)`.

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm run lint && npm run format && npm test`
Expected: test count drops by 1 (constants) and otherwise unchanged; all passing.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "test: move suites onto the shared harness, drop restating tests"
```

---

### Task 4: Integration tests

**Files:**
- Create: `src/blockMap.integration.test.ts`
- Modify: `src/react/BlockMap.test.tsx` (one smoke test)

- [ ] **Step 1: Write the tests**

`src/blockMap.integration.test.ts`:
```ts
import { createBlockMap } from "./blockMap";
import { COMPLETE_RGBA, HIGHLIGHT_RGBA, ctrlWheel, installDom, pixel, pointer } from "./testing";
import type { InstalledDom } from "./testing";

let dom: InstalledDom;
beforeEach(() => {
  dom = installDom({ deferFrames: true });
});
afterEach(() => {
  dom.restore();
  vi.restoreAllMocks();
});

const setup = (totalBlocks: number, width: number) => {
  const container = dom.mount();
  const onViewChange = vi.fn();
  const map = createBlockMap(container, { totalBlocks, onViewChange });
  dom.triggerResize(width);
  dom.flushFrames();
  const canvas = container.querySelector("canvas") as HTMLCanvasElement;
  return { container, map, canvas, onViewChange };
};

describe("createBlockMap integration", () => {
  it("ignores wheel zoom during a drag and pans from the drag baseline", () => {
    const { map, canvas } = setup(1000, 100);
    pointer(canvas, "pointerdown", 50);
    pointer(canvas, "pointermove", 60);
    dom.flushFrames();
    const afterPan = map.getView();
    ctrlWheel(canvas, -100, 60);
    dom.flushFrames();
    expect(map.getView()).toEqual(afterPan);
    pointer(canvas, "pointermove", 70);
    dom.flushFrames();
    expect(map.getView().end - map.getView().start).toBe(1000);
    pointer(canvas, "pointerup", 70);
    map.destroy();
  });

  it("keeps the view finite and clamped when a resize happens mid-drag", () => {
    const { map, canvas } = setup(1000, 100);
    map.setView({ start: 200, end: 400 });
    dom.flushFrames();
    pointer(canvas, "pointerdown", 50);
    pointer(canvas, "pointermove", 55);
    dom.triggerResize(50);
    pointer(canvas, "pointermove", 60);
    dom.flushFrames();
    const view = map.getView();
    expect(Number.isFinite(view.start) && Number.isFinite(view.end)).toBe(true);
    expect(view.start).toBeGreaterThanOrEqual(0);
    expect(view.end).toBeLessThanOrEqual(1000);
    expect(view.end - view.start).toBe(200);
    pointer(canvas, "pointerup", 60);
    map.destroy();
  });

  it("destroy during a drag is safe and later moves have no effect", () => {
    const { map, canvas } = setup(1000, 100);
    pointer(canvas, "pointerdown", 50);
    pointer(canvas, "pointermove", 60);
    const before = map.getView();
    expect(() => map.destroy()).not.toThrow();
    pointer(canvas, "pointermove", 90);
    dom.flushFrames();
    expect(map.getView()).toEqual(before);
  });

  it("theme change repaints and keeps the blink timer while highlighted", () => {
    const setInterval = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const { map } = setup(10, 5);
    map.addBlocks([0]);
    map.setHighlight(true);
    dom.flushFrames();
    const paintsBefore = dom.puts.length;
    document.documentElement.setAttribute("data-theme", "dark");
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        dom.flushFrames();
        expect(dom.puts.length).toBeGreaterThan(paintsBefore);
        expect(setInterval).toHaveBeenCalledTimes(1);
        expect(clearInterval).not.toHaveBeenCalled();
        expect(pixel(dom.puts.at(-1) as ImageData, 1)).toEqual(HIGHLIGHT_RGBA);
        map.destroy();
        document.documentElement.removeAttribute("data-theme");
        resolve();
      }, 0),
    );
  });

  it("zooming out at the full view does not report a view change", () => {
    const { map, canvas, onViewChange } = setup(1000, 100);
    ctrlWheel(canvas, 100, 50);
    dom.flushFrames();
    expect(onViewChange).not.toHaveBeenCalled();
    expect(map.getView()).toEqual({ start: 0, end: 1000 });
    map.destroy();
  });

  it("initial ranges with an initial view paint only in-view blocks and count all", () => {
    const container = dom.mount();
    const map = createBlockMap(container, {
      totalBlocks: 100,
      initialRanges: [[0, 60]],
      view: { start: 50, end: 70 },
    });
    dom.triggerResize(10);
    dom.flushFrames();
    const image = dom.puts.at(-1) as ImageData;
    expect(image.width).toBe(20);
    expect(pixel(image, 0)).toEqual(COMPLETE_RGBA);
    expect(pixel(image, 19)).not.toEqual(COMPLETE_RGBA);
    expect(map.getProgress().completed).toBe(60);
    map.destroy();
  });
});
```

Add to `src/react/BlockMap.test.tsx` a smoke test that does not mock `createBlockMap`:
```tsx
  it("mounts the real block map and exposes progress", () => {
    const dom = installDom();
    const ref = createRef<BlockMapHandle>();
    const { container, unmount } = render(
      <BlockMap ref={ref} totalBlocks={100} ranges={[[0, 50]]} axis style={{ height: 12 }} />,
    );
    act(() => dom.triggerResize(40));
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(container.querySelector("[data-blockmap-axis]")).not.toBeNull();
    expect(ref.current?.getProgress()).toEqual({ completed: 50, total: 100 });
    unmount();
    expect(container.querySelector("canvas")).toBeNull();
    dom.restore();
  });
```
with `import { installDom } from "../testing";`. Place it in a separate `describe("<BlockMap> smoke", …)` so the mocking tests' `spy.mockRestore()` pattern is unaffected.

- [ ] **Step 2: Run, adjust only test plumbing**

Run: `npx vitest run src/blockMap.integration.test.ts src/react/BlockMap.test.tsx`
Expected: all passing. If a test fails because of a real library defect, stop and report NEEDS_CONTEXT with the failing assertion and the actual values; do not change library code in this task. Plumbing fixes (harness quirks, event props) are allowed.

- [ ] **Step 3: Commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test && git add -A && git commit -m "test: integration cases for drag, zoom, theme, view and React smoke"
```

---

## Self-review notes

- Spec coverage: lint (T1), harness + its tests (T2), rewrite + deletions (T3), integration + React smoke + README (T4, README in T1).
- The harness is under `src/` for typecheck and import simplicity; tsup bundles only from the two entries, and `files: ["dist"]` keeps it out of the package.
