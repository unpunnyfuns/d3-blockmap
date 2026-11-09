const POINTER_EVENT_TYPES = new Set([
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "pointerleave",
  "pointerenter",
  "pointerover",
  "pointerout",
]);

export const fire = (
  target: EventTarget,
  type: string,
  init: Record<string, unknown> = {},
): Event => {
  const Ctor =
    type === "wheel" ? WheelEvent : POINTER_EVENT_TYPES.has(type) ? PointerEvent : MouseEvent;
  const event = new Ctor(type, { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

export const at = (target: EventTarget, offsetX: number): { clientX: number; clientY: number } => {
  const rect = (target as Element).getBoundingClientRect();
  return { clientX: rect.left + offsetX, clientY: rect.top + rect.height / 2 };
};

export const ctrlWheel = (target: EventTarget, deltaY: number, offsetX: number): Event =>
  fire(target, "wheel", { deltaY, ctrlKey: true, ...at(target, offsetX) });

export const metaWheel = (target: EventTarget, deltaY: number, offsetX: number): Event =>
  fire(target, "wheel", { deltaY, metaKey: true, ...at(target, offsetX) });

export const pointer = (
  target: EventTarget,
  type: string,
  offsetX: number,
  pointerId = 1,
  button = 0,
): Event => fire(target, type, { button, pointerId, ...at(target, offsetX) });
