/**
 * The one DOM tweak the tooltip and the axis both need. Kept separate so
 * neither imports the other, and so there is a single place to reason about
 * mutating the host container's style.
 */

/**
 * The tooltip and axis are absolutely positioned children, so the container
 * must be a positioned ancestor or they would escape to the nearest one up
 * the tree. An empty string covers stub environments whose getComputedStyle
 * reports nothing rather than the "static" default.
 */
export const ensureRelative = (container: HTMLElement): void => {
  const position = getComputedStyle(container).position;
  if (position === "static" || !position) container.style.position = "relative";
};
