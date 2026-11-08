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

export const BlockMap = forwardRef<BlockMapHandle, BlockMapProps>(
  (
    {
      totalBlocks,
      blocks,
      ranges,
      partial,
      view,
      interactive,
      onViewChange,
      highlight,
      className,
      style,
    },
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
      if (view) options.view = view;
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
        getView: () => instanceRef.current?.getView() ?? { start: 0, end: totalBlocks },
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
