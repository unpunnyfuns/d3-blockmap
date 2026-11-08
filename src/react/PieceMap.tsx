import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties } from "react";
import { createPieceMap } from "../pieceMap";
import type { PieceMap as PieceMapInstance } from "../pieceMap";

export type PieceMapProps = {
  totalBlocks: number;
  blocks?: ArrayLike<number>;
  className?: string;
  style?: CSSProperties;
};

export type PieceMapHandle = Pick<PieceMapInstance, "addBlocks" | "getProgress">;

const EMPTY_BLOCKS: readonly number[] = [];
const EMPTY_PROGRESS = { completed: 0, total: 0 };

export const PieceMap = forwardRef<PieceMapHandle, PieceMapProps>(
  ({ totalBlocks, blocks, className, style }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<PieceMapInstance>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return undefined;
      const instance = createPieceMap(container, { totalBlocks });
      instanceRef.current = instance;
      return () => {
        instance.destroy();
        instanceRef.current = null;
      };
    }, [totalBlocks]);

    useEffect(() => {
      instanceRef.current?.setBlocks(blocks ?? EMPTY_BLOCKS);
    }, [totalBlocks, blocks]);

    useImperativeHandle(
      ref,
      () => ({
        addBlocks: (indices) => instanceRef.current?.addBlocks(indices),
        getProgress: () =>
          instanceRef.current?.getProgress() ?? { ...EMPTY_PROGRESS, total: totalBlocks },
      }),
      [totalBlocks],
    );

    return <div ref={containerRef} className={className} style={style} />;
  },
);

PieceMap.displayName = "PieceMap";
