import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

/**
 * TopographicContours — nested iso-contour loops of a seeded noise field, drawn
 * as a topographic map via marching squares.
 *
 * Pipeline:
 *   1. Sample an fBm (fractional-Brownian-motion) scalar field on a `resolution`
 *      × `resolution` grid spanning the canvas, coordinates origin-centered.
 *      Optional domain warp offsets each sample's noise input by a low-frequency
 *      noise lookup. The field is normalized to [0,1] by its actual min/max.
 *   2. For each of `levels` interior thresholds (spaced across [0,1], remapped by
 *      `levelBias`), run standard 16-case marching squares with linear edge
 *      interpolation to extract per-cell iso segments.
 *   3. Stitch the per-cell segments at each level into connected polylines via an
 *      exact endpoint hash-join (marching-squares interpolation is identical on
 *      shared edges, so quantized endpoints match exactly). Interior contours
 *      close into loops; edge-touching contours stay open. This collapses
 *      thousands of 1-cell fragments into a handful of pen strokes.
 *
 * The polylines are built ONCE in absolute, origin-centered coords. `drawBase`
 * replays them via `ctx`, and the SVG <polyline> strings are emitted from the
 * same array, so canvas == SVG and the whole thing is seed-deterministic.
 *
 * Determinism: the ENTIRE field is sampled up front (all ctx.noise calls happen
 * in one fixed-order pass), so for a fixed seed/resolution/octaves/warp the field
 * is byte-identical regardless of `levels` — more levels strictly means more
 * interior thresholds, hence more contour bands. This pattern has NO symmetry
 * control — symmetry is hardcoded to 1.
 */
export default class TopographicContours extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    ctx.noiseSeed(seed);
    ctx.randomSeed(seed);
    this.svgElements = [];

    const {
      levels = 16,
      noiseScale = 2.5,
      octaves = 3,
      warp = 0,
      levelBias = 0,
      resolution = 160,
      strokeWeight = 0.6,
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
    const octCount = Math.max(1, Math.round(octaves));

    // Base divisor maps a noiseScale of ~2.5 to "a few features across the
    // canvas". We sample noise input at (worldCoord / featureSize) where
    // featureSize shrinks as noiseScale grows (higher zoom = more features).
    const longest = Math.max(canvasW, canvasH) || 1;
    const baseFreq = noiseScale / longest;

    // fBm sampler. Returns an UNnormalized fBm value (~0..1-ish but not exact);
    // we normalize the whole field afterward by its sampled extent. All ctx.noise
    // calls flow through here so the call ORDER is a pure function of the grid +
    // octaves + warp (never of `levels`).
    const fbm = (wx, wy) => {
      let wpx = wx;
      let wpy = wy;
      // Domain warp: displace the sample point by a low-frequency noise lookup.
      // warp=0 → no displacement, but we still issue the same number of noise
      // calls per grid point regardless (calls are unconditional below only when
      // warp>0, so the call count is stable across a single generate run).
      if (warp > 0) {
        const wf = baseFreq * 0.5;
        const wnx = ctx.noise(wx * wf + 11.3, wy * wf + 4.7);
        const wny = ctx.noise(wx * wf + 31.7, wy * wf + 71.1);
        const amp = warp * longest * 0.25;
        wpx = wx + (wnx - 0.5) * 2 * amp;
        wpy = wy + (wny - 0.5) * 2 * amp;
      }
      let sum = 0;
      let amp = 1;
      let freq = baseFreq;
      let norm = 0;
      for (let o = 0; o < octCount; o++) {
        sum += amp * ctx.noise(wpx * freq + 100, wpy * freq + 100);
        norm += amp;
        freq *= 2;
        amp *= 0.5;
      }
      return sum / norm; // normalized by amplitude sum → roughly 0..1
    };

    // --- 1. Build the full field up front (all noise calls happen here) -------
    const field = new Float64Array(nx * ny);
    let fMin = Infinity;
    let fMax = -Infinity;
    for (let j = 0; j < ny; j++) {
      const wy = -halfH + j * cellH;
      for (let i = 0; i < nx; i++) {
        const wx = -halfW + i * cellW;
        const v = fbm(wx, wy);
        field[j * nx + i] = v;
        if (v < fMin) fMin = v;
        if (v > fMax) fMax = v;
      }
    }
    // Normalize to [0,1] by actual sampled extent (robust to octaves/warp and to
    // the headless harness's uniform noise). Guard a flat field.
    const range = fMax - fMin || 1;
    for (let k = 0; k < field.length; k++) {
      field[k] = (field[k] - fMin) / range;
    }

    // --- 2 & 3. Marching squares + stitch, per threshold ----------------------
    // World coordinate of sample (i, j), origin-centered.
    const px = (i) => -halfW + i * cellW;
    const py = (j) => -halfH + j * cellH;
    const at = (i, j) => field[j * nx + i];

    // Quantize an endpoint to a stable hash key (marching-squares interpolation
    // yields IDENTICAL coords on a shared edge, so exact rounding joins them).
    const Q = 1e4; // 4 decimal places
    const key = (x, y) => `${Math.round(x * Q)},${Math.round(y * Q)}`;

    const allPolylines = []; // array of arrays of {x,y}

    for (let li = 0; li < levels; li++) {
      // Interior thresholds in (0,1), remapped by levelBias. Even spacing is
      // t = (li+0.5)/levels; threshold value = t^(2^bias). bias>0 → thresholds
      // cluster toward LOW field values (valleys); bias<0 → toward HIGH (peaks).
      const t = (li + 0.5) / levels;
      const p = Math.pow(2, levelBias);
      const iso = Math.pow(t, p);

      // Collect this level's segments, then stitch.
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

          // Interpolated crossing points on each edge.
          const lerp = (a, b) => (iso - a) / (b - a);
          // Top edge (TL→TR), x varies.
          const top = () => ({ x: x0 + (x1 - x0) * lerp(tl, tr), y: y0 });
          // Right edge (TR→BR), y varies.
          const right = () => ({ x: x1, y: y0 + (y1 - y0) * lerp(tr, br) });
          // Bottom edge (BL→BR), x varies.
          const bottom = () => ({ x: x0 + (x1 - x0) * lerp(bl, br), y: y1 });
          // Left edge (TL→BL), y varies.
          const left = () => ({ x: x0, y: y0 + (y1 - y0) * lerp(tl, bl) });

          const add = (a, b) => segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });

          // Standard 16-case marching squares. Ambiguous saddles (5, 10) are
          // resolved using the average of the four corners.
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
    }

    // --- Emit SVG + build draw replay -----------------------------------------
    const fmt = (n) => (Math.round(n * 100) / 100).toString();
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

    // Symmetry hardcoded to 1 (this pattern has no symmetry control).
    applySymmetryDraw(ctx, 1, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  // One <polyline> per element, joined plainly (mirrors ModuleGrid/Feather).
  // toSVGGroup is inherited: it wraps with wrapSVGSymmetry(symmetry || 1, ...),
  // so symmetry defaults to 1 with no symmetry param.
  contentFor() {
    return this.svgElements.join('\n');
  }
}

/**
 * Stitch disjoint iso-segments into connected polylines via an exact endpoint
 * hash-join, appending finished polylines to `out`.
 *
 * Marching-squares linear interpolation produces IDENTICAL coordinates for the
 * same crossing on a shared cell edge, so quantized endpoints match exactly — no
 * fuzzy epsilon needed. We greedily pick an unused segment and extend it from
 * both ends until no segment shares the current endpoint (open contour, hit the
 * canvas edge) or the polyline closes back on its start (interior loop).
 */
function stitch(segments, key, out) {
  if (segments.length === 0) return;

  // endpoint key → list of segment indices touching it.
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

  // Find an unused segment that has `k` as one endpoint; return its index.
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
      // Append the endpoint that ISN'T the shared one.
      if (key(sg.ax, sg.ay) === tk) poly.push({ x: sg.bx, y: sg.by });
      else poly.push({ x: sg.ax, y: sg.ay });
      tail = poly[poly.length - 1];
    }

    // Extend backward from the head (open contours only — a closed loop already
    // returned to startKey above and will not gain new segments here).
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
