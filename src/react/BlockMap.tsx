/**
 * Thin React wrapper around the imperative map: it renders one empty div and
 * lets createBlockMap own everything inside it. React never sees the canvas,
 * so there is nothing for it to diff; props are pushed into the instance by
 * effects instead.
 */

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CSSProperties, Ref } from "react";
import type { AxisOptions } from "../axis";
import type { PartialStyle } from "../colors";
import { createBlockMap, defaultLabel } from "../blockMap";
import type { BlockClickEvent, BlockMap as BlockMapInstance, BlockMapOptions } from "../blockMap";
import type { BlockRange, RangeInput } from "../ranges";
import type { Progress } from "../state";
import { createScale, fullView } from "../view";
import type { BlockView } from "../view";

export type BlockMapProps = {
  totalBlocks: number;
  blocks?: ArrayLike<number>;
  ranges?: RangeInput;
  partial?: PartialStyle;
  view?: BlockView;
  interactive?: boolean;
  axis?: boolean | AxisOptions;
  brush?: boolean;
  onViewChange?: (view: BlockView) => void;
  onBrush?: (selection: BlockRange | null) => void;
  onBrushEnd?: (selection: BlockRange | null) => void;
  onBlockClick?: (event: BlockClickEvent) => void;
  label?: (progress: Progress) => string;
  highlight?: boolean;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<BlockMapHandle>;
};

// Every instance method except destroy, because the component owns the
// instance's lifetime. The data setters write through to the instance and
// stay in effect until the `blocks` or `ranges` prop next changes identity.
export type BlockMapHandle = Omit<BlockMapInstance, "destroy">;

type Callbacks = Pick<
  BlockMapProps,
  "onViewChange" | "onBrush" | "onBrushEnd" | "onBlockClick" | "label"
>;

// Module-level fallbacks for the empty cases, so neither the push effect nor
// the handle's getters allocate on every call.
const EMPTY_BLOCKS: readonly number[] = [];
const EMPTY_PROGRESS = { completed: 0, total: 0 };
const UNMEASURED_WIDTH = 0;

export const BlockMap = ({
  totalBlocks,
  blocks,
  ranges,
  partial,
  view,
  interactive,
  axis,
  brush,
  onViewChange,
  onBrush,
  onBrushEnd,
  onBlockClick,
  label,
  highlight,
  className,
  style,
  ref,
}: BlockMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<BlockMapInstance | null>(null);

  // Refreshed on every render and read through wrappers installed once, so an
  // inline callback is never a changed dependency that tears the map down,
  // and adding or removing one after mount takes effect without a rebuild.
  const latest = useRef<Callbacks>({});
  latest.current = { onViewChange, onBrush, onBrushEnd, onBlockClick, label };

  /**
   * Only the options that cannot be changed after construction are
   * dependencies here; everything else is pushed by the effects below, which
   * re-run against each new instance. Pass `axis` as a stable value - a fresh
   * object literal each render would recreate the map every time.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const options: BlockMapOptions = {
      totalBlocks,
      onViewChange: (next) => latest.current.onViewChange?.(next),
      onBrush: (selection) => latest.current.onBrush?.(selection),
      onBrushEnd: (selection) => latest.current.onBrushEnd?.(selection),
      onBlockClick: (event) => latest.current.onBlockClick?.(event),
      label: (progress) => (latest.current.label ?? defaultLabel)(progress),
    };
    if (partial) options.partial = partial;
    if (interactive !== undefined) options.interactive = interactive;
    if (view) options.view = view;
    if (axis !== undefined) options.axis = axis;
    if (brush !== undefined) options.brush = brush;

    const created = createBlockMap(container, options);
    setInstance(created);
    return () => {
      created.destroy();
      setInstance(null);
    };
  }, [totalBlocks, partial, interactive, axis, brush]);

  // `ranges` wins when both props are given: it replaces the bitset, so the
  // loose blocks have to be added on top of it afterwards.
  useEffect(() => {
    if (!instance) return;

    if (ranges !== undefined) {
      instance.setRanges(ranges);
      if (blocks !== undefined) instance.addBlocks(blocks);
      return;
    }
    instance.setBlocks(blocks ?? EMPTY_BLOCKS);
  }, [instance, ranges, blocks]);

  // Leaving `view` undefined hands control to the map's own interaction.
  useEffect(() => {
    if (view !== undefined) instance?.setView(view);
  }, [instance, view]);

  useEffect(() => {
    instance?.setHighlight(highlight ?? false);
  }, [instance, highlight]);

  // The getters need defaults for the window before the first instance
  // exists, so callers never have to handle a missing one. A handle held past
  // unmount reaches the destroyed instance, whose methods are inert.
  useImperativeHandle(
    ref,
    () => ({
      setBlocks: (indices) => instance?.setBlocks(indices),
      addBlocks: (indices) => instance?.addBlocks(indices),
      setRanges: (next) => instance?.setRanges(next),
      addRanges: (next) => instance?.addRanges(next),
      removeRanges: (next) => instance?.removeRanges(next),
      setView: (next) => instance?.setView(next),
      resetView: () => instance?.resetView(),
      getView: () => instance?.getView() ?? fullView(totalBlocks),
      getScale: () => instance?.getScale() ?? createScale(fullView(totalBlocks), UNMEASURED_WIDTH),
      setBrush: (selection) => instance?.setBrush(selection),
      getBrush: () => instance?.getBrush() ?? null,
      setHighlight: (on) => instance?.setHighlight(on),
      getProgress: () => instance?.getProgress() ?? { ...EMPTY_PROGRESS, total: totalBlocks },
    }),
    [instance, totalBlocks],
  );

  return <div ref={containerRef} className={className} style={style} />;
};
