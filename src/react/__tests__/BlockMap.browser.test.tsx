import type * as BlockMapModule from "../../blockMap";
import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { createBlockMap } from "../../blockMap";
import type { BlockClickEvent, BlockMap as BlockMapInstance } from "../../blockMap";
import { BlockMap } from "../BlockMap";
import type { BlockMapHandle } from "../BlockMap";

vi.mock("../../blockMap", async (importOriginal) => {
  const actual = await importOriginal<typeof BlockMapModule>();
  return {
    createBlockMap: vi.fn(),
    defaultLabel: actual.defaultLabel,
    defaultTooltip: actual.defaultTooltip,
  };
});

const createInstance = (): BlockMapInstance => ({
  setBlocks: vi.fn(),
  setRanges: vi.fn(),
  addBlocks: vi.fn(),
  removeBlocks: vi.fn(),
  addRanges: vi.fn(),
  removeRanges: vi.fn(),
  setView: vi.fn(),
  resetView: vi.fn(),
  getView: vi.fn(() => ({ start: 0, end: 0 })),
  getScale: vi.fn(() => ({
    domain: [0, 0] as const,
    range: [0, 0] as const,
    x: () => 0,
    block: () => 0,
  })),
  setBrush: vi.fn(),
  getBrush: vi.fn(() => null),
  setHighlight: vi.fn(),
  getProgress: vi.fn(() => ({ completed: 0, total: 0 })),
  destroy: vi.fn(),
});

afterEach(() => {
  vi.mocked(createBlockMap).mockReset();
});

describe("<BlockMap>", () => {
  it("creates on mount, applies blocks, destroys on unmount", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const blocks = [1, 2];
    const { unmount, container } = render(
      <BlockMap totalBlocks={10} blocks={blocks} className="pm" />,
    );
    expect(createBlockMap).toHaveBeenCalledWith(
      container.firstElementChild,
      expect.objectContaining({ totalBlocks: 10, onViewChange: expect.any(Function) }),
    );
    expect(vi.mocked(createBlockMap).mock.calls[0][1]).not.toHaveProperty("partial");
    expect(container.firstElementChild?.className).toBe("pm");
    expect(instance.setBlocks).toHaveBeenCalledWith(blocks);
    unmount();
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("recreates when totalBlocks changes and reapplies blocks", () => {
    const first = createInstance();
    const second = createInstance();
    vi.mocked(createBlockMap).mockReturnValueOnce(first).mockReturnValueOnce(second);
    const blocks = [3];
    const { rerender } = render(<BlockMap totalBlocks={10} blocks={blocks} />);
    rerender(<BlockMap totalBlocks={20} blocks={blocks} />);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.setBlocks).toHaveBeenCalledWith(blocks);
  });

  it("exposes setBlocks, addBlocks, removeBlocks, setRanges, addRanges, removeRanges and getProgress through the ref", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const ref = createRef<BlockMapHandle>();
    render(<BlockMap ref={ref} totalBlocks={10} />);
    act(() => ref.current?.setBlocks([5, 6]));
    expect(instance.setBlocks).toHaveBeenLastCalledWith([5, 6]);
    act(() => ref.current?.addBlocks([4]));
    expect(instance.addBlocks).toHaveBeenCalledWith([4]);
    expect(ref.current?.getProgress()).toEqual({ completed: 0, total: 0 });
    act(() => ref.current?.removeBlocks([4]));
    expect(instance.removeBlocks).toHaveBeenCalledWith([4]);
    act(() => ref.current?.setRanges([[0, 1]]));
    expect(instance.setRanges).toHaveBeenCalledWith([[0, 1]]);
    act(() => ref.current?.addRanges([[0, 2]]));
    act(() => ref.current?.removeRanges([[1, 2]]));
    expect(instance.addRanges).toHaveBeenCalledWith([[0, 2]]);
    expect(instance.removeRanges).toHaveBeenCalledWith([[1, 2]]);
  });

  it("applies ranges with setRanges and does not call setBlocks", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const ranges = [[0, 5]] as const;
    render(<BlockMap totalBlocks={10} ranges={ranges} />);
    expect(instance.setRanges).toHaveBeenCalledWith(ranges);
    expect(instance.setBlocks).not.toHaveBeenCalled();
  });

  it("applies ranges first then adds blocks when both are given", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const ranges = [[0, 5]] as const;
    const blocks = [7];
    render(<BlockMap totalBlocks={10} ranges={ranges} blocks={blocks} />);
    expect(instance.setRanges).toHaveBeenCalledWith(ranges);
    expect(instance.addBlocks).toHaveBeenCalledWith(blocks);
    expect(instance.setBlocks).not.toHaveBeenCalled();
  });

  it("passes partial to createBlockMap and recreates when it changes", () => {
    const first = createInstance();
    const second = createInstance();
    vi.mocked(createBlockMap).mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { rerender, container } = render(<BlockMap totalBlocks={10} partial="coverage" />);
    expect(createBlockMap).toHaveBeenCalledWith(
      container.firstElementChild,
      expect.objectContaining({ totalBlocks: 10, partial: "coverage" }),
    );
    rerender(<BlockMap totalBlocks={10} partial="gradient" />);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(createBlockMap).toHaveBeenLastCalledWith(
      container.firstElementChild,
      expect.objectContaining({ totalBlocks: 10, partial: "gradient" }),
    );
    expect(second.setBlocks).toHaveBeenCalled();
  });

  it("applies view and highlight props and forwards the latest onViewChange without recreating", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const first = vi.fn();
    const second = vi.fn();
    const view = { start: 1, end: 5 };
    const { rerender } = render(
      <BlockMap totalBlocks={10} view={view} highlight onViewChange={first} />,
    );
    expect(instance.setView).toHaveBeenCalledWith(view);
    expect(instance.setHighlight).toHaveBeenCalledWith(true);
    rerender(<BlockMap totalBlocks={10} view={view} highlight onViewChange={second} />);
    expect(createBlockMap).toHaveBeenCalledTimes(1);
    const passed = vi.mocked(createBlockMap).mock.calls[0][1].onViewChange as (v: {
      start: number;
      end: number;
    }) => void;
    passed({ start: 2, end: 3 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ start: 2, end: 3 });
    rerender(<BlockMap totalBlocks={10} view={view} highlight={false} onViewChange={second} />);
    expect(instance.setHighlight).toHaveBeenLastCalledWith(false);
  });

  it("recreates when interactive changes and exposes view methods on the handle", () => {
    const a = createInstance();
    const b = createInstance();
    vi.mocked(createBlockMap).mockReturnValueOnce(a).mockReturnValueOnce(b);
    const ref = createRef<BlockMapHandle>();
    const { rerender } = render(<BlockMap ref={ref} totalBlocks={10} />);
    rerender(<BlockMap ref={ref} totalBlocks={10} interactive={false} />);
    expect(a.destroy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createBlockMap).mock.calls[1][1]).toMatchObject({ interactive: false });
    act(() => ref.current?.setView({ start: 0, end: 2 }));
    act(() => ref.current?.resetView());
    act(() => ref.current?.setHighlight(true));
    expect(b.setView).toHaveBeenCalledWith({ start: 0, end: 2 });
    expect(b.resetView).toHaveBeenCalledTimes(1);
    expect(b.setHighlight).toHaveBeenCalledWith(true);
    expect(ref.current?.getView()).toEqual({ start: 0, end: 0 });
  });

  it("re-applies the current view and highlight props to the new instance after an interactive-triggered recreate", () => {
    const first = createInstance();
    const second = createInstance();
    vi.mocked(createBlockMap).mockReturnValueOnce(first).mockReturnValueOnce(second);
    const view = { start: 2, end: 6 };
    const { rerender } = render(<BlockMap totalBlocks={10} view={view} highlight interactive />);
    rerender(<BlockMap totalBlocks={10} view={view} highlight interactive={false} />);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.setView).toHaveBeenCalledWith(view);
    expect(second.setHighlight).toHaveBeenCalledWith(true);
  });

  it("passes label as a wrapper and forwards the latest function without recreating", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const first = vi.fn(
      (progress: { completed: number; total: number }) => `${progress.completed}`,
    );
    const second = vi.fn((progress: { completed: number; total: number }) => `${progress.total}`);
    const { rerender } = render(<BlockMap totalBlocks={10} label={first} />);

    const passed = vi.mocked(createBlockMap).mock.calls[0][1].label as (p: {
      completed: number;
      total: number;
    }) => string;
    expect(passed({ completed: 3, total: 10 })).toBe("3");
    expect(first).toHaveBeenCalledTimes(1);

    rerender(<BlockMap totalBlocks={10} label={second} />);
    expect(createBlockMap).toHaveBeenCalledTimes(1);
    expect(passed({ completed: 3, total: 10 })).toBe("10");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default label when the prop is removed after mount", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const custom = (progress: { completed: number; total: number }) => `${progress.completed}`;
    const { rerender } = render(<BlockMap totalBlocks={10} label={custom} />);
    const passed = vi.mocked(createBlockMap).mock.calls[0][1].label as (p: {
      completed: number;
      total: number;
    }) => string;

    rerender(<BlockMap totalBlocks={10} />);
    expect(createBlockMap).toHaveBeenCalledTimes(1);
    expect(passed({ completed: 3, total: 10 })).toBe("3 of 10 blocks complete (30%)");
  });

  it("uses the default text when no label is given", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    render(<BlockMap totalBlocks={10} />);
    const passed = vi.mocked(createBlockMap).mock.calls[0][1].label as (p: {
      completed: number;
      total: number;
    }) => string;
    expect(passed({ completed: 3, total: 10 })).toBe("3 of 10 blocks complete (30%)");
  });

  it("applies a label supplied after mount without recreating", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const { rerender } = render(<BlockMap totalBlocks={10} />);
    const passed = vi.mocked(createBlockMap).mock.calls[0][1].label as (p: {
      completed: number;
      total: number;
    }) => string;

    rerender(<BlockMap totalBlocks={10} label={(progress) => `${progress.completed} done`} />);
    expect(createBlockMap).toHaveBeenCalledTimes(1);
    expect(passed({ completed: 3, total: 10 })).toBe("3 done");
  });

  it("passes brush as a create option and recreates when it changes", () => {
    const first = createInstance();
    const second = createInstance();
    vi.mocked(createBlockMap).mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { rerender, container } = render(<BlockMap totalBlocks={10} />);
    expect(vi.mocked(createBlockMap).mock.calls[0][1]).not.toHaveProperty("brush");
    rerender(<BlockMap totalBlocks={10} brush />);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(createBlockMap).toHaveBeenLastCalledWith(
      container.firstElementChild,
      expect.objectContaining({ brush: true }),
    );
    expect(second.setBlocks).toHaveBeenCalled();
  });

  it("forwards the latest brush and click callbacks without recreating", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const firstBrush = vi.fn();
    const firstEnd = vi.fn();
    const firstClick = vi.fn();
    const { rerender } = render(
      <BlockMap
        totalBlocks={10}
        brush
        onBrush={firstBrush}
        onBrushEnd={firstEnd}
        onBlockClick={firstClick}
      />,
    );
    const options = vi.mocked(createBlockMap).mock.calls[0][1];
    const passedBrush = options.onBrush as (s: readonly [number, number] | null) => void;
    const passedEnd = options.onBrushEnd as (s: readonly [number, number] | null) => void;
    const passedClick = options.onBlockClick as (e: BlockClickEvent) => void;

    const secondBrush = vi.fn();
    const secondEnd = vi.fn();
    const secondClick = vi.fn();
    rerender(
      <BlockMap
        totalBlocks={10}
        brush
        onBrush={secondBrush}
        onBrushEnd={secondEnd}
        onBlockClick={secondClick}
      />,
    );
    expect(createBlockMap).toHaveBeenCalledTimes(1);

    const click: BlockClickEvent = {
      block: 3,
      range: [3, 4],
      completed: 1,
      total: 1,
      originalEvent: new MouseEvent("click"),
    };
    passedBrush([1, 4]);
    passedEnd(null);
    passedClick(click);
    expect(firstBrush).not.toHaveBeenCalled();
    expect(firstEnd).not.toHaveBeenCalled();
    expect(firstClick).not.toHaveBeenCalled();
    expect(secondBrush).toHaveBeenCalledWith([1, 4]);
    expect(secondEnd).toHaveBeenCalledWith(null);
    expect(secondClick).toHaveBeenCalledWith(click);
  });

  it("installs the brush and click wrappers even without handlers and tolerates a removed one", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const onBrush = vi.fn();
    const { rerender } = render(<BlockMap totalBlocks={10} onBrush={onBrush} />);
    const options = vi.mocked(createBlockMap).mock.calls[0][1];
    expect(options.onBrushEnd).toBeTypeOf("function");
    expect(options.onBlockClick).toBeTypeOf("function");
    const passedBrush = options.onBrush as (s: readonly [number, number] | null) => void;

    rerender(<BlockMap totalBlocks={10} />);
    expect(createBlockMap).toHaveBeenCalledTimes(1);
    expect(() => passedBrush([0, 2])).not.toThrow();
    expect(onBrush).not.toHaveBeenCalled();
  });

  it("exposes setBrush and getBrush through the handle, falling back to null", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const ref = createRef<BlockMapHandle>();
    const { unmount } = render(<BlockMap ref={ref} totalBlocks={10} brush />);
    act(() => ref.current?.setBrush([2, 5]));
    expect(instance.setBrush).toHaveBeenCalledWith([2, 5]);
    expect(ref.current?.getBrush()).toBeNull();
    expect(instance.getBrush).toHaveBeenCalled();
    const handle = ref.current;
    unmount();
    expect(handle?.getBrush()).toBeNull();
  });

  it("passes axis as a create option, exposes getScale, and passes a boolean axis prop through", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const ref = createRef<BlockMapHandle>();
    const { rerender } = render(<BlockMap ref={ref} totalBlocks={10} axis={{ tickCount: 3 }} />);
    expect(vi.mocked(createBlockMap).mock.calls[0][1]).toMatchObject({ axis: { tickCount: 3 } });
    expect(ref.current?.getScale().range).toEqual([0, 0]);
    expect(instance.getScale).toHaveBeenCalled();
    rerender(<BlockMap ref={ref} totalBlocks={10} axis={true} />);
    expect(vi.mocked(createBlockMap).mock.calls[1][1]).toMatchObject({ axis: true });
  });

  it("reads an inline tooltip formatter live without recreating, and falls back to the default", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const hit = { block: 3, range: [3, 4] as [number, number], completed: 1, total: 1 };
    const { rerender } = render(<BlockMap totalBlocks={10} tooltip={() => "a"} />);
    const passed = vi.mocked(createBlockMap).mock.calls[0][1].tooltip as (h: typeof hit) => string;
    expect(passed(hit)).toBe("a");
    rerender(<BlockMap totalBlocks={10} tooltip={() => "b"} />);
    expect(createBlockMap).toHaveBeenCalledTimes(1);
    expect(passed(hit)).toBe("b");
    rerender(<BlockMap totalBlocks={10} />);
    expect(createBlockMap).toHaveBeenCalledTimes(1);
    expect(passed(hit)).toBe("Block 3 · complete");
  });

  it("recreates the map with tooltip false when the tooltip is toggled off", () => {
    const instance = createInstance();
    vi.mocked(createBlockMap).mockReturnValue(instance);
    const { rerender } = render(<BlockMap totalBlocks={10} />);
    expect(vi.mocked(createBlockMap).mock.calls[0][1].tooltip).toEqual(expect.any(Function));
    rerender(<BlockMap totalBlocks={10} tooltip={false} />);
    expect(createBlockMap).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createBlockMap).mock.calls[1][1].tooltip).toBe(false);
  });
});
