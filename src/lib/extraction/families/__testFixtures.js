// Shared adversarial fixtures for the S12 honesty battery (issue #61). Every
// motif is a tile-shaped { width, height, fills, strokes } in a 100×100 cell so
// it rasterizes into the same frame the EVAL gate uses. The star fixtures are
// the legitimate high-score proofs; the floral/random/calligraphic/non-periodic
// fixtures are the fall-through proofs — a star family offered confidently on
// any of them is the feature's worst failure mode, so these MUST score < 7.

import { generate } from './kaplanStar';

const CELL = { width: 100, height: 100 };

/** A constructed star tile (the honesty proof — centered → clean symmetry). */
export function starFixture(n = 8, contactAngle = 45, scale = 0.9) {
  return generate({ n, contactAngle, scale }, { lattice: { cell: CELL } });
}

/** Floral motif: n rounded petals + a center disc. NOT a star. */
export function floralFixture(n = 8) {
  const cx = 50;
  const cy = 50;
  const fills = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    const px = cx + 28 * Math.cos(a);
    const py = cy + 28 * Math.sin(a);
    const pts = [];
    for (let j = 0; j < 8; j++) {
      const b = (2 * Math.PI * j) / 8;
      pts.push([px + 12 * Math.cos(b), py + 8 * Math.sin(b)]);
    }
    fills.push({ d: `M${pts.map((p) => p.join(' ')).join(' L ')} Z`, role: 'engrave' });
  }
  const cpts = [];
  for (let j = 0; j < 12; j++) {
    const b = (2 * Math.PI * j) / 12;
    cpts.push([cx + 10 * Math.cos(b), cy + 10 * Math.sin(b)]);
  }
  fills.push({ d: `M${cpts.map((p) => p.join(' ')).join(' L ')} Z`, role: 'engrave' });
  return { width: 100, height: 100, fills, strokes: [] };
}

/** Random line segments (deterministic LCG). NOT a star. */
export function randomFixture(seed = 7) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const strokes = [];
  for (let i = 0; i < 14; i++) {
    const x1 = rnd() * 100;
    const y1 = rnd() * 100;
    const x2 = rnd() * 100;
    const y2 = rnd() * 100;
    strokes.push({ d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`, role: 'score' });
  }
  return { width: 100, height: 100, fills: [], strokes };
}

/**
 * Honeycomb: a single FILLED regular hexagon centered in the cell — the motif a
 * hex/p6m dot-grid or honeycomb repeats. This is the SHARPEST honesty test in
 * the battery (S12 task 3a): unlike the scattered floral/random/calligraphic
 * negatives — which fall through cheaply because they never earn full sym+lattice
 * — a hexagon on its NATURAL hex lattice earns the MAXIMUM structural sub-scores
 * (symmetry 3 + lattice 3 = 6, the p6m/hex the star family itself lives on). It
 * is a genuine periodic geometric tile, NOT a star, and it must still fall
 * through — proving the ONLY thing keeping it under the offer threshold is IoU
 * (a filled hexagon does not overlap a star's linework). A convex hexagon is the
 * adversarial worst case because a shallow high-fold star is nearly a hexagon;
 * see fitEvaluator.js header for the measured margin. Default r=45 fills most of
 * the cell (a tight honeycomb). NOT a star.
 */
export function hexagonFixture(radius = 45) {
  const cx = 50;
  const cy = 50;
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = (2 * Math.PI * k) / 6 + Math.PI / 6; // flat-top hexagon
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  const d = `M${pts.map((p) => p.map((v) => Math.round(v * 100) / 100).join(' ')).join(' L ')} Z`;
  return { width: 100, height: 100, fills: [{ d, role: 'engrave' }], strokes: [] };
}

/** Calligraphic sweeping cubic curves. NOT a star. */
export function calligraphicFixture() {
  return {
    width: 100,
    height: 100,
    fills: [],
    strokes: [
      { d: 'M10 60 C 30 10, 70 90, 90 40', role: 'score' },
      { d: 'M15 30 C 40 80, 60 20, 88 70', role: 'score' },
      { d: 'M20 80 C 45 40, 55 60, 85 20', role: 'score' },
    ],
  };
}
