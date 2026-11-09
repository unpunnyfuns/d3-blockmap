import { installDom } from "./dom";

describe("installDom", () => {
  it("throws on unknown matchMedia queries and unimplemented context methods", () => {
    const dom = installDom();
    expect(() => matchMedia("(orientation: landscape)")).toThrow(/unexpected matchMedia/);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d") as unknown as Record<string, unknown>;
    expect(() => (ctx.fillRect as () => void)()).toThrow(/unimplemented/);
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

  it('getContext throws for ids other than "2d"', () => {
    const dom = installDom();
    const canvas = document.createElement("canvas");
    expect(() => canvas.getContext("webgl" as unknown as "2d")).toThrow(/unimplemented/);
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

  it("triggerResize throws when no observers are registered", () => {
    const dom = installDom();
    expect(() => dom.triggerResize(10)).toThrow(/no observers/);
    dom.restore();
  });

  it("restore returns the environment to its prior state", () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalMatchMedia = globalThis.matchMedia;
    const originalRaf = globalThis.requestAnimationFrame;
    const originalDpr = globalThis.devicePixelRatio;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    const dom = installDom();
    const container = dom.mount();
    dom.restore();

    expect(globalThis.ResizeObserver).toBe(originalResizeObserver);
    expect(globalThis.matchMedia).toBe(originalMatchMedia);
    expect(globalThis.requestAnimationFrame).toBe(originalRaf);
    expect(globalThis.devicePixelRatio).toBe(originalDpr);
    expect(HTMLCanvasElement.prototype.getContext).toBe(originalGetContext);
    expect(document.body.contains(container)).toBe(false);
  });
});
