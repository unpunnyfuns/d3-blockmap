import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { installDom } from "../../testing";
import type { InstalledDom } from "../../testing";
import { BlockMap } from "../BlockMap";
import type { BlockMapHandle } from "../BlockMap";

describe("<BlockMap> smoke", () => {
  let dom: InstalledDom;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    dom.restore();
  });

  it("mounts the real block map and exposes progress", () => {
    const ref = createRef<BlockMapHandle>();
    const { container, unmount } = render(
      <BlockMap ref={ref} totalBlocks={100} ranges={[[0, 50]]} axis style={{ height: 12 }} />,
    );
    act(() => dom.triggerResize(40));
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(container.querySelector("[data-blockmap-axis]")).not.toBeNull();
    expect(ref.current?.getProgress()).toEqual({ completed: 50, total: 100 });
    unmount();
    expect(container.querySelector("canvas")).toBeNull();
  });
});
