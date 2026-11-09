export const ensureRelative = (container: HTMLElement): void => {
  const position = getComputedStyle(container).position;
  if (position === "static" || !position) container.style.position = "relative";
};
