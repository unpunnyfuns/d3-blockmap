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
  setView: vi.fn(),
  resetView: vi.fn(),
  getView: vi.fn(() => ({ start: 0, end: 0 })),
  getScale: vi.fn(() => ({
    domain: [0, 0] as const,
    range: [0, 0] as const,
    x: () => 0,
    block: () => 0,
  })),
  setHighlight: vi.fn(),
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
    expect(spy).toHaveBeenCalledWith(
      container.firstElementChild,
      expect.objectContaining({ totalBlocks: 10, onViewChange: expect.any(Function) }),
    );
    expect(spy.mock.calls[0][1]).not.toHaveProperty("partial");
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
    expect(spy).toHaveBeenCalledWith(
      container.firstElementChild,
      expect.objectContaining({ totalBlocks: 10, partial: "coverage" }),
    );
    rerender(<BlockMap totalBlocks={10} partial="gradient" />);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(
      container.firstElementChild,
      expect.objectContaining({ totalBlocks: 10, partial: "gradient" }),
    );
    expect(second.setBlocks).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("applies view and highlight props and forwards the latest onViewChange without recreating", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValue(instance);
    const first = vi.fn();
    const second = vi.fn();
    const view = { start: 1, end: 5 };
    const { rerender } = render(
      <BlockMap totalBlocks={10} view={view} highlight onViewChange={first} />,
    );
    expect(instance.setView).toHaveBeenCalledWith(view);
    expect(instance.setHighlight).toHaveBeenCalledWith(true);
    rerender(<BlockMap totalBlocks={10} view={view} highlight onViewChange={second} />);
    expect(spy).toHaveBeenCalledTimes(1);
    const passed = spy.mock.calls[0][1].onViewChange as (v: { start: number; end: number }) => void;
    passed({ start: 2, end: 3 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ start: 2, end: 3 });
    rerender(<BlockMap totalBlocks={10} view={view} highlight={false} onViewChange={second} />);
    expect(instance.setHighlight).toHaveBeenLastCalledWith(false);
    spy.mockRestore();
  });

  it("recreates when interactive changes and exposes view methods on the handle", () => {
    const a = createInstance();
    const b = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValueOnce(a).mockReturnValueOnce(b);
    const ref = createRef<BlockMapHandle>();
    const { rerender } = render(<BlockMap ref={ref} totalBlocks={10} />);
    rerender(<BlockMap ref={ref} totalBlocks={10} interactive={false} />);
    expect(a.destroy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[1][1]).toMatchObject({ interactive: false });
    act(() => ref.current?.setView({ start: 0, end: 2 }));
    act(() => ref.current?.resetView());
    act(() => ref.current?.setHighlight(true));
    expect(b.setView).toHaveBeenCalledWith({ start: 0, end: 2 });
    expect(b.resetView).toHaveBeenCalledTimes(1);
    expect(b.setHighlight).toHaveBeenCalledWith(true);
    expect(ref.current?.getView()).toEqual({ start: 0, end: 0 });
    spy.mockRestore();
  });

  it("re-applies the current view and highlight props to the new instance after an interactive-triggered recreate", () => {
    const first = createInstance();
    const second = createInstance();
    const spy = vi
      .spyOn(core, "createBlockMap")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const view = { start: 2, end: 6 };
    const { rerender } = render(<BlockMap totalBlocks={10} view={view} highlight interactive />);
    rerender(<BlockMap totalBlocks={10} view={view} highlight interactive={false} />);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.setView).toHaveBeenCalledWith(view);
    expect(second.setHighlight).toHaveBeenCalledWith(true);
    spy.mockRestore();
  });

  it("passes axis as a create option and exposes getScale", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValue(instance);
    const ref = createRef<BlockMapHandle>();
    render(<BlockMap ref={ref} totalBlocks={10} axis={{ tickCount: 3 }} />);
    expect(spy.mock.calls[0][1]).toMatchObject({ axis: { tickCount: 3 } });
    expect(ref.current?.getScale().range).toEqual([0, 0]);
    expect(instance.getScale).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("passes a boolean axis prop through as a create option", () => {
    const instance = createInstance();
    const spy = vi.spyOn(core, "createBlockMap").mockReturnValue(instance);
    render(<BlockMap totalBlocks={10} axis={true} />);
    expect(spy.mock.calls[0][1]).toMatchObject({ axis: true });
    spy.mockRestore();
  });
});
