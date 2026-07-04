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
import {
  registerPattern,
  unregisterPattern,
  getDynamicTypes,
} from '../patternRegistry';
import { escapeAttr } from '../extraction/extractedPattern';
import { tilePlacements } from '../extraction/tileComposer';
import { addLibraryEntry, clearLibraryEntries } from '../libraryStore';
import { roleColor } from '../fabrication.js';

const CURVE_SEGMENTS = 12;

// Fraction of the grid cell a lattice-stamped motif fills (longest tile side →
// cellSize * this). < 1 leaves a small gutter so adjacent/rotated stamps stay
// legible rather than touching. Motif size then tracks grid spacing.
const LATTICE_FILL = 0.9;

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

/** SVG number formatting for transform offsets: finite, ≤3 decimals. */
function fmtNum(n) {
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Build the runtime Pattern class for one ExtractedPattern entity.
 *
 * S5 (issue #54): when the entity carries a lattice, BOTH surfaces tile the
 * motif through the same placement source (tileComposer.tilePlacements) —
 * generate() stamps the tile at every placement on the p5 canvas, and
 * toSVGGroup() emits one translate-group per placement (fills AND centerline
 * strokes, roles preserved per copy). No lattice → the pre-S5 single centered
 * tile, byte-identical.
 *
 * GRID-GUIDE LATTICE (this session): additionally, a Grid layer can drive the
 * motif via the 'lattice' modulation channel — `params.modulation.nodes`. That
 * path takes precedence over the entity's own S5 lattice (it's an explicit user
 * mapping), rotates each copy with its grid-symmetry frame, and fit-to-cell
 * scales so the tile tracks grid spacing. The two tiling mechanisms coexist.
 */
export function makeExtractedPatternClass(entity) {
  const tile = entity.tile;
  const lattice = entity.lattice ?? null;

  return class ExtractedPatternGenerator extends Pattern {
    // Capability marker (issue #68): the export path duck-types this to decide
    // whether a layer's per-path fabrication roles (data-role) should drive the
    // export COLORS on a laser profile. A capability flag — not `instanceof` —
    // because makeExtractedPatternClass mints a fresh class per entity, so a
    // constructor-based check would fail across factory calls.
    supportsRoleExport = true;

    generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
      const alpha = Math.round((Math.max(0, Math.min(100, opacity ?? 100)) / 100) * 255);
      const c = ctx.color(color || '#000000');
      if (c && typeof c.setAlpha === 'function') c.setAlpha(alpha);

      // Draw the tile's paths in tile-LOCAL coords translated by (ox, oy). Any
      // rotation/scale is set up by the caller on the ctx transform stack, so
      // this one routine serves the centred tile, the S5 lattice placements, and
      // the grid-guide per-node stamps alike.
      const drawPaths = (paths, filled, ox, oy) => {
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
      const drawTile = (ox, oy) => {
        drawPaths(tile.fills, true, ox, oy);
        drawPaths(tile.strokes, false, ox, oy);
      };

      // GRID-GUIDE LATTICE (modulation channel 'lattice'): a Grid layer acts as a
      // guide and stamps this motif at each of its intersection nodes, rotated
      // with the node's symmetry copy and fit-to-cell scaled so the (photo-sized)
      // tile tracks grid spacing instead of overlapping into a blob. Precedence
      // over the entity's own S5 lattice — it's an explicit user mapping. Cached
      // (_latticeNodes/_latticeScale) so toSVGGroup emits identical placements
      // (canvas == SVG from one shared array).
      const gridMod =
        params?.modulation?.channel === 'lattice' ? params.modulation : null;
      if (gridMod && Array.isArray(gridMod.nodes)) {
        const cx = canvasW / 2;
        const cy = canvasH / 2;
        const longest = Math.max(tile.width, tile.height) || 1;
        const scale =
          gridMod.cellSize > 0 ? (gridMod.cellSize * LATTICE_FILL) / longest : 1;
        const nodes = gridMod.nodes.map((nd) => ({
          x: cx + nd.x,
          y: cy + nd.y,
          angle: nd.angle || 0,
        }));
        this._latticeNodes = nodes;
        this._latticeScale = scale;
        for (const nd of nodes) {
          ctx.push();
          ctx.translate(nd.x, nd.y);
          if (nd.angle) ctx.rotate(nd.angle);
          if (scale !== 1) ctx.scale(scale);
          drawTile(-tile.width / 2, -tile.height / 2);
          ctx.pop();
        }
        return;
      }
      this._latticeNodes = null;

      // S5 entity lattice (photo-derived) → tile across the canvas, grid anchored
      // at (0,0); otherwise the single-motif floor renders centred as before.
      const placements = lattice
        ? tilePlacements(lattice, { width: canvasW, height: canvasH })
        : [{ x: (canvasW - tile.width) / 2, y: (canvasH - tile.height) / 2 }];
      for (const { x, y } of placements) {
        drawTile(x, y);
      }
    }

    /**
     * Export: verbatim `d` per saved path. No lattice → a single centering
     * translate (pre-S5, byte-identical). A grid-guide lattice → one rotated +
     * scaled translate-group per cached node; an S5 entity lattice → one
     * translate-group per placement. Every copy carries its engrave/cut/score
     * roles, and on a laser profile (opts.roleColors) is painted by role.
     */
    toSVGGroup(layerId, color, opacity, opts = {}) {
      const opacityFrac = Math.max(0, Math.min(100, opacity ?? 100)) / 100;
      // Every interpolation is attribute-escaped (adversarial-review finding 1):
      // this markup reaches dangerouslySetInnerHTML (picker thumbnails) and the
      // exported SVG file, and the tile ultimately came from a stored row.
      // Escaping is a no-op for well-formed path data / roles, so faithful
      // digitization (locked decision 1) is unaffected. Lattice offsets are
      // validated finite numbers, formatted through fmtNum — digits only.
      //
      // ROLE COLORS (issue #68): on a laser profile the export path requests
      // `opts.roleColors`, so each path is painted by ITS OWN fabrication role
      // (engrave #000 / cut #FF0000 / score #00F — the locked LightBurn/xTool
      // convention via roleColor) instead of the single layer color. Laser
      // software maps operations BY COLOR, so this is what makes engrave/cut/
      // score land as three distinct, separately-mappable operations. Without
      // roleColors (plotter/display/thumbnail), output is byte-identical to
      // before: every path uses the single escaped layer color.
      const roleColors = !!opts?.roleColors;
      const singleFill = escapeAttr(color);
      const colorFor = (role) =>
        roleColors ? escapeAttr(roleColor(role)) : singleFill;
      const pathsAt = (indent) =>
        [
          ...tile.fills.map(
            ({ d, role }) =>
              `${indent}<path d="${escapeAttr(d)}" fill="${colorFor(role)}" fill-rule="evenodd" stroke="none" data-role="${escapeAttr(role)}"/>`
          ),
          ...tile.strokes.map(
            ({ d, role }) =>
              `${indent}<path d="${escapeAttr(d)}" fill="none" stroke="${colorFor(role)}" stroke-width="1" data-role="${escapeAttr(role)}"/>`
          ),
        ].join('\n');

      // GRID-GUIDE LATTICE: one translate→rotate→scale→centre group per cached
      // node, mirroring generate() exactly (canvas == SVG). Reuses pathsAt so the
      // laser role-colors compose with grid stamps too.
      if (Array.isArray(this._latticeNodes) && this._latticeNodes.length) {
        const cxt = -tile.width / 2;
        const cyt = -tile.height / 2;
        const s = this._latticeScale ?? 1;
        const scl = s !== 1 ? ` scale(${s.toFixed(6)})` : '';
        const groups = this._latticeNodes
          .map((nd) => {
            const deg = ((nd.angle || 0) * 180) / Math.PI;
            const rot = deg ? ` rotate(${deg.toFixed(4)})` : '';
            return `    <g transform="translate(${nd.x.toFixed(2)} ${nd.y.toFixed(2)})${rot}${scl} translate(${cxt.toFixed(2)} ${cyt.toFixed(2)})">\n${pathsAt('      ')}\n    </g>`;
          })
          .join('\n');
        return `<g id="${escapeAttr(layerId)}" opacity="${opacityFrac}">\n${groups}\n  </g>`;
      }

      // S5 entity lattice, or the single centred tile (pre-S5, byte-identical).
      if (!lattice) {
        // _lastCx/_lastCy are recorded by Pattern.generateWithContext.
        const ox = (this._lastCx ?? tile.width / 2) - tile.width / 2;
        const oy = (this._lastCy ?? tile.height / 2) - tile.height / 2;
        return `<g id="${escapeAttr(layerId)}" opacity="${opacityFrac}" transform="translate(${ox} ${oy})">\n${pathsAt('    ')}\n  </g>`;
      }

      const canvasW = (this._lastCx ?? tile.width / 2) * 2;
      const canvasH = (this._lastCy ?? tile.height / 2) * 2;
      const copies = tilePlacements(lattice, { width: canvasW, height: canvasH })
        .map(
          ({ x, y }) =>
            `    <g transform="translate(${fmtNum(x)} ${fmtNum(y)})">\n${pathsAt('      ')}\n    </g>`
        )
        .join('\n');
      return `<g id="${escapeAttr(layerId)}" opacity="${opacityFrac}">\n${copies}\n  </g>`;
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

/**
 * Sign-out hygiene (S1 review): drop EVERY extracted-origin pattern from both
 * library surfaces — the dynamic registry (picker custom family) and the
 * libraryStore (Library view) — so the next account on a shared browser never
 * sees the previous account's entries. Selective on `origin === 'extracted'`:
 * builtin extras and AI patterns follow their own lifecycle and are untouched.
 * (The store itself only ever holds extracted entities — single write path —
 * so clearing it wholesale is exact, not approximate.)
 */
export function clearExtractedPatterns() {
  const extractedIds = getDynamicTypes()
    .filter((t) => t.origin === 'extracted')
    .map((t) => t.id); // snapshot first: unregisterPattern splices the live array
  extractedIds.forEach(unregisterPattern);
  clearLibraryEntries();
}
