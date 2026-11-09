import { vi } from "vitest";
import type { ImageDataLike } from "../renderer";
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
  puts: ImageDataLike[];
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
const CONTEXT_2D = "2d";

const defaultMedia = (query: string): boolean => {
  if (!KNOWN_QUERIES.some((pattern) => pattern.test(query))) {
    throw new Error(`unexpected matchMedia query: ${query}`);
  }
  return false;
};

const unimplementedMql = (name: string): never => {
  throw new Error(`unimplemented: MediaQueryList.${name}`);
};

const unimplementedEntry = (name: string): never => {
  throw new Error(`unimplemented: ResizeObserverEntry.${name}`);
};

const createResizeEntry = (width: number): ResizeObserverEntry => {
  const target = { contentRect: { width } };
  return new Proxy(target, {
    get: (obj, name) => {
      if (typeof name === "symbol") return undefined;
      if (name in obj) return obj[name as keyof typeof obj];
      return unimplementedEntry(name);
    },
  }) as unknown as ResizeObserverEntry;
};

let installed = false;

export const installDom = (options: DomOptions = {}): InstalledDom => {
  if (installed) {
    throw new Error("installDom: already installed; call restore() first");
  }
  installed = true;

  const media = options.media ?? defaultMedia;
  const observers: ResizeCallback[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;
  const puts: ImageDataLike[] = [];
  const mediaListeners: MediaListener[] = [];
  const removedQueries: string[] = [];
  const mounted: HTMLElement[] = [];

  class StubResizeObserver {
    private readonly callback: ResizeCallback;
    constructor(callback: ResizeCallback) {
      this.callback = callback;
      observers.push(callback);
    }
    observe(): void {}
    disconnect(): void {
      const index = observers.indexOf(this.callback);
      if (index !== -1) observers.splice(index, 1);
    }
    unobserve(): void {
      this.disconnect();
    }
  }

  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  vi.stubGlobal("devicePixelRatio", options.dpr ?? DEFAULT_DPR);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const handle = nextFrameId;
    nextFrameId += 1;
    if (options.deferFrames) {
      frames.set(handle, callback);
      return handle;
    }
    callback(0);
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames.delete(handle);
  });
  vi.stubGlobal("matchMedia", (query: string) => {
    const target = {
      matches: media(query),
      media: query,
      addEventListener: (_type: string, listener: () => void) => {
        mediaListeners.push({ query, listener });
      },
      removeEventListener: (_type: string, listener: () => void) => {
        const index = mediaListeners.findIndex(
          (entry) => entry.query === query && entry.listener === listener,
        );
        if (index !== -1) mediaListeners.splice(index, 1);
        removedQueries.push(query);
      },
    };
    return new Proxy(target, {
      get: (obj, name) => {
        if (typeof name === "symbol") return undefined;
        if (name in obj) return obj[name as keyof typeof obj];
        return unimplementedMql(name);
      },
    }) as unknown as MediaQueryList;
  });
  const contextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation((id: string) => {
      if (id !== CONTEXT_2D) {
        throw new Error(`unimplemented: HTMLCanvasElement.getContext(${id})`);
      }
      const { ctx } = createStubContext();
      return new Proxy(ctx, {
        get: (target, name) => {
          if (name === "putImageData") {
            return (image: ImageDataLike) => {
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
    triggerResize: (width) => {
      if (observers.length === 0) throw new Error("triggerResize: no observers");
      const entry = createResizeEntry(width);
      observers.forEach((cb) => cb([entry]));
    },
    flushFrames: () => {
      for (let round = 0; frames.size > 0; round += 1) {
        if (round >= MAX_FLUSH_ROUNDS) {
          throw new Error("flushFrames: frames keep scheduling frames");
        }
        const pending = Array.from(frames.values());
        frames.clear();
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
      installed = false;
    },
  };
};
