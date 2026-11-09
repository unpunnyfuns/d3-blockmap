import { vi } from "vitest";

export type InstalledPointerCapture = {
  restore(): void;
};

export const installPointerCapture = (): InstalledPointerCapture => {
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
    },
  };
};
