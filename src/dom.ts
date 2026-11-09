/**
 * The DOM odds and ends several modules need: the container tweak the tooltip,
 * axis and brush overlay all depend on, and the pointer-to-canvas coordinate
 * conversion the tooltip, click and interaction all work in. Kept here so
 * none of them has to import another, and so there is a single place to
 * reason about mutating the host container's style.
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

/**
 * Pointer position within the canvas, in css pixels. Listeners sit on the
 * container, so offsetX would be relative to whichever child was hit, while
 * the canvas rect is the frame the renderer paints in. The rect is read per
 * event because scrolling or a layout change moves it without any resize the
 * map hears about.
 */
export const canvasX = (canvas: HTMLCanvasElement, event: { clientX: number }): number =>
  event.clientX - canvas.getBoundingClientRect().left;
