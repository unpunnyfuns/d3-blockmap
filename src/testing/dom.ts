import { vi } from "vitest";
import type { ImageDataLike } from "../renderer";
import { installPointerCapture } from "./pointerCapture";
import type { InstalledPointerCapture } from "./pointerCapture";

export type DomOptions = {
  dpr?: number;
  deferFrames?: boolean;
  media?: (query: string) => boolean;
};
export type MediaListener = { query: string; listener: () => void };
export type InstalledDom = {
  mount(width?: number): HTMLElement;
  triggerResize(width: number, container?: HTMLElement): void;
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
const DEFAULT_MOUNT_WIDTH = 200;
const MOUNT_HEIGHT_PX = "12px";

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
  // Each instance keeps its own observed targets, so triggerResize can tell
  // which observers actually watch a given container rather than firing
  // every observer that happens to exist.
  const instances: StubResizeObserver[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;
  const puts: ImageDataLike[] = [];
  const mediaListeners: MediaListener[] = [];
  const removedQueries: string[] = [];
  const mounted: HTMLElement[] = [];

  class StubResizeObserver {
    readonly callback: ResizeCallback;
    readonly targets: Element[] = [];
    constructor(callback: ResizeCallback) {
      this.callback = callback;
      instances.push(this);
    }
    observe(target: Element): void {
      this.targets.push(target);
    }
    disconnect(): void {
      const index = instances.indexOf(this);
      if (index !== -1) instances.splice(index, 1);
    }
    unobserve(target: Element): void {
      const index = this.targets.indexOf(target);
      if (index !== -1) this.targets.splice(index, 1);
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
    // Validated eagerly, matching real matchMedia throwing synchronously on a
    // bad query, rather than deferring the default media's throw to whenever
    // something first reads `.matches`.
    media(query);
    const target = {
      // A getter, not a snapshot, so a caller that holds onto the returned
      // MediaQueryList and re-reads `.matches` later sees the media function's
      // current answer rather than the one in effect when matchMedia ran.
      get matches() {
        return media(query);
      },
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
  const originalPutImageData = CanvasRenderingContext2D.prototype.putImageData;
  const putImageDataSpy = vi
    .spyOn(CanvasRenderingContext2D.prototype, "putImageData")
    .mockImplementation(function putImageData(
      this: CanvasRenderingContext2D,
      ...args: Parameters<typeof originalPutImageData>
    ) {
      const image = args[0];
      const copy: ImageDataLike = {
        width: image.width,
        height: image.height,
        data: new Uint8ClampedArray(image.data),
      };
      puts.push(copy);
      return originalPutImageData.apply(this, args);
    });
  const pointerCapture: InstalledPointerCapture = installPointerCapture();

  return {
    mount: (width = DEFAULT_MOUNT_WIDTH) => {
      const container = document.createElement("div");
      container.style.width = `${width}px`;
      container.style.height = MOUNT_HEIGHT_PX;
      document.body.append(container);
      mounted.push(container);
      return container;
    },
    triggerResize: (width, container) => {
      if (instances.length === 0) throw new Error("triggerResize: no observers");
      const targets = container ? [container] : mounted;
      targets.forEach((el) => {
        el.style.width = `${width}px`;
      });
      const entry = createResizeEntry(width);
      const notified = container
        ? instances.filter((instance) => instance.targets.includes(container))
        : instances;
      notified.forEach((instance) => instance.callback([entry]));
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
      putImageDataSpy.mockRestore();
      pointerCapture.restore();
      vi.unstubAllGlobals();
      mounted.forEach((el) => el.remove());
      installed = false;
    },
  };
};
