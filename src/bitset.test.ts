import { createBitset } from "./bitset";

describe("createBitset", () => {
  it("starts empty", () => {
    const bits = createBitset(20);
    expect(bits.has(0)).toBe(false);
    expect(bits.has(19)).toBe(false);
    expect(bits.count).toBe(0);
  });

  it("sets and reports bits across byte boundaries", () => {
    const bits = createBitset(20);
    expect(bits.set(7)).toBe(true);
    expect(bits.set(8)).toBe(true);
    expect(bits.set(19)).toBe(true);
    expect(bits.has(7)).toBe(true);
    expect(bits.has(8)).toBe(true);
    expect(bits.has(19)).toBe(true);
    expect(bits.has(9)).toBe(false);
    expect(bits.count).toBe(3);
  });

  it("returns false and does not recount on duplicate set", () => {
    const bits = createBitset(8);
    bits.set(3);
    expect(bits.set(3)).toBe(false);
    expect(bits.count).toBe(1);
  });

  it("clear resets everything", () => {
    const bits = createBitset(8);
    bits.set(1);
    bits.clear();
    expect(bits.has(1)).toBe(false);
    expect(bits.count).toBe(0);
  });

  it("handles sizes that are not a multiple of 8", () => {
    const bits = createBitset(9);
    expect(bits.set(8)).toBe(true);
    expect(bits.has(8)).toBe(true);
  });
});
