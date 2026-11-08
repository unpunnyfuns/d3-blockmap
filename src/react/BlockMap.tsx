import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties } from "react";
import type { PartialStyle } from "../colors";
import { createBlockMap } from "../blockMap";
import type { BlockMap as BlockMapInstance, BlockMapOptions } from "../blockMap";
import type { RangeInput } from "../ranges";

export type BlockMapProps = {
  totalBlocks: number;
  blocks?: ArrayLike<number>;
  ranges?: RangeInput;
  partial?: PartialStyle;
  className?: string;
  style?: CSSProperties;
};

export type BlockMapHandle = Pick<BlockMapInstance, "addBlocks" | "setRanges" | "getProgress">;

const EMPTY_BLOCKS: readonly number[] = [];
const EMPTY_PROGRESS = { completed: 0, total: 0 };

export const BlockMap = forwardRef<BlockMapHandle, BlockMapProps>(
  ({ totalBlocks, blocks, ranges, partial, className, style }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<BlockMapInstance>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return undefined;
      const options: BlockMapOptions = partial ? { totalBlocks, partial } : { totalBlocks };
      const instance = createBlockMap(container, options);
      instanceRef.current = instance;
      return () => {
        instance.destroy();
        instanceRef.current = null;
      };
    }, [totalBlocks, partial]);

    useEffect(() => {
      const instance = instanceRef.current;
      if (!instance) return;
      if (ranges !== undefined) {
        instance.setRanges(ranges);
        if (blocks !== undefined) instance.addBlocks(blocks);
        return;
      }
      instance.setBlocks(blocks ?? EMPTY_BLOCKS);
    }, [totalBlocks, partial, ranges, blocks]);

    useImperativeHandle(
      ref,
      () => ({
        addBlocks: (indices) => instanceRef.current?.addBlocks(indices),
        setRanges: (ranges) => instanceRef.current?.setRanges(ranges),
        getProgress: () =>
          instanceRef.current?.getProgress() ?? { ...EMPTY_PROGRESS, total: totalBlocks },
      }),
      [totalBlocks],
    );

    return <div ref={containerRef} className={className} style={style} />;
  },
);

BlockMap.displayName = "BlockMap";
