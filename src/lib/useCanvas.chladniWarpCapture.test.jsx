// Chladni warp-capture contract, end to end through the REAL useCanvas render
// (#148, PRD #143 slice 4).
//
// Chladni applies warp to its FINAL contour vertices (Chladni.js:186) and was not
// in the capture prepass's private WARP_CAPTURE_HOSTS set, so a warped Chladni
// PAINTED warped nodal lines and CAPTURED unwarped ones — the glyphs floated off
// the visible lines by up to the warp clamp (72px at amount 3).
//
// A default-params capture test passes anyway (defaults carry no modulation), so
// this file compares CAPTURED geometry against PAINTED geometry under an ACTIVE
// warp. "Painted geometry" is reconstructed the way the paint pass builds it —
// composeModulationParam(resolveModulationsForTarget(host, layers)) injected into
// a real Chladni run (useCanvas.js:460) — and folded through the same
// capturePolylines the prepass uses, whose equality with the live draw stream is
// pinned in hostCapture.test.js. Distances are point-to-SEGMENT, not
// point-to-nearest-vertex: a vertex metric needs ~10px of slop, which is enough
// to swallow the very displacement under test.
//
// It goes RED if `static warpsDrawnGeometry` is removed from Chladni — verified
// by deleting exactly that line.
//
// The last describe covers a warped single-axis GRID rather than Chladni. That
// is deliberate: the contract moved from a private list in useCanvas to a
// declaration on the pattern, and grid is the original member with the least
// end-to-end cover (useCanvas.warpCapture.test.jsx drives flowfield and
// topographic only). It also goes red when Grid's declaration is deleted.

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Headless p5 stub. Chladni's field is pure trig (no noise, no random), so the
// stub's RNG shape is irrelevant here — only that the calls exist.
vi.mock('p5', () => ({
  default: class {
    constructor(sketch) {
      this._r = 123456789;
      sketch?.(this);
      this.setup?.();
    }
    createCanvas() {} pixelDensity() {} noLoop() {} clear() {} background() {}
    resizeCanvas() {} remove() {}
    randomSeed(s) { this._r = (s >>> 0) || 1; }
    noiseSeed() {}
    random(a, b) {
      this._r = (this._r * 1664525 + 1013904223) >>> 0;
      const u = this._r / 4294967296;
      if (a === undefined) return u;
      if (b === undefined) return u * a;
      return a + u * (b - a);
    }
    noise() { return 0.5; }
    color() { return { setAlpha() {}, _rgb: [0, 0, 0] }; }
    red() { return 0; } green() { return 0; } blue() { return 0; }
    map(v, a, b, c, d) { return c + ((v - a) / (b - a)) * (d - c); }
    push() {} pop() {} translate() {} rotate() {} scale() {}
    fill() {} noFill() {} stroke() {} noStroke() {} strokeWeight() {} strokeCap() {}
    rect() {} rectMode() {} circle() {} line() {} triangle() {} ellipse() {}
    beginShape() {} vertex() {} bezierVertex() {} endShape() {}
    radians(d) { return d; }
    get width() { return 800; } get height() { return 600; }
    TWO_PI = Math.PI * 2; PI = Math.PI; HALF_PI = Math.PI / 2;
    CLOSE = 'close'; CENTER = 'center'; ROUND = 'round';
  },
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import useCanvas from './useCanvas.js';
import './registerBuiltinExtras.js'; // chladni self-registers into the dynamic registry
import { P5Adapter } from './patterns/drawingContext.js';
import { getPatternClass } from './patterns/index.js';
import { capturePolylines } from './motif/capturePolylines.js';
import {
  resolveModulationsForTarget,
  composeModulationParam,
} from './fields/resolveModulationForTarget.js';

const W = 800;
const H = 600;

// Coarse enough to keep the marching-squares pass cheap, fine enough that the
// contours are real curves rather than a handful of chords.
const CHLADNI_PARAMS = {
  m: 4, n: 3, blend: 0, m2: 5, n2: 2, resolution: 70,
  strokeWeight: 0.6, symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
};

const host = () => ({
  id: 'host', name: 'Chladni', type: 'pattern', patternType: 'chladni',
  visible: true, opacity: 100, bgOpacity: 0, color: '#000000', seed: 5,
  params: { ...CHLADNI_PARAMS },
});

// An EDGE motif — defaultRolesForHost('chladni') === ['edge'].
const motif = () => ({
  id: 'mo', name: 'Leaf', type: 'motif', patternType: 'motif',
  visible: true, opacity: 100, bgOpacity: 0, color: '#123456', seed: 7,
  params: {
    glyphRef: 'leaf', hostLayerId: 'host', anchorMode: 'semantic',
    edgeOpts: { spacing: 40 },
    binding: { selection: { roles: ['edge'] } },
  },
});

// A second chladni layer acting as the GUIDE (fieldRegistry: chladni + topographic
// are the field producers). Different mode numbers so its gradient is not aligned
// with the host's own contours.
const guide = (channel, amount = 3) => ({
  id: 'guide', name: 'Field', type: 'pattern', patternType: 'chladni',
  visible: true, opacity: 100, bgOpacity: 0, color: '#000000', seed: 1,
  params: { m: 3, n: 2 },
  modulator: { maps: [{ targetLayerId: 'host', channel, amount }] },
});

// --- painted-geometry reconstruction ----------------------------------------

function fakeP5() {
  const noop = () => () => {};
  return {
    TWO_PI: Math.PI * 2, PI: Math.PI, HALF_PI: Math.PI / 2,
    CLOSE: 'P5_CLOSE', CENTER: 'P5_CENTER', ROUND: 'P5_ROUND',
    randomSeed() {}, noiseSeed() {}, random: () => 0.5, noise: () => 0.5,
    color: () => ({ setAlpha() {} }),
    push: noop(), pop: noop(), translate: noop(), rotate: noop(), scale: noop(),
    stroke: noop(), noStroke: noop(), fill: noop(), noFill: noop(),
    strokeWeight: noop(), strokeCap: noop(), rectMode: noop(),
    line: noop(), ellipse: noop(), rect: noop(), triangle: noop(),
    beginShape: noop(), vertex: noop(), endShape: noop(),
  };
}

/**
 * The nodal lines the canvas actually PAINTS for the host in `layers`, in
 * absolute canvas coordinates. Same modulation resolution as the paint pass
 * (useCanvas.js:460), same polyline fold as the capture prepass.
 */
function paintedContours(layers) {
  const hostLayer = layers.find((l) => l.id === 'host');
  const modulation = composeModulationParam(
    resolveModulationsForTarget(hostLayer, layers)
  );
  const params = modulation
    ? { ...hostLayer.params, modulation }
    : hostLayer.params;
  const ctx = new P5Adapter(fakeP5(), { draw: false, record: true });
  new (getPatternClass('chladni'))().generate(
    ctx, hostLayer.seed, params, W, H, '#000000', 100
  );
  return capturePolylines(ctx.calls);
}

/** Squared distance from p to segment ab. */
function distSqToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return (p.x - qx) ** 2 + (p.y - qy) ** 2;
}

/** Distance from p to the NEAREST segment of any painted polyline. */
function distToPaint(p, paths) {
  let best = Infinity;
  for (const path of paths) {
    const pts = path.points;
    for (let i = 1; i < pts.length; i++) {
      const d2 = distSqToSegment(p, pts[i - 1], pts[i]);
      if (d2 < best) best = d2;
    }
  }
  return Math.sqrt(best);
}

// --- render harness ---------------------------------------------------------

function harness(layers) {
  return renderHook(
    ({ layers }) => {
      const ref = useRef(document.createElement('div'));
      return useCanvas(ref, layers, W, H, '#fff', {}, null, null, [], null, null, []);
    },
    { initialProps: { layers } }
  );
}

async function placements(layers) {
  const { result } = harness(layers);
  await waitFor(
    () => {
      expect(result.current.motifPlacements.mo?.length).toBeGreaterThan(0);
    },
    { timeout: 8000 }
  );
  return result.current.motifPlacements.mo.map((p) => ({ x: p.x, y: p.y }));
}

// Arc-length samples land exactly ON a captured segment; the only slack is
// float. Kept far below the warp separation asserted alongside it.
const ON_PAINT_EPS = 1e-6;

describe('a warped Chladni places its glyphs on the WARPED nodal lines', () => {
  it('every placement sits on the painted-warped contours, and off the unwarped ones', async () => {
    const warpedLayers = [guide('warp'), host(), motif()];
    const paintedWarped = paintedContours(warpedLayers);
    const paintedUnwarped = paintedContours([host(), motif()]);

    // Non-vacuous: both geometries exist, and the warp genuinely moved the lines.
    expect(paintedUnwarped.length).toBeGreaterThan(0);
    expect(paintedWarped.length).toBe(paintedUnwarped.length);
    const moved = Math.max(
      ...paintedWarped.flatMap((pth) =>
        pth.points.map((pt) => distToPaint(pt, paintedUnwarped))
      )
    );
    expect(moved, 'the warp guide barely moved the contours').toBeGreaterThan(20);

    const placed = await placements(warpedLayers);
    expect(placed.length).toBeGreaterThan(0);

    // THE criterion: captured geometry == painted geometry under an active warp.
    for (const p of placed) {
      expect(
        distToPaint(p, paintedWarped),
        `glyph at (${p.x}, ${p.y}) floated off the painted-warped nodal lines`
      ).toBeLessThan(ON_PAINT_EPS);
    }

    // …and they are demonstrably NOT on the unwarped lines. Without this the
    // assertion above could pass on geometry that never moved.
    const offUnwarped = Math.max(...placed.map((p) => distToPaint(p, paintedUnwarped)));
    expect(
      offUnwarped,
      'placements sit on the UNWARPED contours — the probe captured stale geometry'
    ).toBeGreaterThan(20);
  });

  // Warp is applied in the pattern's own ORIGIN-CENTRED frame (Chladni.js maps
  // each vertex to u,v before displacing) and only then folded through
  // applySymmetryDraw's rotate/translate. A probe that injected the modulation
  // but captured in the wrong frame — or a frame fold applied before the warp —
  // would put the glyphs on neither geometry. Defaults would never show it: the
  // identity frame makes local and painted coordinates the same.
  it('holds in a non-trivial painted frame (symmetry 3 + start angle + offsets)', async () => {
    const framed = () => {
      const h = host();
      h.params = { ...h.params, symmetry: 3, startAngle: 37, offsetX: 25, offsetY: -18 };
      return h;
    };
    const layers = [guide('warp'), framed(), motif()];
    const paintedWarped = paintedContours(layers);
    const paintedUnwarped = paintedContours([framed(), motif()]);
    expect(paintedWarped.length).toBeGreaterThan(0);

    const placed = await placements(layers);
    expect(placed.length).toBeGreaterThan(0);
    for (const p of placed) {
      expect(
        distToPaint(p, paintedWarped),
        `glyph at (${p.x}, ${p.y}) floated off the warped contours in a rotated+offset frame`
      ).toBeLessThan(ON_PAINT_EPS);
    }
    expect(
      Math.max(...placed.map((p) => distToPaint(p, paintedUnwarped))),
      'placements sit on the UNWARPED contours'
    ).toBeGreaterThan(20);
  });

  it('the warp guide moves the placements (they are not the unwarped set)', async () => {
    const base = await placements([host(), motif()]);
    const warped = await placements([guide('warp'), host(), motif()]);
    expect(warped).not.toEqual(base);
  });
});

// The contract moved from a private list to a declared capability, and the leg
// of that refactor with the LEAST existing end-to-end cover is grid: it enters
// the injection branch only when SINGLE-AXIS (isEdgeHost's params-aware case),
// and useCanvas.warpCapture.test.jsx drives flowfield + topographic only. Pinned
// here so a dropped `static warpsDrawnGeometry` on Grid cannot pass unnoticed.
// (Grid warped draws bezierVertex; both the reconstruction below and the capture
// prepass fold those through the same adaptive flattenCubic, #111.)
describe('the refactor keeps the original hosts working — warped single-axis GRID', () => {
  const gridHost = () => ({
    id: 'host', name: 'Grid', type: 'pattern', patternType: 'grid',
    visible: true, opacity: 100, bgOpacity: 0, color: '#000000', seed: 5,
    params: {
      cols: 8, rows: 8, spacing: 60, nonLinear: 0, nonLinearGain: 0, jitter: 0,
      drawHorizontal: 0, drawVertical: 1, // single-axis ⇒ routed through capture
      margin: 20, strokeWeight: 1, warpNodes: 6,
      symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
    },
  });

  function paintedGrid(layers) {
    const hostLayer = layers.find((l) => l.id === 'host');
    const modulation = composeModulationParam(
      resolveModulationsForTarget(hostLayer, layers)
    );
    const params = modulation
      ? { ...hostLayer.params, modulation }
      : hostLayer.params;
    const ctx = new P5Adapter(fakeP5(), { draw: false, record: true });
    new (getPatternClass('grid'))().generate(
      ctx, hostLayer.seed, params, W, H, '#000000', 100
    );
    return capturePolylines(ctx.calls);
  }

  it('a warp guide moves the grid placements onto the warped lines', async () => {
    const layers = [guide('warp'), gridHost(), motif()];
    const paintedWarped = paintedGrid(layers);
    const paintedUnwarped = paintedGrid([gridHost(), motif()]);
    expect(paintedUnwarped.length).toBeGreaterThan(0);

    const base = await placements([gridHost(), motif()]);
    const warped = await placements(layers);
    expect(warped).not.toEqual(base);

    for (const p of warped) {
      expect(
        distToPaint(p, paintedWarped),
        `grid glyph at (${p.x}, ${p.y}) floated off the painted-warped lines`
      ).toBeLessThan(ON_PAINT_EPS);
    }
    expect(
      Math.max(...warped.map((p) => distToPaint(p, paintedUnwarped))),
      'grid placements sit on the UNWARPED lines'
    ).toBeGreaterThan(20);
  });
});

describe('the UNWARPED case is unchanged', () => {
  it('with no guide, every placement sits on the unmodulated painted contours', async () => {
    const layers = [host(), motif()];
    const painted = paintedContours(layers);
    const placed = await placements(layers);
    expect(placed.length).toBeGreaterThan(0);
    for (const p of placed) {
      expect(distToPaint(p, painted)).toBeLessThan(ON_PAINT_EPS);
    }
  });

  it('a NON-warp guide is a geometric no-op: placements byte-identical to no guide', async () => {
    // The contract injects the WHOLE composed modulation into the probe. Chladni
    // branches only on channel === 'warp' (Chladni.js:185), so a density-channel
    // guide must leave the captured anchors byte-identical to the baseline —
    // the same byte-identity the original three hosts rely on.
    const base = await placements([host(), motif()]);
    const withDensity = await placements([guide('density'), host(), motif()]);
    expect(withDensity).toEqual(base);
  });
});
