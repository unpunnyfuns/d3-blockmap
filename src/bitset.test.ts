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

  it("fill sets a span across byte boundaries", () => {
    const bits = createBitset(20);
    bits.fill(3, 13);
    expect(bits.has(2)).toBe(false);
    for (let i = 3; i < 13; i += 1) expect(bits.has(i)).toBe(true);
    expect(bits.has(13)).toBe(false);
  });

  it("fill sets a span within one byte", () => {
    const bits = createBitset(8);
    bits.fill(1, 4);
    expect([0, 1, 2, 3, 4].map(bits.has)).toEqual([false, true, true, true, false]);
  });

  it("fill covers whole bytes and ignores empty spans", () => {
    const bits = createBitset(16);
    bits.fill(0, 16);
    for (let i = 0; i < 16; i += 1) expect(bits.has(i)).toBe(true);
    const empty = createBitset(16);
    empty.fill(5, 5);
    expect(empty.has(5)).toBe(false);
  });

  it("fill does not change count; setCount does", () => {
    const bits = createBitset(16);
    bits.fill(0, 10);
    expect(bits.count).toBe(0);
    bits.setCount(10);
    expect(bits.count).toBe(10);
    expect(bits.set(3)).toBe(false);
    expect(bits.count).toBe(10);
  });
});
