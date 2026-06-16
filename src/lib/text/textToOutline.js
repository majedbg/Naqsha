// Convert a text string into vector outline geometry using an opentype.js Font.
// Pure: no I/O, no DOM. The SAME geometry feeds the canvas preview and the SVG
// export, so the two can never drift (the pipeline's core invariant).

/**
 * @param {string} text
 * @param {{ font: import('opentype.js').Font, fontSize: number, x?: number, y?: number }} opts
 * @returns {{ pathData: string, advanceWidth: number, bbox: {x1:number,y1:number,x2:number,y2:number} }}
 */
export function textToOutline(text, { font, fontSize, x = 0, y = 0 }) {
  const path = font.getPath(text, x, y, fontSize);
  return {
    pathData: path.toPathData(3),
    advanceWidth: font.getAdvanceWidth(text, fontSize),
    bbox: path.getBoundingBox(),
  };
}
