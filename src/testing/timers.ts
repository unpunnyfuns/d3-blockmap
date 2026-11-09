import type { IntervalTimer, Scheduler } from "../renderer";

export const createManualScheduler = (): {
  scheduler: Scheduler;
  flush(): void;
  pending(): number;
} => {
  const queue = new Map<number, () => void>();
  let next = 1;
  const scheduler: Scheduler = {
    request: (callback) => {
      const handle = next;
      next += 1;
      queue.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      queue.delete(handle);
    },
  };
  const flush = () => {
    const callbacks = Array.from(queue.values());
    queue.clear();
    callbacks.forEach((callback) => callback());
  };
  return { scheduler, flush, pending: () => queue.size };
};

export const createManualTimer = (): {
  timer: IntervalTimer;
  tick(): void;
  active(): number;
  cleared: number[];
} => {
  const timers = new Map<number, () => void>();
  let next = 1;
  const cleared: number[] = [];
  const timer: IntervalTimer = {
    set: (callback) => {
      const id = next;
      next += 1;
      timers.set(id, callback);
      return id;
    },
    clear: (id) => {
      cleared.push(id);
      timers.delete(id);
    },
  };
  const tick = () => timers.forEach((callback) => callback());
  return { timer, tick, cleared, active: () => timers.size };
};
