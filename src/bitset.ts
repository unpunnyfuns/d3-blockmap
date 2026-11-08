import { BITS_PER_BYTE, BYTE_MASK, BYTE_SHIFT } from "./constants";

export type Bitset = {
  has(index: number): boolean;
  set(index: number): boolean;
  clear(): void;
  readonly count: number;
};

export const createBitset = (size: number): Bitset => {
  const bytes = new Uint8Array(Math.ceil(size / BITS_PER_BYTE));
  let count = 0;

  return {
    has: (index) => (bytes[index >>> BYTE_SHIFT] & (1 << (index & BYTE_MASK))) !== 0,
    set: (index) => {
      const byte = index >>> BYTE_SHIFT;
      const mask = 1 << (index & BYTE_MASK);
      if ((bytes[byte] & mask) !== 0) return false;
      bytes[byte] |= mask;
      count += 1;
      return true;
    },
    clear: () => {
      bytes.fill(0);
      count = 0;
    },
    get count() {
      return count;
    },
  };
};
