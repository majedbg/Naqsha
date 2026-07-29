import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

/**
 * Rinceau — the serpentine running-scroll spine (a.k.a. the undulating vine
 * border), the single most common carpet-border and frieze construction there
 * is. See docs/vine-scaffolds-RESEARCH.md §2 for the historical construction.
 *
 * WHAT IT EMITS, AND WHY IT MATTERS:
 * ONE OPEN POLYLINE PER STRIP ROW — `beginShape()` → `vertex()×n` → `endShape()`
 * with NO `CLOSE`. That is the entire point of the pattern: it is registered as
 * an EDGE motif host (hostKinds.js) so a vine motif can ride each spine root→tip
 * via arc-length sampling. Closing a row, or splitting one into per-segment
 * `ctx.line` calls, would destroy the host contract even though the canvas would
 * look identical.
 *
 * THE SPINE, precisely (RESEARCH §2 step 1):
 *   • `waveform: 'sine'`   — the textbook `n = sin(kx + φ)` centerline.
 *   • `waveform: 'scroll'` — a chain of cubic-Bézier half-wave S-modules, which
 *     reads closer to a real rinceau than a pure sine. Module k runs crest→crest
 *     from (u_k, ∓1) to (u_k+1, ±1) with HORIZONTAL handles of length
 *     `tension · halfLen`, so successive modules meet C¹ at every crest:
 *         P0=(u0,n0)  P1=(u0+c·h, n0)  P2=(u1−c·h, n1)  P3=(u1,n1)
 *     `tension` is the whole character knob. Near 0.05 the crests are pinched
 *     and the runs read as near-straight zigzag; at 1.0 the crests flatten into
 *     long horizontal shelves joined by near-vertical risers — the squared-off
 *     ornamental scroll. It is CAPPED AT 1.0 on purpose: dx/dt = h·3(2t−1)² at
 *     c=1, which is ≥ 0, so the along-axis coordinate stays monotone. Past 1.0
 *     the module doubles back on itself and the spine self-intersects.
 *
 * FRAME: every coordinate is ORIGIN-CENTRED, because `applySymmetryDraw` (canvas)
 * and `wrapSVGSymmetry` (export) both translate by (cx+offsetX, cy+offsetY)
 * before replaying this geometry. Computing in absolute canvas space would put
 * the art at double the offset on BOTH surfaces — an error a canvas==SVG parity
 * test cannot see, because both sides share it.
 *
 * `amplitude` is a fraction of the CROSS-AXIS canvas extent — canvasH when the
 * strip runs horizontally, canvasW when vertically. That is the ONE named
 * reference dimension, and `stripOffset` / `rowSpread` are fractions of the same
 * extent, so all three read against each other.
 *
 * Note that RESEARCH's practical band of A ≈ 0.06–0.12·W measures W as the BORDER
 * STRIP's width, not the sheet's, so it does not transfer to this scale directly.
 * What actually decides whether the spine reads as an ornamental scroll rather
 * than a coiled spring is the ratio of wave height to wavelength: 2A/λ ≈ 0.5 is
 * the sweet spot, which at the default 5 scrolls across a 12″ sheet is amplitude
 * ≈ 0.045. Pushed past ~0.12 with a high waveCount the spine reads as a spring.
 *
 * `orientation: 'vertical'` swaps the axes INSIDE the pure geometry helper, never
 * via a `ctx.rotate` in the draw path — a rotate the SVG string does not carry is
 * the other way canvas/SVG parity dies.
 *
 * DETERMINISM: `generate()` reseeds both streams at the top so the motif capture
 * probe cannot perturb the painted output (the edge-host contract, hostKinds.js
 * header). The seed is consumed ONLY by `jitter`; at the default `jitter: 0` the
 * pattern is a pure function of its params. That mirrors girih's `irregularity`,
 * which is likewise absent from SEEDLESS_PATTERN_IDS.
 */

/** Samples emitted per half-wave module. Fixed: the spine is cheap. */
const SAMPLES_PER_HALF_WAVE = 24;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Pure sine centerline, sampled uniformly along the strip axis.
 * @returns {{u:number,n:number}[]} n ∈ [-1, 1]
 */
function sineSpine(u0, u1, halfWaves, phaseDeg) {
  const span = u1 - u0;
  const phi = (phaseDeg * Math.PI) / 180;
  const total = halfWaves * SAMPLES_PER_HALF_WAVE;
  const out = [];
  for (let i = 0; i <= total; i++) {
    const u = u0 + (span * i) / total;
    const n = Math.sin((Math.PI * halfWaves * (u - u0)) / span + phi);
    out.push({ u, n });
  }
  return out;
}

/**
 * Chain of cubic-Bézier half-wave S-modules, sampled uniformly in the Bézier
 * parameter t (NOT in u) so the near-vertical risers at high `tension` stay
 * smooth instead of faceting.
 *
 * The lattice is quarter-wave-shifted so that at `phase: 0` the spine starts at
 * n = 0 rising, exactly where `sineSpine` starts — switching waveform re-reads
 * the same border rather than jumping sideways. Modules are built past both ends
 * of [u0,u1] and the result trimmed back with interpolated endpoints, which is
 * safe precisely because u is monotone (see the class header's `tension` cap).
 * @returns {{u:number,n:number}[]} n ∈ [-1, 1]
 */
function scrollSpine(u0, u1, halfLen, phaseDeg, tension) {
  // One full wave = 2 half-modules, so 360° of phase = 2 lattice steps.
  const shift = (phaseDeg / 360) * 2;
  const halfWaves = Math.max(1, Math.round((u1 - u0) / halfLen));
  const kStart = Math.floor(shift - 0.5) - 1;
  const kEnd = Math.ceil(shift + halfWaves + 1.5) + 1;
  const nodeU = (k) => u0 - halfLen / 2 + (k - shift) * halfLen;
  const nodeN = (k) => (((k % 2) + 2) % 2 === 0 ? -1 : 1);

  const raw = [];
  for (let k = kStart; k < kEnd; k++) {
    const a = nodeU(k);
    const b = nodeU(k + 1);
    const na = nodeN(k);
    const nb = nodeN(k + 1);
    const h = b - a;
    const c = tension * h;
    const x1 = a + c;
    const x2 = b - c;
    const first = k === kStart ? 0 : 1; // skip t=0 — it duplicates the join
    for (let i = first; i <= SAMPLES_PER_HALF_WAVE; i++) {
      const t = i / SAMPLES_PER_HALF_WAVE;
      const mt = 1 - t;
      const w0 = mt * mt * mt;
      const w1 = 3 * mt * mt * t;
      const w2 = 3 * mt * t * t;
      const w3 = t * t * t;
      raw.push({
        u: w0 * a + w1 * x1 + w2 * x2 + w3 * b,
        // Handles are horizontal, so the cross coordinate is the plain cubic
        // ease between the two crest values.
        n: w0 * na + w1 * na + w2 * nb + w3 * nb,
      });
    }
  }
  return trimToSpan(raw, u0, u1);
}

/** Clip a u-monotone sample run to [u0,u1], adding exact interpolated ends. */
function trimToSpan(pts, u0, u1) {
  const at = (p, q, u) => {
    const w = q.u === p.u ? 0 : (u - p.u) / (q.u - p.u);
    return { u, n: p.n + (q.n - p.n) * w };
  };
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.u < u0) {
      const q = pts[i + 1];
      if (q && q.u > u0) out.push(at(p, q, u0));
      continue;
    }
    if (p.u > u1) {
      const prev = pts[i - 1];
      if (prev && prev.u < u1) out.push(at(prev, p, u1));
      break;
    }
    out.push(p);
  }
  return out;
}

/**
 * Seeded organic wobble: `halfWaves + 2` control values, smoothstep-interpolated
 * across the run and added to the cross coordinate. Low-frequency by design — a
 * per-sample random would read as noise, not as a hand-drawn stem. Displaces up
 * to `jitter · 0.5` of the amplitude.
 *
 * Draws from `rng` ONLY when jitter > 0, so the default document consumes no
 * randomness at all and stays byte-identical whatever the seed.
 */
function applyJitter(samples, jitter, controls, rng) {
  if (!(jitter > 0) || typeof rng !== 'function' || samples.length < 2) return;
  const k = Math.max(3, Math.round(controls));
  const ctrl = [];
  for (let i = 0; i < k; i++) ctrl.push(rng() * 2 - 1);
  const last = samples.length - 1;
  for (let i = 0; i <= last; i++) {
    const t = (i / last) * (k - 1);
    const a = Math.min(k - 2, Math.floor(t));
    const w = t - a;
    const s = w * w * (3 - 2 * w);
    samples[i].n += jitter * 0.5 * (ctrl[a] * (1 - s) + ctrl[a + 1] * s);
  }
}

/**
 * THE shared pure core. `generate()` replays these rows onto the canvas and
 * `contentFor()` serialises the SAME arrays, so canvas == SVG is structural
 * rather than something a test has to police.
 *
 * @param {object} params
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {() => number} [rng]  seeded [0,1) source; only read when jitter > 0
 * @returns {{ points: {x:number,y:number}[] }[]} one OPEN polyline per strip row,
 *          in ORIGIN-CENTRED canvas coordinates
 */
export function buildRinceauRows(params, canvasW, canvasH, rng) {
  const {
    waveform = 'scroll',
    orientation = 'horizontal',
    waveCount = 6,
    amplitude = 0.09,
    phase = 0,
    rows = 3,
    rowSpread = 0.6,
    rowPhase = 180,
    stripOffset = 0,
    tension = 0.75,
    jitter = 0,
    margin = 60,
  } = params || {};

  const horizontal = orientation !== 'vertical';
  const alongExtent = horizontal ? canvasW : canvasH;
  const crossExtent = horizontal ? canvasH : canvasW;

  const span = Math.max(20, alongExtent - 2 * Math.max(0, margin));
  const u0 = -span / 2;
  const u1 = span / 2;

  const waves = Math.max(1, Math.round(waveCount));
  const halfWaves = waves * 2;
  const halfLen = span / halfWaves;
  const amp = Math.max(0, amplitude) * crossExtent;
  const c = clamp(tension, 0.05, 1);
  const rowCount = Math.max(1, Math.round(rows));

  const out = [];
  for (let r = 0; r < rowCount; r++) {
    const lane = rowCount > 1 ? r / (rowCount - 1) - 0.5 : 0;
    const crossCentre = stripOffset * crossExtent + lane * rowSpread * crossExtent;
    const rowPhaseDeg = phase + r * rowPhase;

    const samples =
      waveform === 'sine'
        ? sineSpine(u0, u1, halfWaves, rowPhaseDeg)
        : scrollSpine(u0, u1, halfLen, rowPhaseDeg, c);

    applyJitter(samples, jitter, halfWaves + 2, rng);

    const points = [];
    for (const s of samples) {
      const v = crossCentre + amp * s.n;
      const p = horizontal ? { x: s.u, y: v } : { x: v, y: s.u };
      // Guard the arc-length contract: a zero-length segment gives edge-anchor
      // sampling a degenerate tangent/normal.
      const prev = points[points.length - 1];
      if (prev && Math.abs(prev.x - p.x) < 1e-9 && Math.abs(prev.y - p.y) < 1e-9) continue;
      points.push(p);
    }
    out.push({ points });
  }
  return out;
}

export default class Rinceau extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    // Reseed BOTH streams first — half the edge-host contract (hostKinds.js).
    ctx.randomSeed(seed);
    ctx.noiseSeed(seed);
    this.svgElements = [];

    const {
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const rows = buildRinceauRows(params, canvasW, canvasH, () => ctx.random());

    const fmt = (v) => (Math.round(v * 100) / 100).toString();
    for (const row of rows) {
      if (row.points.length < 2) continue;
      const pts = row.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
      this.svgElements.push(
        `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWeight}"/>`
      );
    }

    const drawBase = () => {
      const col = ctx.color(color);
      col.setAlpha(Math.round((opacity / 100) * 255));
      ctx.noFill();
      ctx.stroke(col);
      ctx.strokeWeight(strokeWeight);
      for (const row of rows) {
        if (row.points.length < 2) continue;
        ctx.beginShape();
        for (const p of row.points) ctx.vertex(p.x, p.y);
        ctx.endShape(); // NO CLOSE — one OPEN polyline per strip row.
      }
    };

    applySymmetryDraw(
      ctx, symmetry, canvasW / 2, canvasH / 2, drawBase,
      (startAngle * Math.PI) / 180, offsetX, offsetY
    );
  }

  // One <polyline> per row, joined plainly (mirrors DifferentialGrowth). We do
  // NOT override toSVGGroup — the inherited one reads _lastParams.symmetry, so
  // the real symmetry param flows through wrapSVGSymmetry for free.
  contentFor() {
    return this.svgElements.join('\n');
  }
}
