/**
 * Data sources for the configurator. Each one fills the map up to a wanted
 * number of completed blocks, never past it, and owns a small model of what
 * it has marked so the page can replay it into a freshly built map when a
 * construction-time option changes.
 */

const MAX_RANDOM_UNITS = 500_000;
const PERMUTATION_SEED = 0x9e3779b9;
const FEISTEL_ROUNDS = 4;
const RUN_SEED_COUNT = 24;
const RUN_MAX = 400;
const MIN_BLOCKS_PER_RUN = 10;
const RUN_START_FRACTION = 1 / 500;
const GROW_PASSES = 8;

const randomInt = (limit) => Math.floor(Math.random() * limit);

/**
 * A fixed pseudo-random ordering of 0..size-1 that needs no storage: a small
 * Feistel network over the next power of four, re-applied until the result
 * lands inside the range.
 */
const permutation = (size, seed) => {
  const halfBits = Math.max(1, Math.ceil(Math.log2(size) / 2));
  const half = 2 ** halfBits;
  const mask = half - 1;

  const mix = (value, round) => {
    let hash = Math.imul(value + seed + Math.imul(round + 1, 0x9e3779b1), 0x85ebca6b);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35);
    return (hash ^ (hash >>> 16)) & mask;
  };

  const shuffle = (index) => {
    let left = Math.floor(index / half);
    let right = index & mask;
    for (let round = 0; round < FEISTEL_ROUNDS; round += 1) {
      [left, right] = [right, left ^ mix(right, round)];
    }
    return left * half + right;
  };

  return (index) => {
    let value = shuffle(index);
    while (value >= size) value = shuffle(value);
    return value;
  };
};

/** One range growing from block 0: addRanges with a single delta. */
const sequentialSource = () => {
  let done = 0;
  return {
    advance: (map, want) => {
      if (want <= done) return;
      map.addRanges([[done, want]]);
      done = want;
    },
    replay: (map) => map.setRanges([[0, done]]),
  };
};

/**
 * Blocks in random order. Big maps are filled in small chunks rather than
 * single blocks, so the number of pieces to remember stays bounded.
 */
const randomSource = (total) => {
  const unit = Math.ceil(total / MAX_RANDOM_UNITS);
  const order = permutation(Math.ceil(total / unit), PERMUTATION_SEED);
  let done = 0;
  let fullUnits = 0;
  let partial = 0;

  const unitStart = (position) => order(position) * unit;
  const unitLength = (start) => Math.min(unit, total - start);

  const take = (need) => {
    const start = unitStart(fullUnits);
    const length = unitLength(start);
    const count = Math.min(length - partial, need);
    const piece = [start + partial, start + partial + count];
    partial += count;
    if (partial === length) {
      fullUnits += 1;
      partial = 0;
    }
    done += count;
    return piece;
  };

  const add = (map, pieces) => {
    if (unit === 1) map.addBlocks(Uint32Array.from(pieces, ([start]) => start));
    else map.addRanges(pieces);
  };

  const advance = (map, want) => {
    const pieces = [];
    while (done < want) pieces.push(take(want - done));
    if (pieces.length > 0) add(map, pieces);
  };

  const replay = (map) => {
    const pieces = Array.from({ length: fullUnits }, (_, position) => {
      const start = unitStart(position);
      return [start, start + unitLength(start)];
    });
    if (partial > 0) {
      const start = unitStart(fullUnits);
      pieces.push([start, start + partial]);
    }
    map.setRanges([]);
    add(map, pieces);
  };

  return { advance, replay };
};

/**
 * Runs that start at random places and grow outwards: addRanges deltas. The
 * model is the list of gaps still missing, so growth never overlaps and each
 * block added counts towards the target.
 */
const rangesSource = (total) => {
  const sparse = Math.max(1, Math.floor(total / MIN_BLOCKS_PER_RUN));
  const seedCount = Math.min(RUN_SEED_COUNT, sparse);
  const runLimit = Math.min(RUN_MAX, sparse);
  const maxRunStart = Math.ceil(total * RUN_START_FRACTION);
  let gaps = [[0, total]];
  let spawned = 0;

  const spawn = (budget) => {
    const index = randomInt(gaps.length);
    const [start, end] = gaps[index];
    const length = Math.min(end - start, budget, randomInt(maxRunStart) + 1);
    const from = start + randomInt(end - start - length + 1);
    const rest = [
      [start, from],
      [from + length, end],
    ];
    gaps.splice(index, 1, ...rest.filter(([left, right]) => right > left));
    spawned += 1;
    return [[from, from + length]];
  };

  /** A gap is eaten from the sides that touch a run, not from the ends of the map. */
  const eat = (gap, wantLeft, wantRight) => {
    const [start, end] = gap;
    const left = start === 0 ? 0 : Math.min(wantLeft, end - start);
    const right = end === total ? 0 : Math.min(wantRight, end - start - left);
    gap[0] = start + left;
    gap[1] = end - right;
    return [
      [start, start + left],
      [end - right, end],
    ];
  };

  /** Too little budget to share between the gaps: spend it all on one side of one gap. */
  const nibble = (gap, budget) => {
    const fromLeft = gap[1] === total || (gap[0] !== 0 && Math.random() < 0.5);
    return fromLeft ? eat(gap, budget, 0) : eat(gap, 0, budget);
  };

  const grow = (budget) => {
    const share = Math.floor(budget / (gaps.length * 2));
    const deltas =
      share === 0
        ? nibble(gaps[randomInt(gaps.length)], budget)
        : gaps.flatMap((gap) => eat(gap, randomInt(share + 1), randomInt(share + 1)));
    gaps = gaps.filter(([start, end]) => end > start);
    return deltas;
  };

  /** Growth is random, so a frame takes a few passes to use up its budget. */
  const advance = (map, want, phase) => {
    const wantedRuns = Math.round(seedCount + (runLimit - seedCount) * phase);
    for (let pass = 0; pass < GROW_PASSES; pass += 1) {
      const need = want - map.getProgress().completed;
      if (need <= 0 || gaps.length === 0) return;
      const fresh = [];
      let budget = need;
      while (spawned < wantedRuns && budget > 0 && gaps.length > 0) {
        const [run] = spawn(budget);
        fresh.push(run);
        budget -= run[1] - run[0];
      }
      const grown = budget > 0 && gaps.length > 0 ? grow(budget) : [];
      const real = [...fresh, ...grown].filter(([start, end]) => end > start);
      if (real.length > 0) map.addRanges(real);
    }
  };

  const covered = () => {
    const edges = [0, ...gaps.flat(), total];
    return Array.from({ length: edges.length / 2 }, (_, index) => [edges[index * 2], edges[index * 2 + 1]]);
  };

  return { advance, replay: (map) => map.setRanges(covered()) };
};

const SOURCES = { sequential: sequentialSource, random: randomSource, ranges: rangesSource };

export const createSource = (kind, total) => SOURCES[kind](total);
