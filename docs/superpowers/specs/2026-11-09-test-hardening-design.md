# d3-blockmap: test hardening

Lint the project's patterns across every file, share one strict test harness,
drop tests that restate the implementation, and add the integration cases the
whole-branch reviews listed. Behaviour of the library does not change.

## Goals

- Machine-enforce the conventions reviewers currently re-check by hand.
- One harness module so every test uses the same canvas, scheduler, timer,
  DOM, and event fakes, and those fakes fail loudly on unexpected use.
- Fewer, stronger tests: delete tests that only restate code; add tests for
  decisions that reviews found untested.

## Non-goals

- Changing library behaviour or public API.
- Enforcing naming by lint: oxlint 1.92 has no working naming rule here
  (unknown rule names are silently ignored). Naming stays a review item and
  is documented as such.

## 1. Lint configuration

`.oxlintrc.json` at the repo root, `npm run lint` unchanged (`oxlint src`):

- `typescript/no-explicit-any`: error.
- `typescript/consistent-type-imports`: error (prefer `import type`).
- `eslint/no-inline-comments`: error.
- `eslint/no-magic-numbers`: error with `ignore: [0, 1, -1]`,
  `ignoreArrayIndexes: true`, `detectObjects: false`, `enforceConst: false`.
  Remaining source hits (a `10`, a `3`, a `2`) become named constants.
- `eslint/prefer-const`, `eslint/eqeqeq`: error.
- Overrides: files matching `*.test.ts`, `*.test.tsx`, and `src/testing/**`
  disable `no-magic-numbers`.
- Also lint `demo` is out of scope (plain HTML).

`npm run lint` must exit non-zero on a violation; verify with a deliberate
`any` in a scratch file during the task, then remove it.

## 2. Shared harness: `src/testing/`

Files (excluded from the package via `tsup` entries, included in typecheck):

- `canvas.ts`: `createStubContext()` → `{ ctx: Canvas2dLike, puts:
  ImageDataLike[] }`; `pixel(image, column)`.
- `timers.ts`: `createManualScheduler()` → `{ scheduler, flush, pending }`;
  `createManualTimer()` → `{ timer, tick, active, cleared }`.
- `dom.ts`: `installDom(options?)` installs stubs for `ResizeObserver`
  (records callbacks, `triggerResize(width)`), `matchMedia` (returns
  `matches` from an explicit map of query → boolean and **throws** on a
  query not in the map, with a default map covering the DPR, dark-scheme and
  reduced-motion queries), `requestAnimationFrame` (synchronous by default,
  or deferred with `flushFrames()` when `{ deferFrames: true }`),
  `devicePixelRatio`, and `HTMLCanvasElement.prototype.getContext` wired to
  `createStubContext`. Returns `{ mount(), triggerResize, flushFrames, puts,
  removedQueries, mediaListeners, restore }`. Every stub method that is not
  implemented throws `new Error("unimplemented: …")` rather than returning
  `undefined`.
- `events.ts`: `fire(target, type, init, props)` building `WheelEvent` or
  `MouseEvent` and defining `ctrlKey`, `metaKey`, `offsetX`, `pointerId`,
  `button` via `Object.defineProperty`, hiding the happy-dom quirks in one
  place with a comment-free, named helper per quirk.
- `fixtures.ts`: `TEST_THEME` (black missing, red partial-low, blue
  partial-high, red partial, white complete, green highlight) and the
  default theme byte tuples `COMPLETE_RGBA`, `MISSING_RGBA`, `HIGHLIGHT_RGBA`
  derived from `DEFAULT_THEME` with `rgb()`.
- `index.ts` re-exporting all.

## 3. Test rewrite

- `renderer.test.ts`, `blockMap.test.ts`, `interaction.test.ts`,
  `colors.test.ts`, `react/BlockMap.test.tsx` import from `../testing` and
  drop their local helpers. Assertions unchanged unless a test is deleted.
- Delete `constants.test.ts` (restates constants).
- Delete tests that only assert a stub was called when a behavioural
  assertion on the same path exists; keep one per decision.
- `scale.test.ts` renamed `state.scale.test.ts` to avoid reading as a
  `createScale` test; keep the timing bound but log the measured value.

## 4. New integration tests (`blockMap.integration.test.ts`)

Using the harness with deferred frames and real `createBlockMap`:

- Wheel zoom during an active drag is ignored; the next pointermove pans
  from the drag baseline.
- Resize mid-drag: after `triggerResize` the next pointermove still produces
  a clamped, finite view.
- Destroy while dragging: no error; `hasPointerCapture` is false if the API
  exists; no further `setView` effects after destroy.
- Theme change (`data-theme` mutation on `<html>`) repaints with the new
  colours and, while highlighted, keeps the blink timer running.
- Ctrl+wheel zoom-out at the full view does not call `onViewChange`.
- `initialRanges` plus an initial `view`: first layout paints only in-view
  blocks and `getProgress` counts all.
- React smoke: mount `<BlockMap totalBlocks={100} ranges={[[0, 50]]} axis />`
  without mocking `createBlockMap`, trigger a resize, assert a canvas and
  axis exist and `getProgress()` via the handle is 50; unmount removes them.

## 5. Docs

README Development section: lint enforces `any`, type imports, inline
comments, magic numbers; naming is reviewed by hand. Mention
`src/testing/` as the harness for contributors.

## Testing the harness

`src/testing/dom.test.ts`: unknown matchMedia query throws; unimplemented
stub methods throw; `restore()` removes all globals; deferred frames flush
in order.
