import { BITS_PER_BYTE, BYTE_MASK, BYTE_SHIFT } from "./constants";

describe("constants", () => {
  it("byte shift and mask agree with bits per byte", () => {
    expect(1 << BYTE_SHIFT).toBe(BITS_PER_BYTE);
    expect(BYTE_MASK).toBe(BITS_PER_BYTE - 1);
  });
});
