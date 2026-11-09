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
    mql.removeEventListener("change", listener);
    expect(dom.mediaListeners.map((m) => m.query)).toEqual(["(prefers-reduced-motion: reduce)"]);
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

  it("restore removes the installed globals", () => {
    const dom = installDom();
    dom.restore();
    expect(() => matchMedia("(orientation: landscape)")).not.toThrow(/unexpected matchMedia/);
  });
});
