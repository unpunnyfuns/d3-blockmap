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

  it("countRange counts bits within one byte", () => {
    const bits = createBitset(8);
    bits.fill(1, 4);
    expect(bits.countRange(0, 8)).toBe(3);
    expect(bits.countRange(1, 4)).toBe(3);
    expect(bits.countRange(2, 3)).toBe(1);
  });

  it("countRange counts bits across byte boundaries", () => {
    const bits = createBitset(20);
    bits.fill(3, 13);
    expect(bits.countRange(0, 20)).toBe(10);
    expect(bits.countRange(3, 13)).toBe(10);
    expect(bits.countRange(5, 15)).toBe(8);
  });

  it("countRange counts whole bytes", () => {
    const bits = createBitset(24);
    bits.fill(0, 16);
    expect(bits.countRange(0, 24)).toBe(16);
    expect(bits.countRange(8, 16)).toBe(8);
  });

  it("countRange returns 0 for an empty span", () => {
    const bits = createBitset(16);
    bits.fill(0, 16);
    expect(bits.countRange(5, 5)).toBe(0);
    expect(bits.countRange(5, 3)).toBe(0);
  });

  it("countRange matches brute-force has() count over random fills", () => {
    const size = 200;
    for (let trial = 0; trial < 5; trial += 1) {
      const bits = createBitset(size);
      const spans: Array<[number, number]> = [];
      for (let i = 0; i < 6; i += 1) {
        const start = Math.floor(Math.random() * size);
        const end = Math.min(size, start + Math.floor(Math.random() * 30));
        spans.push([start, end]);
        bits.fill(start, end);
      }
      for (let i = 0; i < 10; i += 1) {
        const start = Math.floor(Math.random() * size);
        const end = Math.floor(Math.random() * size);
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        let expected = 0;
        for (let idx = lo; idx < hi; idx += 1) if (bits.has(idx)) expected += 1;
        expect(bits.countRange(lo, hi)).toBe(expected);
      }
    }
  });

  it("clearRange clears a span across byte boundaries without touching neighbours", () => {
    const bits = createBitset(24);
    bits.fill(0, 24);
    bits.clearRange(5, 19);
    for (let i = 0; i < 24; i += 1) expect(bits.has(i)).toBe(i < 5 || i >= 19);
  });

  it("clearRange within one byte and whole bytes", () => {
    const bits = createBitset(16);
    bits.fill(0, 16);
    bits.clearRange(2, 5);
    expect([1, 2, 4, 5].map(bits.has)).toEqual([true, false, false, true]);
    bits.clearRange(0, 16);
    expect(bits.countRange(0, 16)).toBe(0);
    bits.clearRange(3, 3);
    expect(bits.countRange(0, 16)).toBe(0);
  });

  it("clearRange leaves count to the caller", () => {
    const bits = createBitset(8);
    bits.fill(0, 8);
    bits.setCount(8);
    bits.clearRange(0, 4);
    expect(bits.count).toBe(8);
  });
});
