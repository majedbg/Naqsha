import { wrapSVGSymmetry } from './symmetryUtils';
import { mulberry32 } from './rng';

/**
 * ============================================================================
 * DrawingContext — the FROZEN seam between pattern logic and its render target.
 * ============================================================================
 *
 * A pattern's `generate(ctx, ...)` calls methods on a `ctx` object instead of a
 * raw p5 instance. Two adapters implement this same interface:
 *
 *   - P5Adapter       → wraps a live p5 instance (PRODUCTION render + SVG export)
 *   - RecordingContext → pure JS, no p5/DOM (HEADLESS tests)
 *
 * Both adapters guarantee EXACTLY the members below. This is the contract that
 * AR-2A-ii pattern migrations may rely on. Do not call p5 members outside this
 * list from a migrated pattern — add them here (to BOTH adapters) first.
 *
 * ---------------------------------------------------------------------------
 * CONSTANTS (numeric / string, read as `ctx.NAME`)
 *   TWO_PI, PI, HALF_PI   — angle constants
 *   CLOSE                 — shape-close flag, passed to endShape()
 *   CENTER                — rectMode flag
 *   ROUND                 — strokeCap flag
 *
 * RANDOMNESS / NOISE  (deterministic; P5Adapter delegates to live p5)
 *   randomSeed(seed)
 *   noiseSeed(seed)
 *   random(...args)       — p5 semantics: random(), random(max), random(min,max)
 *   noise(...args)        — p5 Perlin noise (1–3 args)
 *
 * COLOR  (P5Adapter delegates to live p5; RecordingContext returns stubs/parses)
 *   color(spec)           → returns a color object exposing `.setAlpha(a)`
 *   red(c) / green(c) / blue(c)  → channel 0..255
 *   map(v, a, b, c, d)    — linear remap (pure math)
 *
 * TRANSFORM STACK  (canvas side effects; no-op under no-draw + RecordingContext)
 *   push() / pop()
 *   translate(x, y)
 *   rotate(theta)
 *   scale(s)              — (covered for completeness; reserved for unmigrated)
 *
 * STYLE  (canvas side effects; no-op under no-draw + RecordingContext)
 *   stroke(c) / noStroke()
 *   fill(c) / noFill()
 *   strokeWeight(w)
 *   strokeCap(mode)
 *   rectMode(mode)
 *
 * DRAW  (canvas side effects; no-op under no-draw; RECORDED by RecordingContext)
 *   line(x1, y1, x2, y2)
 *   ellipse(x, y, w, h)
 *   rect(x, y, w, h)
 *   triangle(x1, y1, x2, y2, x3, y3)
 *   beginShape() / vertex(x, y) / endShape(mode?)
 * ---------------------------------------------------------------------------
 *
 * THE NON-NEGOTIABLE INVARIANT (production byte-identity with `main`):
 *   P5Adapter forwards random/noise/color/red/green/blue/map to the LIVE p5
 *   instance, and forwards constants from the live instance (e.g. CLOSE = p.CLOSE),
 *   so migrated AND unmigrated patterns render byte-identically. The "no-draw"
 *   variant (hidden layers) still delegates RNG/color to live p5 but NO-OPs all
 *   transform/style/draw calls — it never touches the live p5 matrix or style
 *   stack. This replaces (and fixes) the old leaky `createOffscreenProxy`.
 * ============================================================================
 */

/**
 * P5Adapter — production DrawingContext backed by a live p5 instance.
 *
 * @param {object} p - the live p5 instance
 * @param {{ draw?: boolean, record?: boolean }} [opts] - draw:false makes
 *   transform/style/draw calls no-ops (hidden-layer generation), while RNG/color
 *   still delegate to p5. record:true ALSO appends every TRANSFORM and polyline
 *   DRAW op to `this.calls` (as { op, args }) — the B2 arbitrary-edge host-capture
 *   seam. Record is orthogonal to draw: `{draw:false, record:true}` paints
 *   nothing yet records the exact call stream (RNG still delegates to live p5, so
 *   the recorded geometry is byte-identical to a real draw of the same host).
 *   capturePolylines.js folds `this.calls` into absolute-coordinate hostPaths.
 */
export class P5Adapter {
  constructor(p, opts = {}) {
    this._p = p;
    this._draw = opts.draw !== false; // default true
    this._record = !!opts.record;     // default false
    // Recorded TRANSFORM + polyline-DRAW ops (record mode only). Consumed by
    // capturePolylines.js; empty/unused when record is off.
    this.calls = [];

    // Constants sourced from the LIVE p5 instance — never hardcoded, so the
    // exact values p5's own methods expect are forwarded back to them.
    this.TWO_PI = p.TWO_PI;
    this.PI = p.PI;
    this.HALF_PI = p.HALF_PI;
    this.CLOSE = p.CLOSE;
    this.CENTER = p.CENTER;
    this.ROUND = p.ROUND;
  }

  _rec(op, a) { if (this._record) this.calls.push({ op, args: a }); }

  // --- randomness / noise: ALWAYS delegate to live p5 (byte-identity) ---
  randomSeed(s) { return this._p.randomSeed(s); }
  noiseSeed(s) { return this._p.noiseSeed(s); }
  random(...a) { return this._p.random(...a); }
  noise(...a) { return this._p.noise(...a); }

  // --- color: ALWAYS delegate to live p5 (constructs a p5.Color, no global side effect) ---
  color(...a) { return this._p.color(...a); }
  red(c) { return this._p.red(c); }
  green(c) { return this._p.green(c); }
  blue(c) { return this._p.blue(c); }
  map(...a) { return this._p.map(...a); }

  // --- transform stack: canvas-only side effects (no-op in no-draw). RECORDED
  //     in record mode EVEN under no-draw — capturePolylines needs the CTM ops to
  //     fold local-frame geometry (e.g. applySymmetryDraw's translate/rotate) into
  //     absolute canvas coordinates. ---
  push() { this._rec('push', []); if (this._draw) this._p.push(); }
  pop() { this._rec('pop', []); if (this._draw) this._p.pop(); }
  translate(...a) { this._rec('translate', a); if (this._draw) this._p.translate(...a); }
  rotate(...a) { this._rec('rotate', a); if (this._draw) this._p.rotate(...a); }
  scale(...a) { this._rec('scale', a); if (this._draw) this._p.scale(...a); }

  // --- style: canvas-only side effects (no-op in no-draw; not recorded) ---
  stroke(...a) { if (this._draw) this._p.stroke(...a); }
  noStroke() { if (this._draw) this._p.noStroke(); }
  fill(...a) { if (this._draw) this._p.fill(...a); }
  noFill() { if (this._draw) this._p.noFill(); }
  strokeWeight(...a) { if (this._draw) this._p.strokeWeight(...a); }
  strokeCap(...a) { if (this._draw) this._p.strokeCap(...a); }
  rectMode(...a) { if (this._draw) this._p.rectMode(...a); }

  // --- draw: canvas-only side effects (no-op in no-draw). Polyline ops (line +
  //     beginShape/vertex/endShape) are RECORDED in record mode; ellipse/rect/
  //     triangle are not polylines and are intentionally NOT recorded. ---
  line(...a) { this._rec('line', a); if (this._draw) this._p.line(...a); }
  ellipse(...a) { if (this._draw) this._p.ellipse(...a); }
  rect(...a) { if (this._draw) this._p.rect(...a); }
  triangle(...a) { if (this._draw) this._p.triangle(...a); }
  beginShape(...a) { this._rec('beginShape', a); if (this._draw) this._p.beginShape(...a); }
  vertex(...a) { this._rec('vertex', a); if (this._draw) this._p.vertex(...a); }
  bezierVertex(...a) { if (this._draw) this._p.bezierVertex(...a); }
  endShape(...a) { this._rec('endShape', a); if (this._draw) this._p.endShape(...a); }
}

/** Parse a #rrggbb / #rgb hex string into {r,g,b} (0..255). Test-only helper. */
function parseHex(spec) {
  if (typeof spec !== 'string') return { r: 0, g: 0, b: 0 };
  let h = spec.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * RecordingContext — pure-JS DrawingContext for HEADLESS tests.
 *
 * - random()/noise() come from a deterministic mulberry32 RNG (NOT p5's RNG;
 *   it does not need to match p5's sequence — its job is reproducible logic).
 * - draw calls are recorded into `this.calls` as { op, args }.
 * - transform/style ops are also recorded (so a test may assert the sequence)
 *   but otherwise do nothing.
 *
 * @param {{ seed?: number }} [opts]
 */
export class RecordingContext {
  constructor(opts = {}) {
    this.calls = [];
    this._seed = opts.seed ?? 1;
    this._rand = mulberry32(this._seed);
    this._noise = mulberry32((this._seed ^ 0x9e3779b9) >>> 0);

    this.TWO_PI = Math.PI * 2;
    this.PI = Math.PI;
    this.HALF_PI = Math.PI / 2;
    this.CLOSE = 'close';
    this.CENTER = 'center';
    this.ROUND = 'round';
  }

  _record(op, args) { this.calls.push({ op, args }); }

  // --- randomness / noise: deterministic mulberry32 ---
  randomSeed(s) { this._rand = mulberry32(s | 0); }
  noiseSeed(s) { this._noise = mulberry32((s | 0) ^ 0x9e3779b9); }
  random(a, b) {
    const u = this._rand();
    if (a === undefined) return u;          // random()
    if (b === undefined) return u * a;       // random(max)
    return a + u * (b - a);                  // random(min, max)
  }
  noise() { return this._noise(); }

  // --- color: minimal deterministic stubs ---
  color(spec) {
    const { r, g, b } = parseHex(spec);
    return { _rgb: [r, g, b], setAlpha() {} };
  }
  red(c) { return c && c._rgb ? c._rgb[0] : 0; }
  green(c) { return c && c._rgb ? c._rgb[1] : 0; }
  blue(c) { return c && c._rgb ? c._rgb[2] : 0; }
  map(v, a, b, c, d) { return c + ((v - a) / (b - a)) * (d - c); }

  // --- transform stack (recorded, no real effect) ---
  push() { this._record('push', []); }
  pop() { this._record('pop', []); }
  translate(...a) { this._record('translate', a); }
  rotate(...a) { this._record('rotate', a); }
  scale(...a) { this._record('scale', a); }

  // --- style (recorded) ---
  stroke(...a) { this._record('stroke', a); }
  noStroke() { this._record('noStroke', []); }
  fill(...a) { this._record('fill', a); }
  noFill() { this._record('noFill', []); }
  strokeWeight(...a) { this._record('strokeWeight', a); }
  strokeCap(...a) { this._record('strokeCap', a); }
  rectMode(...a) { this._record('rectMode', a); }

  // --- draw (recorded) ---
  line(...a) { this._record('line', a); }
  ellipse(...a) { this._record('ellipse', a); }
  rect(...a) { this._record('rect', a); }
  triangle(...a) { this._record('triangle', a); }
  beginShape(...a) { this._record('beginShape', a); }
  vertex(...a) { this._record('vertex', a); }
  bezierVertex(...a) { this._record('bezierVertex', a); }
  endShape(...a) { this._record('endShape', a); }
}

/**
 * ============================================================================
 * Base `Pattern` class — implements the boilerplate ONCE.
 * ============================================================================
 *
 * A subclass MUST:
 *   - override `generate(ctx, seed, params, w, h, color, opacity)` — populate
 *     `this.svgElements` and issue draw calls via `ctx`.
 *
 * A subclass MAY:
 *   - override `contentFor(color)` — produce the inner SVG string for the group
 *     from `this.svgElements`. Default joins each element with 4-space indent,
 *     which matches the pre-refactor Grid/Duality behaviour. Patterns whose
 *     `svgElements` are objects (e.g. FlowField's { pathD, strokeWeight })
 *     MUST override this to serialize them.
 *
 * Inherited (do NOT re-declare in subclasses):
 *   - constructor()                  → this.svgElements = []
 *   - generateWithContext(ctx, ...)  → stores _lastParams/_lastCx/_lastCy, calls generate
 *   - toSVGGroup(layerId, color, opacity) → wraps contentFor() via wrapSVGSymmetry
 *
 * The toSVGGroup symmetry wrapping is byte-identical to the original
 * per-pattern implementations: it reads symmetry/startAngle/offsetX/offsetY
 * from `this._lastParams` (falling back to 1/0/0/0). `toSymmetryCount` maps the
 * `|| 1` fallback and any real value identically, so this is safe for patterns
 * that previously fell back to `'none'` (e.g. FlowField).
 * ============================================================================
 */
export class Pattern {
  constructor() {
    this.svgElements = [];
  }

  /**
   * Subclasses MUST override. Populate this.svgElements and draw via ctx.
   * @abstract
   */
  generate() {
    throw new Error('Pattern subclass must implement generate(ctx, seed, params, w, h, color, opacity)');
  }

  /**
   * Default SVG content builder. Override for non-string svgElements.
   * Overrides receive the layer `color` as their first argument (the default
   * impl does not need it). e.g. `contentFor(color) { ... }`.
   * @returns {string}
   */
  contentFor() {
    return this.svgElements.map((el) => `    ${el}`).join('\n');
  }

  /**
   * Stores symmetry context for toSVGGroup, then runs generate.
   */
  generateWithContext(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this._lastParams = params;
    this._lastCx = canvasW / 2;
    this._lastCy = canvasH / 2;
    this.generate(ctx, seed, params, canvasW, canvasH, color, opacity);
  }

  /**
   * Wraps contentFor() in radial-symmetry groups. Byte-identical wrapping to
   * the original per-pattern toSVGGroup implementations.
   */
  toSVGGroup(layerId, color, opacity) {
    const content = this.contentFor(color);
    return wrapSVGSymmetry(
      layerId, color, opacity, content,
      this._lastParams?.symmetry || 1, this._lastCx, this._lastCy,
      this._lastParams?.startAngle || 0,
      this._lastParams?.offsetX || 0,
      this._lastParams?.offsetY || 0
    );
  }
}
