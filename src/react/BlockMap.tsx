/**
 * Thin React wrapper around the imperative map: it renders one empty div and
 * lets createBlockMap own everything inside it. React never sees the canvas,
 * so there is nothing for it to diff; props are pushed into the instance by
 * effects instead.
 */

import { useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties, Ref } from "react";
import type { AxisOptions } from "../axis";
import type { PartialStyle } from "../colors";
import { createBlockMap } from "../blockMap";
import type { BlockMap as BlockMapInstance, BlockMapOptions } from "../blockMap";
import type { RangeInput } from "../ranges";
import type { Progress } from "../state";
import type { BlockView } from "../view";

export type BlockMapProps = {
  totalBlocks: number;
  blocks?: ArrayLike<number>;
  ranges?: RangeInput;
  partial?: PartialStyle;
  view?: BlockView;
  interactive?: boolean;
  axis?: boolean | AxisOptions;
  onViewChange?: (view: BlockView) => void;
  label?: (progress: Progress) => string;
  highlight?: boolean;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<BlockMapHandle>;
};

// The instance methods worth exposing imperatively. setBlocks is omitted
// because the `blocks` and `ranges` props own wholesale replacement, and
// destroy because the component owns the instance's lifetime.
export type BlockMapHandle = Pick<
  BlockMapInstance,
  | "addBlocks"
  | "setRanges"
  | "addRanges"
  | "removeRanges"
  | "setView"
  | "resetView"
  | "getView"
  | "getScale"
  | "setHighlight"
  | "getProgress"
>;

// Module-level fallbacks for the empty cases, so neither the push effect nor
// the handle's getters allocate on every call.
const EMPTY_BLOCKS: readonly number[] = [];
const EMPTY_PROGRESS = { completed: 0, total: 0 };

export const BlockMap = ({
  totalBlocks,
  blocks,
  ranges,
  partial,
  view,
  interactive,
  axis,
  onViewChange,
  label,
  highlight,
  className,
  style,
  ref,
}: BlockMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<BlockMapInstance>(null);

  // Held in a ref and refreshed on render so an inline callback does not
  // appear as a changed dependency and tear the whole map down.
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  // Same idea as onViewChangeRef, but label is also kept out of the create
  // effect's dependencies below: the core already defaults the label when
  // the option is absent, so the wrapper is only installed when `label` was
  // given at construction. Supplying `label` on a later render, after
  // mounting without one, does not recreate the instance and so never takes
  // effect; a changed function identity once the wrapper exists does, on the
  // next progress update.
  const labelRef = useRef(label);
  labelRef.current = label;

  /**
   * Only the options that cannot be changed after construction are
   * dependencies here; everything else is pushed by the effects below. Pass
   * `axis` as a stable value - a fresh object literal each render would
   * recreate the map every time.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const options: BlockMapOptions = {
      totalBlocks,
      onViewChange: (next) => onViewChangeRef.current?.(next),
    };
    if (partial) options.partial = partial;
    if (interactive !== undefined) options.interactive = interactive;
    if (view) options.view = view;
    if (axis !== undefined) options.axis = axis;
    if (label !== undefined) options.label = (progress) => labelRef.current!(progress);

    const instance = createBlockMap(container, options);
    instanceRef.current = instance;
    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
  }, [totalBlocks, partial, interactive, axis]);

  /**
   * The effects that push props repeat the construction dependencies so they
   * re-run after a rebuild and re-apply their prop to the new instance.
   *
   * `ranges` wins when both props are given: it replaces the bitset, so the
   * loose blocks have to be added on top of it afterwards.
   */
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    if (ranges !== undefined) {
      instance.setRanges(ranges);
      if (blocks !== undefined) instance.addBlocks(blocks);
      return;
    }
    instance.setBlocks(blocks ?? EMPTY_BLOCKS);
  }, [totalBlocks, partial, interactive, axis, ranges, blocks]);

  // Leaving `view` undefined hands control to the map's own interaction.
  useEffect(() => {
    if (view !== undefined) instanceRef.current?.setView(view);
  }, [totalBlocks, partial, interactive, axis, view]);

  useEffect(() => {
    instanceRef.current?.setHighlight(highlight ?? false);
  }, [totalBlocks, partial, interactive, axis, highlight]);

  // The getters need defaults for the window before the first effect runs and
  // after unmount, so callers never have to handle a missing instance.
  useImperativeHandle(
    ref,
    () => ({
      addBlocks: (indices) => instanceRef.current?.addBlocks(indices),
      setRanges: (next) => instanceRef.current?.setRanges(next),
      addRanges: (next) => instanceRef.current?.addRanges(next),
      removeRanges: (next) => instanceRef.current?.removeRanges(next),
      setView: (next) => instanceRef.current?.setView(next),
      resetView: () => instanceRef.current?.resetView(),
      getView: () => instanceRef.current?.getView() ?? { start: 0, end: totalBlocks },
      getScale: () =>
        instanceRef.current?.getScale() ?? {
          domain: [0, totalBlocks],
          range: [0, 0],
          x: () => 0,
          block: () => 0,
        },
      setHighlight: (on) => instanceRef.current?.setHighlight(on),
      getProgress: () =>
        instanceRef.current?.getProgress() ?? { ...EMPTY_PROGRESS, total: totalBlocks },
    }),
    [totalBlocks],
  );

  return <div ref={containerRef} className={className} style={style} />;
};
