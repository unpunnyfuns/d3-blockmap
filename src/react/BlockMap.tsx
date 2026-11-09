import { useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties, Ref } from "react";
import type { AxisOptions } from "../axis";
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
  axis?: boolean | AxisOptions;
  onViewChange?: (view: BlockView) => void;
  highlight?: boolean;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<BlockMapHandle>;
};

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
  highlight,
  className,
  style,
  ref,
}: BlockMapProps) => {
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
    if (axis !== undefined) options.axis = axis;
    const instance = createBlockMap(container, options);
    instanceRef.current = instance;
    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
  }, [totalBlocks, partial, interactive, axis]);

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

  useEffect(() => {
    if (view !== undefined) instanceRef.current?.setView(view);
  }, [totalBlocks, partial, interactive, axis, view]);

  useEffect(() => {
    instanceRef.current?.setHighlight(highlight ?? false);
  }, [totalBlocks, partial, interactive, axis, highlight]);

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
