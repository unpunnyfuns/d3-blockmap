export const fire = (
  target: EventTarget,
  type: string,
  init: Record<string, unknown> = {},
  props: Record<string, unknown> = {},
): Event => {
  const Ctor = type === "wheel" ? WheelEvent : MouseEvent;
  const event = new Ctor(type, { bubbles: true, cancelable: true, ...init });
  Object.entries(props).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  target.dispatchEvent(event);
  return event;
};

export const ctrlWheel = (target: EventTarget, deltaY: number, offsetX: number): Event =>
  fire(target, "wheel", { deltaY }, { ctrlKey: true, offsetX });

export const pointer = (
  target: EventTarget,
  type: string,
  offsetX: number,
  pointerId = 1,
  button = 0,
): Event => fire(target, type, { button }, { offsetX, pointerId });
