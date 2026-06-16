// Pure coordinate mapping for the p5 canvas. The canvas is CSS-scaled by
// `finalScale = fitScale * zoom`, so a browser pointer at client coords must be
// divided by that scale (after subtracting the canvas rect origin) to land in
// canvas-internal coordinates. No DOM access — `rect` is just `{left, top}`.

// Map a browser pointer event position to canvas-internal coordinates.
export function screenToCanvas(clientX, clientY, rect, finalScale) {
  return {
    x: (clientX - rect.left) / finalScale,
    y: (clientY - rect.top) / finalScale,
  };
}
