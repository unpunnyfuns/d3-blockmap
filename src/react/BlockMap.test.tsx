import { act, render } from "@testing-library/react";
import { createRef } from "react";
import * as core from "../blockMap";
import type { BlockMap as BlockMapInstance } from "../blockMap";
import { BlockMap } from "./BlockMap";
import type { BlockMapHandle } from "./BlockMap";

const createInstance = (): BlockMapInstance => ({
  setBlocks: vi.fn(),
  setRanges: vi.fn(),
  addBlocks: vi.fn(),
  getProgress: vi.fn(() => ({ completed: 0, total: 0 })),
  destroy: vi.fn(),
});

describe("<BlockMap>", () => {
  it("creates on mount, applies blocks, destroys on unmount", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValue(instance);
    const blocks = [1, 2];
    const { unmount, container } = render(
      <BlockMap totalBlocks={10} blocks={blocks} className="pm" />,
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
      .spyOn(core, "createBlockMap")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const blocks = [3];
    const { rerender } = render(<BlockMap totalBlocks={10} blocks={blocks} />);
    rerender(<BlockMap totalBlocks={20} blocks={blocks} />);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.setBlocks).toHaveBeenCalledWith(blocks);
    spy.mockRestore();
  });

  it("exposes addBlocks and getProgress through the ref", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValue(instance);
    const ref = createRef<BlockMapHandle>();
    render(<BlockMap ref={ref} totalBlocks={10} />);
    act(() => ref.current?.addBlocks([4]));
    expect(instance.addBlocks).toHaveBeenCalledWith([4]);
    expect(ref.current?.getProgress()).toEqual({ completed: 0, total: 0 });
    spy.mockRestore();
  });

  it("exposes setRanges through the ref", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValue(instance);
    const ref = createRef<BlockMapHandle>();
    render(<BlockMap ref={ref} totalBlocks={10} />);
    act(() => ref.current?.setRanges([[0, 1]]));
    expect(instance.setRanges).toHaveBeenCalledWith([[0, 1]]);
    spy.mockRestore();
  });

  it("applies ranges with setRanges and does not call setBlocks", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValue(instance);
    const ranges = [[0, 5]] as const;
    render(<BlockMap totalBlocks={10} ranges={ranges} />);
    expect(instance.setRanges).toHaveBeenCalledWith(ranges);
    expect(instance.setBlocks).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("applies ranges first then adds blocks when both are given", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValue(instance);
    const ranges = [[0, 5]] as const;
    const blocks = [7];
    render(<BlockMap totalBlocks={10} ranges={ranges} blocks={blocks} />);
    expect(instance.setRanges).toHaveBeenCalledWith(ranges);
    expect(instance.addBlocks).toHaveBeenCalledWith(blocks);
    expect(instance.setBlocks).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("passes partial to createBlockMap and recreates when it changes", () => {
    const first = createInstance();
    const second = createInstance();
    const spy = vi
      .spyOn(core, "createBlockMap")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const { rerender, container } = render(<BlockMap totalBlocks={10} partial="coverage" />);
    expect(spy).toHaveBeenCalledWith(container.firstElementChild, {
      totalBlocks: 10,
      partial: "coverage",
    });
    rerender(<BlockMap totalBlocks={10} partial="gradient" />);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(container.firstElementChild, {
      totalBlocks: 10,
      partial: "gradient",
    });
    expect(second.setBlocks).toHaveBeenCalled();
    spy.mockRestore();
  });
});
