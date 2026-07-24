// Hershey single-line (single-stroke) font → opentype.js-compatible adapter.
//
// WHY. A normal outline font's glyph strokes are CLOSED contours, so an engrave
// traces both edges of every stroke → a DOUBLE line. A Hershey glyph is instead
// a set of OPEN centre-line polylines: one pass per stroke, a true single line —
// the thing a plotter/laser audience actually wants. opentype.js can't give us
// that (it reads outline tables), so we synthesize a Font-SHAPED object here that
// emits M/L polyline commands directly. Because it exposes the SAME small surface
// the text pipeline consumes — getPath()/getAdvanceWidth()/unitsPerEm/tables — it
// drops into layout, canvas draw, hit-test, SVG export and cap-height UNCHANGED.
//
// The ONE thing it can't share is the closed-contour fill/close in the renderers:
// `font.isSingleLine === true` is the flag drawTextNode + TextNode.toSVGGroup read
// to stroke OPEN polylines instead of filling closed shapes.
//
// COORDINATE SYSTEM (measured from the hersheytext data):
//   - Glyph coords are y-DOWN: cap top ≈ 1, baseline ≈ 22, descenders ≈ 29.
//   - Each glyph is authored centred on x = `o`; its ADVANCE is 2·o.
//   - char index = charCode - 33 (index 0 is '!'); space / out-of-range chars
//     advance without drawing.
// We map to opentype's getPath output convention: absolute pixel coords, baseline
// at the passed `y`, y increasing downward.

// Font-unit model. BASE is the baseline row; the em spans the ascender (cap top,
// ~row 1) down to the descender (~row 29), i.e. 28 rows → unitsPerEm 28, with a
// 21-row cap height. These feed cap-height/size readouts consistently with the
// outline fonts (cap ≈ 0.75·em, a hair taller than a 0.7 sans — intentional and
// honest for a mono-weight engraving face).
const BASE = 22;
const UNITS_PER_EM = 28;
const CAP_HEIGHT = 21;
// Advance (in glyph units) for a space / undrawn char — a typical lowercase width.
const SPACE_ADVANCE = 16;

/** Parse a hersheytext `d` string ("M5,1 L5,15 M5,20 L4,21 5,22 …") to subpaths
 *  of {x,y} points. Supports the SVG shorthand where an L is followed by several
 *  coordinate pairs (an implicit polyline). */
function parseHersheyPath(d) {
  const subpaths = [];
  let cur = null;
  // Tokens are either a command letter (M/L) or a "x,y" pair.
  const tokens = d.trim().split(/\s+/);
  let mode = null;
  for (const tok of tokens) {
    if (tok === 'M' || tok === 'L') {
      mode = tok;
      continue;
    }
    // A coord pair, possibly with a leading M/L glued on (defensive).
    let s = tok;
    if (s[0] === 'M' || s[0] === 'L') {
      mode = s[0];
      s = s.slice(1);
    }
    const comma = s.indexOf(',');
    if (comma < 0) continue;
    const x = Number(s.slice(0, comma));
    const y = Number(s.slice(comma + 1));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (mode === 'M') {
      cur = [{ x, y }];
      subpaths.push(cur);
      mode = 'L'; // subsequent bare pairs after an M continue the polyline
    } else if (cur) {
      cur.push({ x, y });
    }
  }
  return subpaths;
}

/** Look up a glyph record for a code point, or null for space / out-of-range. */
function glyphFor(chars, code) {
  const idx = code - 33; // index 0 === '!'
  if (idx < 0 || idx >= chars.length) return null;
  return chars[idx] || null;
}

/**
 * Build an opentype.js-shaped Font from one hersheytext font entry
 * (`{ name, chars: [{ d, o }] }`). Pure; no I/O.
 * @param {{ name?: string, chars: {d:string,o:number}[] }} data
 * @returns {object} a Font-like object with isSingleLine=true
 */
export function makeHersheyFont(data) {
  const chars = data?.chars || [];

  // Total advance of `text` in GLYPH units (pre-scale).
  function advanceUnits(text) {
    let w = 0;
    for (const ch of String(text)) {
      const g = glyphFor(chars, ch.codePointAt(0));
      w += g ? 2 * g.o : SPACE_ADVANCE;
    }
    return w;
  }

  const font = {
    // Marks this as a single-line font: renderers STROKE open polylines and must
    // NOT fill or close contours (that would turn each stroke into a shape).
    isSingleLine: true,
    unitsPerEm: UNITS_PER_EM,
    // Minimal tables the pipeline reads (capHeightPx: tables.os2.sCapHeight).
    tables: { os2: { sCapHeight: CAP_HEIGHT } },

    /** Advance width of `text` at `fontSize` (px). Linear in size. */
    getAdvanceWidth(text, fontSize) {
      return advanceUnits(text) * (fontSize / UNITS_PER_EM);
    },

    /**
     * Mirror opentype's getPath(text, x, y, fontSize): absolute pixel coords,
     * baseline at `y`, y increasing downward. Returns { commands, getBoundingBox }.
     * Commands are only M/L (open polylines) — the single-line contract.
     */
    getPath(text, x = 0, y = 0, fontSize = 72) {
      const s = fontSize / UNITS_PER_EM;
      const commands = [];
      let penX = x;
      for (const ch of String(text)) {
        const code = ch.codePointAt(0);
        const g = glyphFor(chars, code);
        if (!g) {
          penX += SPACE_ADVANCE * s;
          continue;
        }
        for (const sub of parseHersheyPath(g.d)) {
          sub.forEach((pt, i) => {
            commands.push({
              type: i === 0 ? 'M' : 'L',
              x: penX + pt.x * s,
              // y-down glyph → baseline-relative screen y (y grows downward).
              y: y + (pt.y - BASE) * s,
            });
          });
        }
        penX += 2 * g.o * s;
      }
      return {
        commands,
        getBoundingBox() {
          if (!commands.length) return { x1: 0, y1: 0, x2: 0, y2: 0 };
          let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
          for (const c of commands) {
            if (c.x < x1) x1 = c.x;
            if (c.y < y1) y1 = c.y;
            if (c.x > x2) x2 = c.x;
            if (c.y > y2) y2 = c.y;
          }
          return { x1, y1, x2, y2 };
        },
      };
    },
  };
  return font;
}
