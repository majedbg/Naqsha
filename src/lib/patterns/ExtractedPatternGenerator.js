// ExtractedPatternGenerator — runtime Pattern subclass for photo-extracted
// patterns (S0 spine, issue #49; PRD #48 "Domain / persistence").
//
// The twin of ImportedPath, but built from an ExtractedPattern ENTITY instead
// of raw layer params: a class factory closes over the saved tile so useCanvas
// can instantiate it through the dynamic registry like any other pattern.
//
//   - generate(): draws a polyline approximation of the tile on the p5 canvas
//     (curves flattened, canvas is best-effort preview) with STATIC single-tile
//     placement, centered. Lattice tiling arrives in S1 through the same class.
//   - toSVGGroup(): emits every saved `d` VERBATIM (faithful digitization —
//     locked decision 1) inside a centering translate; fills render evenodd so
//     hole subpaths survive, and every path carries its engrave/cut/score role
//     as data-role (locked decision 9).
//
// Registration puts the pattern in the picker's synthetic 'custom' family
// (locked decision 6 — one entity, two surfaces) flagged origin:'extracted',
// NOT isAI, so later slices can badge it 📷 without a registry migration.

import { Pattern } from './drawingContext';
import { registerPattern } from '../patternRegistry';
import { escapeAttr } from '../extraction/extractedPattern';
import { addLibraryEntry } from '../libraryStore';

const CURVE_SEGMENTS = 12;

/**
 * Flatten a path `d` string (M/m/L/l/H/h/V/v/C/c/Z/z) into subpaths of
 * absolute points. Cubic Béziers are sampled; unknown commands throw (the
 * serializer only ever emits the supported set). Exported for reuse/tests.
 *
 * @returns {{points: [number, number][], closed: boolean}[]}
 */
export function flattenPathD(d, curveSegments = CURVE_SEGMENTS) {
  const tokens = (d || '').match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const subpaths = [];
  let current = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let cmd = null;
  let i = 0;
  const num = () => Number(tokens[i++]);
  const openSub = () => {
    current = { points: [[x, y]], closed: false };
    subpaths.push(current);
    startX = x;
    startY = y;
  };
  const lineTo = () => current && current.points.push([x, y]);
  const cubicTo = (x1, y1, x2, y2, ex, ey) => {
    for (let s = 1; s <= curveSegments; s++) {
      const t = s / curveSegments;
      const u = 1 - t;
      const px = u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex;
      const py = u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey;
      current && current.points.push([px, py]);
    }
    x = ex;
    y = ey;
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': x = num(); y = num(); openSub(); cmd = 'L'; break;
      case 'm': x += num(); y += num(); openSub(); cmd = 'l'; break;
      case 'L': x = num(); y = num(); lineTo(); break;
      case 'l': x += num(); y += num(); lineTo(); break;
      case 'H': x = num(); lineTo(); break;
      case 'h': x += num(); lineTo(); break;
      case 'V': y = num(); lineTo(); break;
      case 'v': y += num(); lineTo(); break;
      case 'C': {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), ex = num(), ey = num();
        cubicTo(x1, y1, x2, y2, ex, ey);
        break;
      }
      case 'c': {
        const x1 = x + num(), y1 = y + num(), x2 = x + num(), y2 = y + num(), ex = x + num(), ey = y + num();
        cubicTo(x1, y1, x2, y2, ex, ey);
        break;
      }
      case 'Z':
      case 'z':
        if (current) current.closed = true;
        x = startX;
        y = startY;
        break;
      default:
        throw new Error(`flattenPathD: unsupported command "${cmd}"`);
    }
  }
  return subpaths.filter((s) => s.points.length > 1 || s.closed);
}

/**
 * Build the runtime Pattern class for one ExtractedPattern entity.
 */
export function makeExtractedPatternClass(entity) {
  const tile = entity.tile;

  return class ExtractedPatternGenerator extends Pattern {
    generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
      const ox = (canvasW - tile.width) / 2;
      const oy = (canvasH - tile.height) / 2;
      const alpha = Math.round((Math.max(0, Math.min(100, opacity ?? 100)) / 100) * 255);
      const c = ctx.color(color || '#000000');
      if (c && typeof c.setAlpha === 'function') c.setAlpha(alpha);

      const drawPaths = (paths, filled) => {
        for (const { d } of paths) {
          for (const sub of flattenPathD(d)) {
            if (filled) {
              ctx.noStroke();
              ctx.fill(c);
            } else {
              ctx.noFill();
              ctx.stroke(c);
            }
            ctx.beginShape();
            for (const [px, py] of sub.points) ctx.vertex(px + ox, py + oy);
            ctx.endShape(sub.closed ? ctx.CLOSE : undefined);
          }
        }
      };
      drawPaths(tile.fills, true);
      drawPaths(tile.strokes, false);
    }

    /**
     * Export: verbatim `d` per saved path inside a centering translate.
     * Bypasses base symmetry wrapping — the tile is placed as-is.
     */
    toSVGGroup(layerId, color, opacity) {
      // _lastCx/_lastCy are recorded by Pattern.generateWithContext.
      const ox = (this._lastCx ?? tile.width / 2) - tile.width / 2;
      const oy = (this._lastCy ?? tile.height / 2) - tile.height / 2;
      const opacityFrac = Math.max(0, Math.min(100, opacity ?? 100)) / 100;
      // Every interpolation is attribute-escaped (adversarial-review finding 1):
      // this markup reaches dangerouslySetInnerHTML (picker thumbnails) and the
      // exported SVG file, and the tile ultimately came from a stored row.
      // Escaping is a no-op for well-formed path data / roles, so faithful
      // digitization (locked decision 1) is unaffected.
      const fill = escapeAttr(color);
      const inner = [
        ...tile.fills.map(
          ({ d, role }) =>
            `    <path d="${escapeAttr(d)}" fill="${fill}" fill-rule="evenodd" stroke="none" data-role="${escapeAttr(role)}"/>`
        ),
        ...tile.strokes.map(
          ({ d, role }) =>
            `    <path d="${escapeAttr(d)}" fill="none" stroke="${fill}" stroke-width="1" data-role="${escapeAttr(role)}"/>`
        ),
      ].join('\n');
      return `<g id="${escapeAttr(layerId)}" opacity="${opacityFrac}" transform="translate(${ox} ${oy})">\n${inner}\n  </g>`;
    }
  };
}

/**
 * Register an ExtractedPattern into the dynamic registry so it appears in the
 * picker's custom family and is placeable/exportable like any pattern.
 * No params in S0 (free tier = fixed tile; live knobs are the paid v-next).
 *
 * This is the SINGLE write path for both library surfaces (locked decision 6):
 * it also indexes the entity into libraryStore so the Library view (S1, issue
 * #50) lists exactly what the picker registered — cloud-loaded and
 * session-only entries alike. `extras` carries transient display data:
 *   - photoURL:  session dataURL of the source photo (guest saves have no
 *                storage path but should still show their photo this session)
 *   - createdAt: the row's created_at ISO string (cloud loads) for ordering.
 */
export function registerExtractedPattern(entity, extras = {}) {
  const PatternClass = makeExtractedPatternClass(entity);
  registerPattern(entity.patternId, PatternClass, entity.title, {}, [], {
    isAI: false,
    origin: 'extracted',
  });
  addLibraryEntry(entity, extras);
  return PatternClass;
}
