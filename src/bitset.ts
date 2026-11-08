import { BITS_PER_BYTE, BYTE_MASK, BYTE_SHIFT, FULL_BYTE } from "./constants";

export type Bitset = {
  has(index: number): boolean;
  set(index: number): boolean;
  fill(start: number, end: number): void;
  clear(): void;
  setCount(next: number): void;
  readonly count: number;
};

const maskRange = (from: number, to: number): number => ((1 << to) - 1) & ~((1 << from) - 1);

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
    fill: (start, end) => {
      if (end <= start) return;
      const firstByte = start >>> BYTE_SHIFT;
      const lastByte = (end - 1) >>> BYTE_SHIFT;
      const fromBit = start & BYTE_MASK;
      const toBit = ((end - 1) & BYTE_MASK) + 1;
      if (firstByte === lastByte) {
        bytes[firstByte] |= maskRange(fromBit, toBit);
        return;
      }
      bytes[firstByte] |= maskRange(fromBit, BITS_PER_BYTE);
      bytes.fill(FULL_BYTE, firstByte + 1, lastByte);
      bytes[lastByte] |= maskRange(0, toBit);
    },
    clear: () => {
      bytes.fill(0);
      count = 0;
    },
    setCount: (next) => {
      count = next;
    },
    get count() {
      return count;
    },
  };
};
