import { act, render } from "@testing-library/react";
import { createRef } from "react";
import * as core from "../pieceMap";
import type { PieceMap as PieceMapInstance } from "../pieceMap";
import { PieceMap } from "./PieceMap";
import type { PieceMapHandle } from "./PieceMap";

const createInstance = (): PieceMapInstance => ({
  setBlocks: vi.fn(),
  addBlocks: vi.fn(),
  getProgress: vi.fn(() => ({ completed: 0, total: 0 })),
  destroy: vi.fn(),
});

describe("<PieceMap>", () => {
  it("creates on mount, applies blocks, destroys on unmount", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createPieceMap").mockReturnValue(instance);
    const blocks = [1, 2];
    const { unmount, container } = render(
      <PieceMap totalBlocks={10} blocks={blocks} className="pm" />,
    );
    expect(spy).toHaveBeenCalledWith(container.firstElementChild, { totalBlocks: 10 });
    expect(container.firstElementChild?.className).toBe("pm");
    expect(instance.setBlocks).toHaveBeenCalledWith(blocks);
    unmount();
    expect(instance.destroy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("recreates when totalBlocks changes and reapplies blocks", () => {
    const first = createInstance();
    const second = createInstance();
    const spy = vi
      .spyOn(core, "createPieceMap")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const blocks = [3];
    const { rerender } = render(<PieceMap totalBlocks={10} blocks={blocks} />);
    rerender(<PieceMap totalBlocks={20} blocks={blocks} />);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.setBlocks).toHaveBeenCalledWith(blocks);
    spy.mockRestore();
  });

  it("exposes addBlocks and getProgress through the ref", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createPieceMap").mockReturnValue(instance);
    const ref = createRef<PieceMapHandle>();
    render(<PieceMap ref={ref} totalBlocks={10} />);
    act(() => ref.current?.addBlocks([4]));
    expect(instance.addBlocks).toHaveBeenCalledWith([4]);
    expect(ref.current?.getProgress()).toEqual({ completed: 0, total: 0 });
    spy.mockRestore();
  });
});
