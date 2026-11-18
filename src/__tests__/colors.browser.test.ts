import { DEFAULT_THEME } from "../constants";
import { createColorScale, highlightColor, pendingColor, readTheme, watchTheme } from "../colors";
import { TEST_THEME as theme } from "../testing";

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
    el.style.setProperty("--blockmap-complete", " #123456 ");
    expect(readTheme(el)).toEqual({
      missing: DEFAULT_THEME.missing,
      partialLow: DEFAULT_THEME.partialLow,
      partialHigh: DEFAULT_THEME.partialHigh,
      partial: DEFAULT_THEME.partial,
      complete: "#123456",
      highlight: DEFAULT_THEME.highlight,
      brush: DEFAULT_THEME.brush,
      pending: DEFAULT_THEME.pending,
    });
    el.remove();
  });
});

describe("readTheme with colours only the browser can resolve", () => {
  const mount = (): HTMLElement => {
    const el = document.createElement("div");
    document.body.append(el);
    return el;
  };

  it("resolves modern colour functions to sRGB", () => {
    const el = mount();
    el.style.setProperty("--blockmap-complete", "oklch(1 0 0)");
    el.style.setProperty("--blockmap-missing", "color-mix(in srgb, #ff0000, #0000ff)");
    el.style.setProperty("--blockmap-pending", "rgb(0 128 255 / 100%)");
    const theme = readTheme(el);
    expect(theme.complete).toBe("rgb(255, 255, 255)");
    expect(theme.missing).toBe("rgb(128, 0, 128)");
    expect(theme.pending).toBe("rgb(0, 128, 255)");
    el.remove();
  });

  it("follows the element's colour scheme through light-dark()", () => {
    const el = mount();
    el.style.setProperty("--blockmap-complete", "light-dark(#ffffff, #000000)");
    el.style.colorScheme = "light";
    expect(readTheme(el).complete).toBe("rgb(255, 255, 255)");
    el.style.colorScheme = "dark";
    expect(readTheme(el).complete).toBe("rgb(0, 0, 0)");
    el.remove();
  });

  it("resolves currentColor and a reference to another variable", () => {
    const el = mount();
    el.style.color = "#102030";
    el.style.setProperty("--brand", "hsl(120deg 100% 50%)");
    el.style.setProperty("--blockmap-highlight", "currentColor");
    el.style.setProperty("--blockmap-complete", "var(--brand)");
    const theme = readTheme(el);
    expect(theme.highlight).toBe("rgb(16, 32, 48)");
    expect(theme.complete).toBe("rgb(0, 255, 0)");
    el.remove();
  });

  it("falls back to the default for a non-colour or a fully transparent one, and leaves no probe behind", () => {
    const el = mount();
    el.style.color = "#102030";
    el.style.setProperty("--blockmap-complete", "12px");
    el.style.setProperty("--blockmap-missing", "rgb(0 0 0 / 0)");
    const theme = readTheme(el);
    expect(theme.complete).toBe(DEFAULT_THEME.complete);
    expect(theme.missing).toBe(DEFAULT_THEME.missing);
    expect(el.childElementCount).toBe(0);
    el.remove();
  });
});

describe("pendingColor", () => {
  it("parses the theme's pending colour and falls back to the default", () => {
    expect(Array.from(pendingColor(theme))).toEqual([0, 255, 255, 255]);
    expect(Array.from(pendingColor({ ...theme, pending: "nope" }))).toEqual(
      Array.from(pendingColor({ ...theme, pending: DEFAULT_THEME.pending })),
    );
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
