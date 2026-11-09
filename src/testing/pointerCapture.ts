import { vi } from "vitest";

export type InstalledPointerCapture = {
  restore(): void;
};

// Models per-element pointer capture tracking: setPointerCapture records the
// pointer id against the element, hasPointerCapture reports whether it is
// still held, releasePointerCapture drops it.
// It does not model gotpointercapture/lostpointercapture events, implicit
// release on pointerup/pointercancel, retargeting of subsequent events to
// the capturing element, or the InvalidStateError thrown for an unconnected
// or inactive pointer id.
let installed = false;

export const installPointerCapture = (): InstalledPointerCapture => {
  if (installed) {
    throw new Error("installPointerCapture: already installed; call restore() first");
  }
  installed = true;

  const captured = new WeakMap<Element, Set<number>>();

  const setSpy = vi
    .spyOn(Element.prototype, "setPointerCapture")
    .mockImplementation(function setPointerCapture(this: Element, pointerId: number) {
      const ids = captured.get(this) ?? new Set<number>();
      ids.add(pointerId);
      captured.set(this, ids);
    });
  const releaseSpy = vi
    .spyOn(Element.prototype, "releasePointerCapture")
    .mockImplementation(function releasePointerCapture(this: Element, pointerId: number) {
      captured.get(this)?.delete(pointerId);
    });
  const hasSpy = vi
    .spyOn(Element.prototype, "hasPointerCapture")
    .mockImplementation(function hasPointerCapture(this: Element, pointerId: number) {
      return captured.get(this)?.has(pointerId) ?? false;
    });

  return {
    restore: () => {
      setSpy.mockRestore();
      releaseSpy.mockRestore();
      hasSpy.mockRestore();
      installed = false;
    },
  };
};
