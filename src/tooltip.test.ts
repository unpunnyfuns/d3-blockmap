import { createTooltip, formatBinTooltip, formatBlockTooltip } from "./tooltip";

describe("formatBinTooltip", () => {
  it("shows range, count and percentage", () => {
    expect(formatBinTooltip({ start: 1234000, end: 1235250 }, 812)).toBe(
      "Blocks 1,234,000–1,235,249 · 812 / 1,250 (65.0%)",
    );
  });

  it("collapses a single-block range", () => {
    expect(formatBinTooltip({ start: 5, end: 6 }, 1)).toBe("Block 5 · 1 / 1 (100%)");
  });
});

describe("formatBlockTooltip", () => {
  it("labels discrete blocks", () => {
    expect(formatBlockTooltip(7, true)).toBe("Block 7 · complete");
    expect(formatBlockTooltip(7, false)).toBe("Block 7 · missing");
  });
});

describe("createTooltip", () => {
  it("appends hidden element, shows with text and position, hides, destroys", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const tooltip = createTooltip(container);
    const el = container.querySelector("[data-piece-tooltip]") as HTMLElement;
    expect(el.style.display).toBe("none");
    tooltip.show(42, "hello");
    expect(el.style.display).toBe("block");
    expect(el.style.left).toBe("50px");
    expect(el.textContent).toBe("hello");
    tooltip.hide();
    expect(el.style.display).toBe("none");
    tooltip.destroy();
    expect(container.querySelector("[data-piece-tooltip]")).toBeNull();
    container.remove();
  });
});
