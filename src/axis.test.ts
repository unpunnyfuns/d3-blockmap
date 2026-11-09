import { computeTicks, createAxis, createScale, defaultFormat } from "./axis";

describe("computeTicks", () => {
  it("returns nice values inside the view with linear x", () => {
    const ticks = computeTicks({ start: 0, end: 1000 }, 400, 5);
    expect(ticks.map((t) => t.block)).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(ticks.map((t) => t.x)).toEqual([0, 80, 160, 240, 320, 400]);
  });

  it("derives the count from width", () => {
    const wide = computeTicks({ start: 0, end: 1_000_000 }, 800);
    const narrow = computeTicks({ start: 0, end: 1_000_000 }, 160);
    expect(wide.length).toBeGreaterThan(narrow.length);
    expect(narrow.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps ticks within an offset view", () => {
    const ticks = computeTicks({ start: 4_250_000, end: 4_260_000 }, 500, 5);
    ticks.forEach((t) => {
      expect(t.block).toBeGreaterThanOrEqual(4_250_000);
      expect(t.block).toBeLessThanOrEqual(4_260_000);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(500);
    });
    expect(ticks.length).toBeGreaterThan(0);
  });

  it("uses integer ticks for a narrow view", () => {
    const ticks = computeTicks({ start: 10, end: 15 }, 400, 5);
    expect(ticks.map((t) => t.block)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it("returns nothing for zero width", () => {
    expect(computeTicks({ start: 0, end: 100 }, 0)).toEqual([]);
  });
});

describe("defaultFormat", () => {
  it("formats compactly", () => {
    expect(defaultFormat(0)).toBe("0");
    expect(defaultFormat(450)).toBe("450");
    expect(defaultFormat(450_000)).toBe("450K");
    expect(defaultFormat(1_250_000)).toBe("1.3M");
  });
});

describe("createScale", () => {
  it("maps blocks to px and back", () => {
    const scale = createScale({ start: 100, end: 200 }, 400);
    expect(scale.domain).toEqual([100, 200]);
    expect(scale.range).toEqual([0, 400]);
    expect(scale.x(150)).toBe(200);
    expect(scale.block(200)).toBe(150);
    expect(scale.block(scale.x(137))).toBeCloseTo(137);
  });

  it("is safe before layout", () => {
    const scale = createScale({ start: 5, end: 10 }, 0);
    expect(scale.range).toEqual([0, 0]);
    expect(scale.x(7)).toBe(0);
    expect(scale.block(0)).toBe(5);
  });
});

describe("createAxis", () => {
  const mount = () => {
    const container = document.createElement("div");
    document.body.append(container);
    return container;
  };

  it("renders ticks with data-block and positions them", () => {
    const container = mount();
    const axis = createAxis(container, {});
    axis.update({ start: 0, end: 1000 }, 400);
    const root = container.querySelector("[data-blockmap-axis]") as HTMLElement;
    expect(root.style.top).toBe("100%");
    const spans = Array.from(root.querySelectorAll("[data-blockmap-tick]")) as HTMLElement[];
    expect(spans.map((s) => s.dataset.block)).toEqual(["0", "200", "400", "600", "800", "1000"]);
    expect(spans[1].style.left).toBe("80px");
    expect(spans[1].textContent).toBe("200");
    axis.destroy();
    container.remove();
  });

  it("edge-anchors the first and last labels", () => {
    const container = mount();
    const axis = createAxis(container, { tickCount: 5 });
    axis.update({ start: 0, end: 1000 }, 400);
    const spans = Array.from(container.querySelectorAll("[data-blockmap-tick]")) as HTMLElement[];
    expect(spans[0].style.transform).toBe("translateX(0)");
    expect(spans[spans.length - 1].style.transform).toBe("translateX(-100%)");
    expect(spans[2].style.transform).toBe("translateX(-50%)");
    axis.destroy();
    container.remove();
  });

  it("uses a custom format and replaces children on update", () => {
    const container = mount();
    const axis = createAxis(container, { format: (b) => `#${b}`, tickCount: 2 });
    axis.update({ start: 0, end: 100 }, 200);
    const first = container.querySelectorAll("[data-blockmap-tick]");
    expect(first[0].textContent).toBe("#0");
    axis.update({ start: 500, end: 600 }, 200);
    const second = Array.from(container.querySelectorAll("[data-blockmap-tick]")) as HTMLElement[];
    expect(second.map((s) => s.textContent)).toContain("#500");
    expect(second.map((s) => s.textContent)).not.toContain("#0");
    axis.destroy();
    expect(container.querySelector("[data-blockmap-axis]")).toBeNull();
    container.remove();
  });
});
