import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

/**
 * MagneticScroll — a field of counter-rotating volutes traced by charged
 * particles in a decaying magnetic field (Xu & Mould 2009, "Magnetic Curves:
 * Curvature-Controlled Aesthetic Curves Using Magnetic Fields").
 *
 * THE PHYSICS, AND WHY IT MAKES AN ISLIMI SCROLL
 * ----------------------------------------------
 * A charged particle moving through a uniform perpendicular magnetic field
 * feels a force at right angles to its velocity, so it traces a CIRCLE whose
 * radius is set by the charge. Let the charge grow over the particle's lifetime
 * and the radius shrinks as it flies: the circle becomes a spiral that winds
 * INTO a tightening eye. That is a volute — the tapering scroll that Persianate
 * *islimi* is built from (docs/vine-scaffolds-RESEARCH.md §3), and the
 * research-supplement's #2 recommendation (§1a) for generating Family C
 * mechanically instead of hand-authoring Bézier scroll modules.
 *
 * The paper writes the charge decay in ARC LENGTH as q(t) = (T − t)^(−α). We
 * integrate in TURNING ANGLE instead, which is the same curve reparameterised
 * and is far better behaved numerically. Substituting u = φ(t)/Φ (the fraction
 * of total turning consumed) into
 *
 *     Φ(t) = ∫₀ᵗ κ₀ (1 − τ/T)^(−α) dτ = (κ₀T / (1−α)) · [1 − (1 − t/T)^(1−α)]
 *
 * gives the exact closed form this file integrates:
 *
 *     κ(u) = κ₀ · (1 − u)^(−β),      β = α / (1 − α)
 *
 * Three things fall out of working in u rather than t:
 *   • EVERY step turns the heading by exactly Φ/steps, so forward Euler never
 *     goes coarse where the curvature blows up — the classic failure of the
 *     arc-length form, which needs α < 1 to converge at all and still jitters
 *     near t = T.
 *   • The step LENGTH ds = (Φ/steps)/κ(u) → 0 as u → 1, so the trace converges
 *     onto a point: the eye of the volute. Coordinates are bounded by
 *     construction, no clamping or kill-radius needed.
 *   • α ∈ [0,1) maps to β ∈ [0,∞) with no singularity in range; α = 0 (β = 0)
 *     degenerates gracefully to the pure magnetic circle.
 *
 * THE TIP IS THE EYE — and that is the whole point. Each trace is ONE OPEN
 * polyline emitted root (seed) → tip (volute centre), so a vine motif's Apex
 * lands in the eye of the scroll, where a palmette sits in the historical
 * ornament. N scrolls ⇒ N termini.
 *
 * That claim is CONDITIONAL ON α, which is why the `taper` slider's declared
 * range starts at 0.5 rather than at 0. Convergence onto the eye is driven by
 * β = α/(1−α): at α = 0.1, β ≈ 0.11 and the curvature only doubles over the
 * whole trace, so the coil is a nest of near-circles whose last point sits on an
 * OUTER loop — a glyph anchored there would miss the centre entirely. 0.5 is
 * where the eye closes across the whole declared `turns` range (measured, and
 * asserted over the range corners in MagneticScroll.test.js). The helper below
 * still accepts the full α ∈ [0,1) — a direct caller may want the degenerate
 * circle — but the UI does not offer it.
 *
 * COUNTER-ROTATION. The curvature SIGN is what picks clockwise vs counter-
 * clockwise. Alternating it across neighbouring seeds is the mechanical
 * explanation for islimi's paired opposing scrolls — Encyclopaedia Iranica's
 * "alternately reversed contiguous pairs" (carpets-iv) falls out of a sign flip
 * rather than an authored alternation script. `branch: 'paired'` additionally
 * throws a smaller secondary volute of OPPOSITE sign off each primary's stem,
 * for the classic paired-volute unit.
 *
 * Canvas == SVG: buildScrollTraces() is a pure function of (params, canvas,
 * rand); generate() calls it ONCE and builds both the <path> strings and the
 * beginShape/vertex replay from that same array.
 */

// Angular resolution of the Euler integration, in radians of turning per step.
// 0.075 rad ≈ 4.3° — a 3-turn volute is ~250 vertices, smooth on a plotter and
// cheap enough for a picker thumbnail. NOT a param: it is fidelity, not design.
const STEP_ANGLE = 0.075;
const MIN_STEPS = 24;
const MAX_STEPS = 1200;

// Global vertex budget across every trace. A safety cap only — the declared
// param ranges cannot reach it (48 scrolls × 2 × 1200 = 115k worst case, and
// that needs max turns AND max count AND paired branching together).
const MAX_TOTAL_POINTS = 60000;

/** Golden angle, for the phyllotactic scatter layout. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Integrate ONE magnetic volute, root → tip.
 *
 * @param {object} o
 * @param {number} o.x0        seed x (origin-centred)
 * @param {number} o.y0        seed y
 * @param {number} o.heading0  launch direction, radians
 * @param {number} o.sign      +1 / −1 — curvature sign, i.e. which way it coils
 * @param {number} o.radius    initial radius of curvature (1/κ₀) — the volute's
 *                             outer scale; the first loop is ~2·radius across
 * @param {number} o.turns     total turning, in whole turns (Φ = 2π·turns)
 * @param {number} o.alpha     charge-decay exponent α ∈ [0,1); 0 = plain circle
 * @returns {{x:number,y:number}[]} an OPEN polyline; last point is the eye
 */
export function traceVolute({ x0, y0, heading0, sign, radius, turns, alpha }) {
  const PHI = Math.max(1e-3, turns) * Math.PI * 2;
  // β = α/(1−α). α is clamped below 1 so β stays finite; α = 0 ⇒ β = 0 ⇒ the
  // curvature never changes and the trace is a circle (the undecayed field).
  const a = Math.min(0.95, Math.max(0, alpha));
  const beta = a / (1 - a);
  const k0 = 1 / Math.max(1e-3, radius);

  const steps = Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.ceil(PHI / STEP_ANGLE)));
  const dphi = PHI / steps;

  const pts = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  let h = heading0;

  for (let i = 0; i < steps; i++) {
    // MIDPOINT sample of u: (i+0.5)/steps < 1 always, so (1−u) never hits 0 and
    // κ is finite for every β. Evaluating at the step midpoint also makes the
    // α = 0 case an exact circle rather than an inscribed polygon.
    const u = (i + 0.5) / steps;
    const kappa = k0 * Math.pow(1 - u, -beta);
    const ds = dphi / kappa;
    const hm = h + sign * dphi * 0.5; // midpoint heading
    x += Math.cos(hm) * ds;
    y += Math.sin(hm) * ds;
    h += sign * dphi;
    pts.push({ x, y });
  }

  return pts;
}

/**
 * Seed positions + launch headings for one of the three layouts, in
 * origin-centred coordinates. Split out so the layout rule is readable on its
 * own and the sign alternation is visible in one place.
 *
 * `flip` is the counter-rotation index: neighbouring seeds differ by 1, so
 * (−1)^flip alternates the curvature sign. Grid alternates on a CHECKERBOARD
 * ((row+col) parity), which is what makes a grid of scrolls read as interlocked
 * pairs rather than as a field of identical commas.
 */
function seedPoints(layout, count, canvasW, canvasH, radius) {
  const seeds = [];
  // A volute grows to ONE SIDE of its seed, spanning roughly 2·radius. Lay the
  // seeds out over an INSET region so the assembled field lands inside the
  // canvas instead of sliding off the far edge. The floor keeps a huge
  // scrollRadius on a small canvas from collapsing every seed onto one point
  // (which would make the boundary sweep's anchors degenerate).
  const inset = radius * 2.2;
  const areaW = Math.max(canvasW * 0.2, canvasW * 0.94 - inset);
  const areaH = Math.max(canvasH * 0.2, canvasH * 0.94 - inset);
  const halfW = areaW / 2;
  const halfH = areaH / 2;

  if (layout === 'grid') {
    const cols = Math.max(1, Math.round(Math.sqrt((count * areaW) / Math.max(1, areaH))));
    const rows = Math.max(1, Math.ceil(count / cols));
    const cw = areaW / cols;
    const ch = areaH / rows;
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      seeds.push({
        x: -halfW + (col + 0.5) * cw,
        y: -halfH + (row + 0.5) * ch,
        heading: 0,
        flip: col + row,
      });
    }
    return seeds;
  }

  if (layout === 'scatter') {
    // Phyllotactic: r ∝ √i keeps the areal density uniform, the golden angle
    // keeps neighbours from lining up into visible spokes.
    const rMax = Math.max(radius * 0.5, Math.min(halfW, halfH));
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const r = rMax * Math.sqrt(t);
      const th = i * GOLDEN_ANGLE;
      seeds.push({
        x: Math.cos(th) * r,
        y: Math.sin(th) * r,
        // Launch TANGENTIALLY so the scatter reads as a rotating field rather
        // than as spokes radiating from the centre.
        heading: th + Math.PI / 2,
        flip: i,
      });
    }
    return seeds;
  }

  // 'row' (default) — a baseline strip. Every scroll launches along +x and the
  // sign alternates, so consecutive scrolls are MIRROR IMAGES about the
  // baseline: Iranica's "alternately reversed contiguous pairs", exactly.
  const span = areaW;
  const gap = span / count;
  for (let i = 0; i < count; i++) {
    seeds.push({
      x: -span / 2 + (i + 0.5) * gap,
      y: 0,
      heading: 0,
      flip: i,
    });
  }
  return seeds;
}

/**
 * THE SHARED PURE HELPER. Both the canvas replay and the SVG serialisation in
 * generate() are built from this one array, so canvas == SVG by construction.
 *
 * @param {object} params  pattern params (see PATTERN_PARAM_DEFS.magnetscroll)
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {() => number} rand  uniform [0,1) source — ctx.random in production,
 *                             so determinism follows from the seeded stream
 * @returns {{x:number,y:number}[][]} open polylines, each root → tip
 */
export function buildScrollTraces(params, canvasW, canvasH, rand) {
  const {
    layout = 'row',
    scrollCount = 9,
    scrollRadius = 74,
    turns = 2.75,
    taper = 0.55,
    rotation = 'alternate',
    branch = 'paired',
    branchScale = 0.45,
    jitter = 0.25,
  } = params || {};

  const count = Math.max(1, Math.round(scrollCount));
  const jit = Math.max(0, Math.min(1, jitter));
  const seeds = seedPoints(layout, count, canvasW, canvasH, scrollRadius);

  const traces = [];
  let budget = MAX_TOTAL_POINTS;

  for (const s of seeds) {
    // Counter-rotation: the sign flip IS the ornament. 'uniform' keeps every
    // scroll coiling the same way (a directional, wave-like field instead).
    const sign = rotation === 'alternate' && s.flip % 2 === 1 ? -1 : 1;

    // Seeded jitter — position, launch angle and scale. All three scale with
    // the one `jitter` slider so it stays a single "hand-drawn-ness" control.
    const jx = (rand() * 2 - 1) * jit * scrollRadius * 0.35;
    const jy = (rand() * 2 - 1) * jit * scrollRadius * 0.35;
    const jh = (rand() * 2 - 1) * jit * 0.55;
    const jr = 1 + (rand() * 2 - 1) * jit * 0.3;

    const radius = Math.max(2, scrollRadius * jr);
    const heading0 = s.heading + jh;

    const primary = traceVolute({
      x0: s.x + jx,
      y0: s.y + jy,
      heading0,
      sign,
      radius,
      turns,
      alpha: taper,
    });
    if (budget - primary.length < 0) break;
    budget -= primary.length;
    traces.push(primary);

    if (branch !== 'paired') continue;

    // ONE level of branching. The secondary springs off the primary's STEM —
    // 20% of the way through the turning, before the first full loop closes —
    // with the OPPOSITE sign, so the pair reads as two volutes facing away from
    // a shared stalk. That is the islimi unit.
    const at = Math.max(1, Math.round(primary.length * 0.2));
    const p0 = primary[at - 1];
    const p1 = primary[at];
    const tangent = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const bScale = Math.max(0.1, Math.min(0.95, branchScale));

    const secondary = traceVolute({
      x0: p1.x,
      y0: p1.y,
      // Kick away from the parent's curl (opposite sign ⇒ subtract sign·angle)
      // so the two eyes separate instead of nesting.
      heading0: tangent - sign * 0.75,
      sign: -sign,
      radius: radius * bScale,
      turns,
      alpha: taper,
    });
    if (budget - secondary.length < 0) break;
    budget -= secondary.length;
    traces.push(secondary);
  }

  return recentre(traces);
}

/**
 * Translate the whole field so its bounding box is centred on the origin.
 *
 * Not cosmetics: a volute grows to ONE SIDE of its seed (it launches along the
 * heading and coils away), so a row of seeds spanning the canvas paints a field
 * shifted a full scroll-width off centre, and the last scroll runs off the edge.
 * Seeding is about RELATIVE spacing; where the assembled field sits is this
 * step's job. Applied to the single trace array BEFORE either consumer reads it,
 * so canvas and SVG shift identically.
 */
function recentre(traces) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const tr of traces) {
    for (const p of tr) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return traces; // no traces at all
  const dx = (minX + maxX) / 2;
  const dy = (minY + maxY) / 2;
  for (const tr of traces) {
    for (const p of tr) {
      p.x -= dx;
      p.y -= dy;
    }
  }
  return traces;
}

export default class MagneticScroll extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    // EDGE-HOST CONTRACT (motif/hostKinds.js header): reseed BOTH streams at the
    // top of generate() so the motif capture probe cannot shift what gets
    // painted. This pattern only draws from ctx.random, but noiseSeed is reset
    // too, matching every other edge host.
    ctx.randomSeed(seed);
    ctx.noiseSeed(seed);
    this.svgElements = [];

    const {
      strokeWeight = 0.9,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // ONE call. Canvas and SVG both read this array — never a second build.
    const traces = buildScrollTraces(params, canvasW, canvasH, () => ctx.random());

    const fmt = (v) => (Math.round(v * 100) / 100).toString();
    for (const trace of traces) {
      let d = `M${fmt(trace[0].x)},${fmt(trace[0].y)}`;
      for (let i = 1; i < trace.length; i++) d += ` L${fmt(trace[i].x)},${fmt(trace[i].y)}`;
      this.svgElements.push(
        `<path d="${d}" stroke="${color}" fill="none" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
      );
    }

    const drawBase = () => {
      const c = ctx.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      ctx.noFill();
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      ctx.strokeCap(ctx.ROUND);
      for (const trace of traces) {
        // OPEN polyline — endShape() with NO CLOSE. A closed volute would have
        // no tip, and the tip is where the Apex flower goes.
        ctx.beginShape();
        for (const pt of trace) ctx.vertex(pt.x, pt.y);
        ctx.endShape();
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, (startAngle * Math.PI) / 180, offsetX, offsetY);
  }

  // One <path> per trace. toSVGGroup is INHERITED so the real `symmetry` param
  // flows through wrapSVGSymmetry — do not override it.
  contentFor() {
    return this.svgElements.join('\n');
  }
}
