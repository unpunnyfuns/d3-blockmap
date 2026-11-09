import { vi } from "vitest";
import { createStubContext } from "./canvas";

export type DomOptions = {
  dpr?: number;
  deferFrames?: boolean;
  media?: (query: string) => boolean;
};
export type MediaListener = { query: string; listener: () => void };
export type InstalledDom = {
  mount(): HTMLElement;
  triggerResize(width: number): void;
  flushFrames(): void;
  puts: ImageData[];
  mediaListeners: MediaListener[];
  removedQueries: string[];
  restore(): void;
};

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

const KNOWN_QUERIES = [
  /^\(resolution: [\d.]+dppx\)$/,
  /^\(prefers-color-scheme: dark\)$/,
  /^\(prefers-reduced-motion: reduce\)$/,
];
const DEFAULT_DPR = 2;
const MAX_FLUSH_ROUNDS = 10;

const defaultMedia = (query: string): boolean => {
  if (!KNOWN_QUERIES.some((pattern) => pattern.test(query))) {
    throw new Error(`unexpected matchMedia query: ${query}`);
  }
  return false;
};

export const installDom = (options: DomOptions = {}): InstalledDom => {
  const media = options.media ?? defaultMedia;
  const observers: ResizeCallback[] = [];
  const frames: FrameRequestCallback[] = [];
  const puts: ImageData[] = [];
  const mediaListeners: MediaListener[] = [];
  const removedQueries: string[] = [];
  const mounted: HTMLElement[] = [];

  class StubResizeObserver {
    constructor(callback: ResizeCallback) {
      observers.push(callback);
    }
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }

  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  vi.stubGlobal("devicePixelRatio", options.dpr ?? DEFAULT_DPR);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    if (options.deferFrames) {
      frames.push(callback);
      return frames.length;
    }
    callback(0);
    return 1;
  });
  // Cancellation by index is approximate: it only correctly removes the most
  // recently scheduled handle, since earlier handles shift once frames are
  // flushed or other frames are cancelled.
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames.splice(handle - 1, 1);
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: media(query),
    addEventListener: (_type: string, listener: () => void) => {
      mediaListeners.push({ query, listener });
    },
    removeEventListener: () => {
      removedQueries.push(query);
    },
  }));
  const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const { ctx, puts: local } = createStubContext();
    return new Proxy(ctx, {
      get: (target, name) => {
        if (name === "putImageData") {
          return (image: ImageData) => {
            local.push(image);
            puts.push(image);
          };
        }
        return target[name as keyof typeof target];
      },
    }) as unknown as CanvasRenderingContext2D;
  });

  return {
    mount: () => {
      const container = document.createElement("div");
      document.body.append(container);
      mounted.push(container);
      return container;
    },
    triggerResize: (width) =>
      observers.forEach((cb) => cb([{ contentRect: { width } } as unknown as ResizeObserverEntry])),
    flushFrames: () => {
      for (let round = 0; frames.length > 0; round += 1) {
        if (round >= MAX_FLUSH_ROUNDS) {
          throw new Error("flushFrames: frames keep scheduling frames");
        }
        const pending = frames.splice(0, frames.length);
        pending.forEach((callback) => callback(0));
      }
    },
    puts,
    mediaListeners,
    removedQueries,
    restore: () => {
      contextSpy.mockRestore();
      vi.unstubAllGlobals();
      mounted.forEach((el) => el.remove());
    },
  };
};
