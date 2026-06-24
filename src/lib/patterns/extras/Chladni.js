import { Pattern } from '../drawingContext';
import { applySymmetryDraw } from '../symmetryUtils';
import { registerPattern } from '../../patternRegistry';
import { warpDisplacement } from '../../fields/warp';

/**
 * Chladni — cymatic nodal lines of a vibrating square plate ("sound made
 * visible"). The classic standing-wave superposition on a unit plate [0,1]^2:
 *
 *   f(x,y) = cos(n·π·x)·cos(m·π·y) − cos(m·π·x)·cos(n·π·y)
 *
 * The NODAL lines (where sand collects on a real Chladni plate) are the zero
 * set f(x,y) = 0. We sample f on a `resolution`×`resolution` grid spanning the
 * canvas (origin-centered pixels → plate coords [0,1]), then extract the single
 * iso-contour at threshold 0 via standard 16-case marching squares with linear
 * edge interpolation, and stitch the per-cell segments into connected polylines.
 *
 * Optionally a second mode pair (m2,n2) is blended in by `blend` ∈ [0,1]:
 *   F = (1−blend)·f(m,n) + blend·f(m2,n2)
 * keeping the field signed and bounded (blend=0 → pure first mode).
 *
 * The field is FULLY DETERMINISTIC (pure trig — no noise, no random), but we
 * still seed the context per the pattern contract. Polylines are built ONCE in
 * origin-centered coords: `drawBase` replays them via `ctx`, and the SVG
 * <polyline> strings are emitted from the same array, so canvas == SVG.
 *
 * Unlike TopographicContours (which normalizes the field and marches interior
 * thresholds) we march the RAW SIGNED field at iso=0, treating `corner > 0` as
 * "inside". No normalization — that would push 0 outside the band.
 *
 * Supports radial symmetry (taxonomy sym:true): the real `symmetry` param is
 * passed to applySymmetryDraw.
 */
export default class Chladni extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);
    ctx.noiseSeed(seed);

    const {
      m = 4,
      n = 3,
      blend = 0,
      m2 = 5,
      n2 = 2,
      resolution = 180,
      strokeWeight = 0.6,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // Grid: `res` cells per axis → res+1 sample points per axis.
    const res = Math.max(2, Math.round(resolution));
    const cols = res;
    const rows = res;
    const nx = cols + 1;
    const ny = rows + 1;

    const halfW = canvasW / 2;
    const halfH = canvasH / 2;
    const cellW = canvasW / cols;
    const cellH = canvasH / rows;

    const PI = Math.PI;
    const w = Math.max(0, Math.min(1, blend)); // clamp blend weight

    // Single standing-wave mode pair on the unit plate, evaluated at plate
    // coords (gx, gy) ∈ [0,1]^2.
    const mode = (mm, nn, gx, gy) =>
      Math.cos(nn * PI * gx) * Math.cos(mm * PI * gy) -
      Math.cos(mm * PI * gx) * Math.cos(nn * PI * gy);

    // Full (optionally blended) signed Chladni field at plate coords.
    const fieldAt = (gx, gy) => {
      const f1 = mode(m, n, gx, gy);
      if (w <= 0) return f1;
      const f2 = mode(m2, n2, gx, gy);
      return (1 - w) * f1 + w * f2;
    };

    // --- 1. Build the full signed field up front (corner-shared) --------------
    // World coordinate of sample (i,j), origin-centered → plate coords [0,1].
    const field = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const wy = -halfH + j * cellH;
      const gy = (wy + halfH) / (canvasH || 1); // [0,1]
      for (let i = 0; i < nx; i++) {
        const wx = -halfW + i * cellW;
        const gx = (wx + halfW) / (canvasW || 1); // [0,1]
        field[j * nx + i] = fieldAt(gx, gy);
      }
    }

    // --- 2 & 3. Marching squares at iso=0 + stitch ----------------------------
    const iso = 0;
    const px = (i) => -halfW + i * cellW;
    const py = (j) => -halfH + j * cellH;
    const at = (i, j) => field[j * nx + i];

    // Quantize an endpoint to a stable hash key — marching-squares interpolation
    // yields IDENTICAL coords on a shared edge, so exact rounding joins them.
    const Q = 1e4;
    const key = (x, y) => `${Math.round(x * Q)},${Math.round(y * Q)}`;

    const allPolylines = []; // array of arrays of {x,y}
    const segments = []; // { ax, ay, bx, by }

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        // Corner values (clockwise from top-left): TL, TR, BR, BL.
        const tl = at(i, j);
        const tr = at(i + 1, j);
        const br = at(i + 1, j + 1);
        const bl = at(i, j + 1);

        let code = 0;
        if (tl > iso) code |= 8;
        if (tr > iso) code |= 4;
        if (br > iso) code |= 2;
        if (bl > iso) code |= 1;
        if (code === 0 || code === 15) continue;

        const x0 = px(i);
        const x1 = px(i + 1);
        const y0 = py(j);
        const y1 = py(j + 1);

        // Interpolated crossing points on each edge. Each edge function is only
        // invoked by a case where its two corners straddle iso, so b−a ≠ 0.
        const lerp = (a, b) => (iso - a) / (b - a);
        const top = () => ({ x: x0 + (x1 - x0) * lerp(tl, tr), y: y0 });
        const right = () => ({ x: x1, y: y0 + (y1 - y0) * lerp(tr, br) });
        const bottom = () => ({ x: x0 + (x1 - x0) * lerp(bl, br), y: y1 });
        const left = () => ({ x: x0, y: y0 + (y1 - y0) * lerp(tl, bl) });

        const add = (a, b) => segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });

        // Standard 16-case marching squares. Saddles (5, 10) resolved by the
        // average of the four corners.
        switch (code) {
          case 1: add(left(), bottom()); break;
          case 2: add(bottom(), right()); break;
          case 3: add(left(), right()); break;
          case 4: add(top(), right()); break;
          case 5: {
            const center = (tl + tr + br + bl) / 4;
            if (center > iso) { add(left(), top()); add(bottom(), right()); }
            else { add(left(), bottom()); add(top(), right()); }
            break;
          }
          case 6: add(top(), bottom()); break;
          case 7: add(left(), top()); break;
          case 8: add(top(), left()); break;
          case 9: add(top(), bottom()); break;
          case 10: {
            const center = (tl + tr + br + bl) / 4;
            if (center > iso) { add(top(), right()); add(left(), bottom()); }
            else { add(top(), left()); add(bottom(), right()); }
            break;
          }
          case 11: add(top(), right()); break;
          case 12: add(left(), right()); break;
          case 13: add(bottom(), right()); break;
          case 14: add(left(), bottom()); break;
          default: break;
        }
      }
    }

    stitch(segments, key, allPolylines);

    // --- WARP modulation (geometry-build time) --------------------------------
    // A guide field supplied via params.modulation (channel:'warp') displaces
    // the FINAL nodal-line vertices along the field gradient, AFTER stitching
    // (never before — displacing pre-stitch segments would diverge the shared
    // endpoints the exact hash-join relies on) and BEFORE both the SVG emit and
    // drawBase, so canvas and SVG warp identically. When warpMod is null the
    // arrays are untouched → byte-identical to the unmodulated path.
    const mod = params?.modulation;
    const warpMod = mod && mod.channel === 'warp' && mod.field ? mod : null;
    if (warpMod) {
      for (const poly of allPolylines) {
        for (const pt of poly) {
          const u = (pt.x + canvasW / 2) / canvasW;
          const v = (pt.y + canvasH / 2) / canvasH;
          const { dx, dy } = warpDisplacement(warpMod.field, u, v, warpMod);
          pt.x += dx;
          pt.y += dy;
        }
      }
    }

    // --- Emit SVG + build draw replay -----------------------------------------
    const fmt = (val) => (Math.round(val * 100) / 100).toString();
    for (const poly of allPolylines) {
      if (poly.length < 2) continue;
      const pts = poly.map((pt) => `${fmt(pt.x)},${fmt(pt.y)}`).join(' ');
      this.svgElements.push(
        `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWeight}"/>`
      );
    }

    const drawBase = () => {
      const c = ctx.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      ctx.noFill();
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      for (const poly of allPolylines) {
        if (poly.length < 2) continue;
        ctx.beginShape();
        for (const pt of poly) ctx.vertex(pt.x, pt.y);
        ctx.endShape();
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  // One <polyline> per element, joined plainly (elements are full strings).
  contentFor() {
    return this.svgElements.join('\n');
  }
}

/**
 * Stitch disjoint iso-segments into connected polylines via an exact endpoint
 * hash-join, appending finished polylines to `out`. (Copied from
 * TopographicContours: marching-squares linear interpolation produces identical
 * coordinates for the same crossing on a shared cell edge, so quantized
 * endpoints match exactly — no fuzzy epsilon needed.)
 */
function stitch(segments, key, out) {
  if (segments.length === 0) return;

  const buckets = new Map();
  const addEnd = (k, idx) => {
    let arr = buckets.get(k);
    if (!arr) { arr = []; buckets.set(k, arr); }
    arr.push(idx);
  };
  const seg = segments;
  const used = new Uint8Array(seg.length);
  for (let i = 0; i < seg.length; i++) {
    addEnd(key(seg[i].ax, seg[i].ay), i);
    addEnd(key(seg[i].bx, seg[i].by), i);
  }

  const findFrom = (k) => {
    const arr = buckets.get(k);
    if (!arr) return -1;
    for (const idx of arr) if (!used[idx]) return idx;
    return -1;
  };

  for (let s = 0; s < seg.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const poly = [
      { x: seg[s].ax, y: seg[s].ay },
      { x: seg[s].bx, y: seg[s].by },
    ];
    const startKey = key(seg[s].ax, seg[s].ay);

    // Extend forward from the tail.
    let tail = poly[poly.length - 1];
    while (true) {
      const tk = key(tail.x, tail.y);
      if (tk === startKey) break; // closed loop
      const idx = findFrom(tk);
      if (idx === -1) break;
      used[idx] = 1;
      const sg = seg[idx];
      if (key(sg.ax, sg.ay) === tk) poly.push({ x: sg.bx, y: sg.by });
      else poly.push({ x: sg.ax, y: sg.ay });
      tail = poly[poly.length - 1];
    }

    // Extend backward from the head (open contours only).
    let head = poly[0];
    while (true) {
      const hk = key(head.x, head.y);
      const idx = findFrom(hk);
      if (idx === -1) break;
      used[idx] = 1;
      const sg = seg[idx];
      if (key(sg.ax, sg.ay) === hk) poly.unshift({ x: sg.bx, y: sg.by });
      else poly.unshift({ x: sg.ax, y: sg.ay });
      head = poly[0];
    }

    out.push(poly);
  }
}

const DEFAULTS = {
  m: 4,
  n: 3,
  blend: 0,
  m2: 5,
  n2: 2,
  resolution: 180,
  strokeWeight: 0.6,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

const PARAM_DEFS = [
  { key: 'm', label: 'Mode m', min: 1, max: 12, step: 1, tooltip: 'First standing-wave mode number (vertical). Equal m and n give a blank plate.' },
  { key: 'n', label: 'Mode n', min: 1, max: 12, step: 1, tooltip: 'First standing-wave mode number (horizontal). Higher values pack in more nodal lines.' },
  { key: 'blend', label: 'Blend', min: 0, max: 1, step: 0.01, tooltip: 'Weight of a second superposed mode pair (m2,n2). 0 = pure first mode.' },
  { key: 'm2', label: 'Mode m2', min: 1, max: 12, step: 1, tooltip: 'Second mode number (vertical), mixed in by Blend.' },
  { key: 'n2', label: 'Mode n2', min: 1, max: 12, step: 1, tooltip: 'Second mode number (horizontal), mixed in by Blend.' },
  { key: 'resolution', label: 'Resolution', min: 120, max: 300, step: 10, tooltip: 'Marching-squares grid density. Higher = smoother nodal lines, slower.' },
  { key: 'strokeWeight', label: 'Stroke Weight', min: 0.1, max: 4, step: 0.1, tooltip: 'Thickness of the nodal lines.' },
  { key: 'symmetry', label: 'Symmetry', min: 1, max: 11, step: 1, tooltip: 'Radial symmetry: N rotated copies of the pattern.' },
  { key: 'startAngle', label: 'Start Angle', min: 0, max: 360, step: 1, tooltip: 'Rotation offset in degrees, applied before symmetry copies.' },
  { key: 'offsetX', label: 'Offset X', min: -400, max: 400, step: 1, tooltip: 'Horizontal shift of the pattern origin in pixels.' },
  { key: 'offsetY', label: 'Offset Y', min: -400, max: 400, step: 1, tooltip: 'Vertical shift of the pattern origin in pixels.' },
];

registerPattern('chladni', Chladni, 'Chladni', DEFAULTS, PARAM_DEFS, { isAI: false });
