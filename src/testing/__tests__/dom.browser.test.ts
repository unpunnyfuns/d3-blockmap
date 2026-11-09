import { installDom } from "../dom";

describe("installDom", () => {
  it("throws on unknown matchMedia queries", () => {
    const dom = installDom();
    expect(() => matchMedia("(orientation: landscape)")).toThrow(/unexpected matchMedia/);
    dom.restore();
  });

  it("records a real putImageData call from a mounted canvas", () => {
    const dom = installDom();
    const container = dom.mount();
    const canvas = document.createElement("canvas");
    container.append(canvas);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const image = ctx.createImageData(2, 1);
    ctx.putImageData(image, 0, 0);
    expect(dom.puts).toHaveLength(1);
    expect(dom.puts[0]?.width).toBe(image.width);
    expect(dom.puts[0]?.height).toBe(image.height);
    expect(dom.puts[0]?.data).toEqual(image.data);
    dom.restore();
  });

  it("copies each painted image so puts holds distinct snapshots", () => {
    const dom = installDom();
    const container = dom.mount();
    const canvas = document.createElement("canvas");
    container.append(canvas);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const image = ctx.createImageData(2, 1);
    image.data.set([1, 2, 3, 4, 5, 6, 7, 8]);
    ctx.putImageData(image, 0, 0);
    image.data.set([9, 10, 11, 12, 13, 14, 15, 16]);
    ctx.putImageData(image, 0, 0);
    expect(dom.puts).toHaveLength(2);
    expect(dom.puts[0]).not.toBe(dom.puts[1]);
    expect(dom.puts[0]?.data).not.toEqual(dom.puts[1]?.data);
    expect(Array.from(dom.puts[0]?.data ?? [])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Array.from(dom.puts[1]?.data ?? [])).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    dom.restore();
  });

  it("answers the known queries and records listeners", () => {
    const dom = installDom();
    expect(matchMedia("(prefers-color-scheme: dark)").matches).toBe(false);
    expect(matchMedia("(resolution: 2dppx)").matches).toBe(false);
    const mql = matchMedia("(prefers-reduced-motion: reduce)");
    const listener = () => {};
    mql.addEventListener("change", listener);
    expect(dom.mediaListeners.map((m) => m.query)).toEqual(["(prefers-reduced-motion: reduce)"]);
    mql.removeEventListener("change", listener);
    expect(dom.mediaListeners).toEqual([]);
    expect(dom.removedQueries).toEqual(["(prefers-reduced-motion: reduce)"]);
    dom.restore();
  });

  it("defers frames when asked and flushes in order", () => {
    const dom = installDom({ deferFrames: true });
    const order: number[] = [];
    requestAnimationFrame(() => order.push(1));
    requestAnimationFrame(() => order.push(2));
    expect(order).toEqual([]);
    dom.flushFrames();
    expect(order).toEqual([1, 2]);
    dom.restore();
  });

  it("drains a frame that schedules another frame in one flushFrames call", () => {
    const dom = installDom({ deferFrames: true });
    const order: number[] = [];
    requestAnimationFrame(() => {
      order.push(1);
      requestAnimationFrame(() => order.push(2));
    });
    dom.flushFrames();
    expect(order).toEqual([1, 2]);
    dom.restore();
  });

  it("cancels exactly the frame identified by its handle", () => {
    const dom = installDom({ deferFrames: true });
    const order: number[] = [];
    const handleA = requestAnimationFrame(() => order.push(1));
    requestAnimationFrame(() => order.push(2));
    cancelAnimationFrame(handleA);
    dom.flushFrames();
    expect(order).toEqual([2]);
    dom.restore();
  });

  it("throws for unknown MediaQueryList properties and hides symbol keys", () => {
    const dom = installDom();
    const mql = matchMedia("(prefers-color-scheme: dark)") as unknown as Record<
      PropertyKey,
      unknown
    >;
    expect(() => mql.onchange).toThrow(/unimplemented: MediaQueryList\.onchange/);
    expect(mql[Symbol.iterator]).toBeUndefined();
    dom.restore();
  });

  it("throws when installed twice without restore", () => {
    const dom = installDom();
    expect(() => installDom()).toThrow(/already installed/);
    dom.restore();
  });

  it("disconnect stops triggerResize from reaching that observer", () => {
    const dom = installDom();
    const stopped: number[] = [];
    const stays: number[] = [];
    const observer = new ResizeObserver((entries) =>
      stopped.push(entries[0]?.contentRect.width ?? -1),
    );
    const other = new ResizeObserver((entries) => stays.push(entries[0]?.contentRect.width ?? -1));
    observer.observe(document.createElement("div"));
    other.observe(document.createElement("div"));
    dom.triggerResize(10);
    expect(stopped).toEqual([10]);
    expect(stays).toEqual([10]);
    observer.disconnect();
    dom.triggerResize(20);
    expect(stopped).toEqual([10]);
    expect(stays).toEqual([10, 20]);
    dom.restore();
  });

  it("couples triggerResize to the mounted container's actual geometry", () => {
    const dom = installDom();
    const container = dom.mount();
    new ResizeObserver(() => {}).observe(container);
    dom.triggerResize(50);
    expect(container.getBoundingClientRect().width).toBe(50);
    dom.restore();
  });

  it("triggerResize throws when no observers are registered", () => {
    const dom = installDom();
    expect(() => dom.triggerResize(10)).toThrow(/no observers/);
    dom.restore();
  });

  it("triggerResize with a container only resizes and notifies the observer watching it", () => {
    const dom = installDom();
    const containerA = dom.mount();
    const containerB = dom.mount();
    const seenA: number[] = [];
    const seenB: number[] = [];
    new ResizeObserver((entries) => seenA.push(entries[0]?.contentRect.width ?? -1)).observe(
      containerA,
    );
    new ResizeObserver((entries) => seenB.push(entries[0]?.contentRect.width ?? -1)).observe(
      containerB,
    );

    const widthBBefore = containerB.getBoundingClientRect().width;
    dom.triggerResize(30, containerA);

    expect(containerA.getBoundingClientRect().width).toBe(30);
    expect(containerB.getBoundingClientRect().width).toBe(widthBBefore);
    expect(seenA).toEqual([30]);
    expect(seenB).toEqual([]);
    dom.restore();
  });

  it("matchMedia's matches reflects the media function at read time, not call time", () => {
    let flag = false;
    const dom = installDom({ media: () => flag });
    const mql = matchMedia("(prefers-reduced-motion: reduce)");
    expect(mql.matches).toBe(false);
    flag = true;
    expect(mql.matches).toBe(true);
    dom.restore();
  });

  it("restore returns the environment to its prior state", () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalMatchMedia = globalThis.matchMedia;
    const originalRaf = globalThis.requestAnimationFrame;
    const originalDpr = globalThis.devicePixelRatio;
    const originalPutImageData = CanvasRenderingContext2D.prototype.putImageData;
    const originalSetPointerCapture = Element.prototype.setPointerCapture;

    const dom = installDom();
    const container = dom.mount();
    dom.restore();

    expect(globalThis.ResizeObserver).toBe(originalResizeObserver);
    expect(globalThis.matchMedia).toBe(originalMatchMedia);
    expect(globalThis.requestAnimationFrame).toBe(originalRaf);
    expect(globalThis.devicePixelRatio).toBe(originalDpr);
    expect(CanvasRenderingContext2D.prototype.putImageData).toBe(originalPutImageData);
    expect(Element.prototype.setPointerCapture).toBe(originalSetPointerCapture);
    expect(document.body.contains(container)).toBe(false);
  });
});
