/**
 * One bit per block, packed into a Uint8Array: 8 million blocks cost 1 MB
 * instead of the 8 MB a Uint8Array of flags would. Owns only the bits and a
 * running population count; it knows nothing about views, bins or pixels.
 */

import { BITS_PER_BYTE, BYTE_MASK, BYTE_SHIFT, FULL_BYTE } from "./constants";

export type Bitset = {
  has(index: number): boolean;
  set(index: number): boolean;
  fill(start: number, end: number): void;
  clearRange(start: number, end: number): void;
  countRange(start: number, end: number): number;
  clear(): void;
  setCount(next: number): void;
  readonly count: number;
};

/**
 * Mask with bits [from, to) set within a single byte. `(1 << to) - 1` is all
 * bits below `to`; clearing the bits below `from` leaves the half-open window.
 * `to` may be 8, where `1 << 8` is still 256 so the subtraction gives 0xff.
 */
const maskRange = (from: number, to: number): number => ((1 << to) - 1) & ~((1 << from) - 1);

/**
 * Population count per byte value, built once by recurrence: the bits of `i`
 * are the bits of `i >> 1` plus its own low bit. Lets countRange tally whole
 * bytes with a table lookup instead of a per-bit loop.
 */
const POPCOUNT = new Uint8Array(1 << BITS_PER_BYTE);
for (let i = 1; i < POPCOUNT.length; i += 1) {
  POPCOUNT[i] = POPCOUNT[i >> 1] + (i & 1);
}

export const createBitset = (size: number): Bitset => {
  const bytes = new Uint8Array(Math.ceil(size / BITS_PER_BYTE));
  let count = 0;

  return {
    has: (index) => (bytes[index >>> BYTE_SHIFT] & (1 << (index & BYTE_MASK))) !== 0,

    /**
     * Returns false when the bit was already set, so callers can skip the
     * dirty-marking work for blocks that did not actually change.
     */
    set: (index) => {
      const byte = index >>> BYTE_SHIFT;
      const mask = 1 << (index & BYTE_MASK);
      if ((bytes[byte] & mask) !== 0) return false;

      bytes[byte] |= mask;
      count += 1;
      return true;
    },

    /**
     * Head/middle/tail: OR a partial mask into the first byte, memset the
     * whole bytes in between, OR a partial mask into the last. `end - 1` is
     * the last included bit, so `toBit` is its offset plus one.
     */
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

    // Same head/middle/tail shape as fill, with the masks inverted.
    clearRange: (start, end) => {
      if (end <= start) return;

      const firstByte = start >>> BYTE_SHIFT;
      const lastByte = (end - 1) >>> BYTE_SHIFT;
      const fromBit = start & BYTE_MASK;
      const toBit = ((end - 1) & BYTE_MASK) + 1;

      if (firstByte === lastByte) {
        bytes[firstByte] &= ~maskRange(fromBit, toBit);
        return;
      }

      bytes[firstByte] &= ~maskRange(fromBit, BITS_PER_BYTE);
      bytes.fill(0, firstByte + 1, lastByte);
      bytes[lastByte] &= ~maskRange(0, toBit);
    },

    // Head and tail are masked before counting; the middle bytes are counted
    // whole, one table lookup each.
    countRange: (start, end) => {
      if (end <= start) return 0;

      const firstByte = start >>> BYTE_SHIFT;
      const lastByte = (end - 1) >>> BYTE_SHIFT;
      const fromBit = start & BYTE_MASK;
      const toBit = ((end - 1) & BYTE_MASK) + 1;

      if (firstByte === lastByte) {
        return POPCOUNT[bytes[firstByte] & maskRange(fromBit, toBit)];
      }

      let total = POPCOUNT[bytes[firstByte] & maskRange(fromBit, BITS_PER_BYTE)];
      for (let b = firstByte + 1; b < lastByte; b += 1) total += POPCOUNT[bytes[b]];
      total += POPCOUNT[bytes[lastByte] & maskRange(0, toBit)];
      return total;
    },

    clear: () => {
      bytes.fill(0);
      count = 0;
    },

    /**
     * fill and clearRange do not maintain `count`, because recounting a
     * million-bit span per call would defeat the point. Callers that use them
     * compute the delta themselves and write the total back here.
     */
    setCount: (next) => {
      count = next;
    },

    get count() {
      return count;
    },
  };
};
