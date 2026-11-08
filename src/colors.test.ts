import { DEFAULT_THEME } from "./constants";
import { createColorScale, readTheme, watchTheme } from "./colors";

const theme = {
  missing: "#000000",
  partialLow: "#ff0000",
  partialHigh: "#0000ff",
  complete: "#ffffff",
};

describe("createColorScale", () => {
  it("returns exact endpoint colours", () => {
    const scale = createColorScale(theme);
    expect(Array.from(scale(0))).toEqual([0, 0, 0, 255]);
    expect(Array.from(scale(1))).toEqual([255, 255, 255, 255]);
  });

  it("never returns an endpoint colour for a partial fraction", () => {
    const scale = createColorScale(theme);
    expect(Array.from(scale(0.0001))).not.toEqual([0, 0, 0, 255]);
    expect(Array.from(scale(0.9999))).not.toEqual([255, 255, 255, 255]);
  });

  it("interpolates partials between low and high", () => {
    const scale = createColorScale(theme);
    const [r, , b] = scale(0.5);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
    expect(b).toBeGreaterThan(100);
    expect(b).toBeLessThan(160);
  });

  it("falls back to defaults for unparsable colours", () => {
    const scale = createColorScale({ ...theme, complete: "not-a-colour" });
    expect(Array.from(scale(1))).toEqual(Array.from(createColorScale(DEFAULT_THEME)(1)));
  });

  it("coverage style blends missing toward complete", () => {
    const scale = createColorScale(theme, "coverage");
    const [r, g, b, a] = scale(0.5);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
    expect(Math.abs(r - g)).toBeLessThan(3);
    expect(Math.abs(g - b)).toBeLessThan(3);
  });

  it("coverage style keeps exact and distinct endpoints", () => {
    const scale = createColorScale(theme, "coverage");
    expect(Array.from(scale(0))).toEqual([0, 0, 0, 255]);
    expect(Array.from(scale(1))).toEqual([255, 255, 255, 255]);
    expect(Array.from(scale(0.0001))).not.toEqual([0, 0, 0, 255]);
    expect(Array.from(scale(0.9999))).not.toEqual([255, 255, 255, 255]);
  });

  it("gradient is the default and differs from coverage", () => {
    expect(Array.from(createColorScale(theme)(0.5))).toEqual(
      Array.from(createColorScale(theme, "gradient")(0.5)),
    );
    expect(Array.from(createColorScale(theme)(0.5))).not.toEqual(
      Array.from(createColorScale(theme, "coverage")(0.5)),
    );
  });
});

describe("readTheme", () => {
  it("reads CSS custom properties with defaults", () => {
    const el = document.createElement("div");
    document.body.append(el);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (name: string) => (name === "--piece-complete" ? " #123456 " : ""),
    } as unknown as CSSStyleDeclaration);
    expect(readTheme(el)).toEqual({ ...DEFAULT_THEME, complete: "#123456" });
    vi.restoreAllMocks();
    el.remove();
  });
});

describe("watchTheme", () => {
  it("fires on documentElement attribute change and disposes", async () => {
    const onChange = vi.fn();
    const dispose = watchTheme(onChange);
    document.documentElement.setAttribute("data-theme", "dark");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
    dispose();
    document.documentElement.setAttribute("data-theme", "light");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
