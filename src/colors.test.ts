import { DEFAULT_THEME } from "./constants";
import { createColorScale, highlightColor, readTheme, watchTheme } from "./colors";
import { TEST_THEME as theme } from "./testing";

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

  it("gradient interpolates partials between low and high", () => {
    const scale = createColorScale(theme, "gradient");
    const [r, g, b] = scale(0.5);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
    expect(b).toBeGreaterThan(100);
    expect(b).toBeLessThan(160);
    expect(g).toBe(0);
  });

  it("falls back to defaults for unparsable colours", () => {
    const scale = createColorScale({ ...theme, complete: "not-a-colour" });
    expect(Array.from(scale(1))).toEqual(Array.from(createColorScale(DEFAULT_THEME)(1)));
  });

  it("coverage style blends missing toward partial toward complete", () => {
    const scale = createColorScale(theme, "coverage");
    const [r, g, b, a] = scale(0.5);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
  });

  it("coverage style is dark red a quarter of the way through", () => {
    const scale = createColorScale(theme, "coverage");
    const [r, g] = scale(0.25);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
    expect(g).toBeLessThan(30);
  });

  it("coverage style is light red three-quarters of the way through", () => {
    const scale = createColorScale(theme, "coverage");
    const [r, g] = scale(0.75);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(100);
    expect(g).toBeLessThan(160);
  });

  it("coverage style keeps exact and distinct endpoints", () => {
    const scale = createColorScale(theme, "coverage");
    expect(Array.from(scale(0))).toEqual([0, 0, 0, 255]);
    expect(Array.from(scale(1))).toEqual([255, 255, 255, 255]);
    expect(Array.from(scale(0.0001))).not.toEqual([0, 0, 0, 255]);
    expect(Array.from(scale(0.9999))).not.toEqual([255, 255, 255, 255]);
  });

  it("coverage is the default and differs from gradient", () => {
    expect(Array.from(createColorScale(theme)(0.5))).toEqual(
      Array.from(createColorScale(theme, "coverage")(0.5)),
    );
    expect(Array.from(createColorScale(theme)(0.5))).not.toEqual(
      Array.from(createColorScale(theme, "gradient")(0.5)),
    );
  });
});

describe("readTheme", () => {
  it("reads CSS custom properties with defaults", () => {
    const el = document.createElement("div");
    document.body.append(el);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (name: string) => (name === "--blockmap-complete" ? " #123456 " : ""),
    } as unknown as CSSStyleDeclaration);
    expect(readTheme(el)).toEqual({
      missing: DEFAULT_THEME.missing,
      partialLow: DEFAULT_THEME.partialLow,
      partialHigh: DEFAULT_THEME.partialHigh,
      partial: DEFAULT_THEME.partial,
      complete: "#123456",
      highlight: DEFAULT_THEME.highlight,
    });
    vi.restoreAllMocks();
    el.remove();
  });
});

describe("highlightColor", () => {
  it("returns RGBA bytes for the highlight colour", () => {
    expect(Array.from(highlightColor(theme))).toEqual([0, 255, 0, 255]);
  });

  it("falls back to the default when unparsable", () => {
    expect(Array.from(highlightColor({ ...theme, highlight: "nope" }))).toEqual(
      Array.from(highlightColor({ ...theme, highlight: DEFAULT_THEME.highlight })),
    );
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
