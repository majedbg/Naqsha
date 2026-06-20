// Convert a text string into vector outline geometry using an opentype.js Font.
// Pure: no I/O, no DOM. The SAME geometry feeds the canvas preview and the SVG
// export, so the two can never drift (the pipeline's core invariant).

// Round to `decimals` places and strip trailing zeros / negative-zero so the
// serialized string is stable and compact. Mirrors opentype's toPathData(3).
function fmt(n, decimals) {
  const r = Number(n.toFixed(decimals));
  return Object.is(r, -0) ? '0' : String(r);
}

/**
 * Serialize opentype path commands to SVG path data DIRECTLY from the command
 * list. We deliberately do NOT use opentype.js's `path.toPathData()`: in
 * opentype 2.0.0 it emits `NaN` coordinates for quadratic (`Q`) segments
 * (TrueType glyphs, e.g. Work Sans), corrupting the export. The raw `commands`
 * are clean, so serializing them ourselves restores the canvas == SVG invariant
 * (the canvas already draws from these same commands).
 *
 * @param {Array<object>} commands opentype path commands
 * @param {number} decimals decimal places (default 3, matching the old call)
 * @returns {string}
 */
export function commandsToPathData(commands, decimals = 3) {
  const f = (n) => fmt(n, decimals);
  let d = '';
  for (const c of commands) {
    if (c.type === 'M') d += `M${f(c.x)} ${f(c.y)}`;
    else if (c.type === 'L') d += `L${f(c.x)} ${f(c.y)}`;
    else if (c.type === 'C') d += `C${f(c.x1)} ${f(c.y1)} ${f(c.x2)} ${f(c.y2)} ${f(c.x)} ${f(c.y)}`;
    else if (c.type === 'Q') d += `Q${f(c.x1)} ${f(c.y1)} ${f(c.x)} ${f(c.y)}`;
    else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

/**
 * @param {string} text
 * @param {{ font: import('opentype.js').Font, fontSize: number, x?: number, y?: number }} opts
 * @returns {{ pathData: string, advanceWidth: number, bbox: {x1:number,y1:number,x2:number,y2:number} }}
 */
export function textToOutline(text, { font, fontSize, x = 0, y = 0 }) {
  const path = font.getPath(text, x, y, fontSize);
  return {
    // Serialize from clean commands (see commandsToPathData) — NOT
    // path.toPathData(), which emits NaN for Q segments in opentype 2.0.0.
    pathData: commandsToPathData(path.commands, 3),
    advanceWidth: font.getAdvanceWidth(text, fontSize),
    bbox: path.getBoundingBox(),
  };
}
