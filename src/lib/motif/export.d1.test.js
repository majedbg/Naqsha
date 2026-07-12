// D1 — multi-glyph SVG EXPORT golden (issue #79, Phase D).
//
// B1 proved the per-slot dual-emit at the `svgElements` level. This slice proves
// the same geometry survives the REAL export path — svgExport.buildAllLayersSVG →
// MotifPattern.toSVGGroup — so a sequenced motif exports SVG containing ALL slot
// glyphs, per-slot, with each slot's modifiers folded into its matrix. Two cases
// the correctness targets call out explicitly:
//   (a) a MODIFIER-ONLY slot (no glyphRef → falls back to the base glyph) whose
//       `sizeScale` still manifests in the exported matrix, and
//   (b) a per-slot `rotationRandom` slot whose rotation delta is baked into the
//       matrix.
//
// TWO KINDS of assertion, kept separate (advisor note): dual-emit PARITY proves
// canvas == SVG through the export string (a single matrix drives both, so a
// dropped modifier would leave BOTH un-modified and parity would still pass). A
// DIFFER-FROM-BASELINE complement — same anchors WITH vs WITHOUT the modifier —
// is what actually proves the modifier was applied; that is the assertion the
// mutate-to-red flips.
//
// Env: pure JS (RecordingContext) — no jsdom.

import { describe, it, expect } from 'vitest';
import MotifPattern from './MotifPattern.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import { getGlyph } from './glyphs.js';
import { parsePathD } from '../plotter/pathOps.js';
import { buildAllLayersSVG } from '../svgExport.js';

const W = 800;
const H = 600;

// Diagonal host → non-axis-aligned rotation, so a rotation modifier genuinely
// shows up in the matrix (a 45° tangent scene, same trap as the B1 parity suite).
const DIAGONAL_HOST = [{ points: [{ x: 100, y: 100 }, { x: 300, y: 300 }], closed: false }];

// Verbatim built-in glyph `d` (mirrors glyphs.js) — asserting the RIGHT glyph
// reached the RIGHT slot, which parity alone cannot catch.
const LEAF_D = 'M0,-10 L7,-4 L8,5 L2,10 L-6,6 L-7,-2 L-2,-8 Z';
const DOT_D =
  'M3,0 L2.1213,2.1213 L0,3 L-2.1213,2.1213 L-3,0 L-2.1213,-2.1213 L0,-3 L2.1213,-2.1213 Z';

function baseParams(overrides = {}) {
  return {
    glyphRef: 'leaf',
    hostPaths: DIAGONAL_HOST,
    binding: {},
    anchorMode: 'edge',
    edgeOpts: { count: 2 },
    glyphs: { leaf: getGlyph('leaf'), dot: getGlyph('dot') },
    ...overrides,
  };
}

// A minimal chain carrying ONLY a sequencer block (no selection filters ⇒ all
// anchors survive) — the smallest input that exercises the multi-glyph path.
const seqChain = (slots, extra = {}) => ({
  chain: [{ type: 'sequence', mode: 'cycle', slots, ...extra }],
});

function run(params, ctxSeed = 1, color = '#123456', opacity = 100) {
  const inst = new MotifPattern();
  const ctx = new RecordingContext({ seed: ctxSeed });
  inst.generateWithContext(ctx, 7, params, W, H, color, opacity);
  return { inst, ctx };
}

// The layer wrapper buildAllLayersSVG consumes. Plain motif layer: visible, no
// variableWeight, no transform, no bg → export passes the group through verbatim.
function motifLayer(id, color = '#123456', opacity = 100) {
  return { id, type: 'motif', patternType: 'motif', visible: true, color, opacity };
}

// Drive the REAL export path with inert opts (no optimizations, no sheetRect) so
// the per-slot <g transform> boundaries survive byte-for-byte (advisor note 4).
function exportSVG(inst, layer) {
  return buildAllLayersSVG([layer], { [layer.id]: inst }, W, H, false, {});
}

// --- TEST-LOCAL affine. Intentionally NOT imported from instancing.js, so the
// parity check can't be made vacuous by reusing the impl transform. ---
// SVG matrix [a,b,c,d,e,f] maps (x,y) -> (a*x + c*y + e, b*x + d*y + f).
const localApply = (x, y, [a, b, c, d, e, f]) => [a * x + c * y + e, b * x + d * y + f];

function canvasPolylines(calls) {
  const polys = [];
  let cur = null;
  for (const { op, args } of calls) {
    if (op === 'beginShape') cur = [];
    else if (op === 'vertex' && cur) cur.push([args[0], args[1]]);
    else if (op === 'endShape') {
      if (cur) polys.push(cur);
      cur = null;
    }
  }
  return polys;
}

// Parse each <g transform="matrix(...)">…<path d="…"/> out of an SVG STRING
// (regex only) IN DOCUMENT ORDER. Reads the exported markup, not svgElements —
// so it exercises what actually ships in the file.
function svgInstancesFromString(svg) {
  return [...svg.matchAll(/<g transform="matrix\(([^)]+)\)">(.*?)<\/g>/gs)].map((gm) => {
    const matrix = gm[1].trim().split(/\s+/).map(Number);
    const paths = [...gm[2].matchAll(/<path[^>]*\bd="([^"]+)"/g)].map((pm) => parsePathD(pm[1]));
    return { matrix, paths, raw: gm[0] };
  });
}

function svgPolylines(insts) {
  const polys = [];
  for (const inst of insts) {
    for (const p of inst.paths) {
      polys.push(p.points.map(([x, y]) => localApply(x, y, inst.matrix)));
    }
  }
  return polys;
}

const scaleOf = (m) => Math.hypot(m[0], m[1]); // |scale| = sqrt(a^2 + b^2)
const rotationOf = (m) => Math.atan2(m[1], m[0]); // radians (ignores flip/scale sign nuance)

describe('D1 — multi-glyph SVG export golden (buildAllLayersSVG)', () => {
  it('exports EVERY slot glyph, per-slot, in slot order (x-o) through the real export path', () => {
    const params = baseParams({ binding: seqChain([{ glyphRef: 'leaf' }, { glyphRef: 'dot' }]) });
    const { inst } = run(params);
    const svg = exportSVG(inst, motifLayer('layer-seq'));

    // The layer group wrapper survives, and BOTH slot glyphs are in the file.
    expect(svg).toContain('id="layer-seq"');
    expect(svg).toContain(LEAF_D);
    expect(svg).toContain(DOT_D);

    // …and per-slot, IN ORDER: instance 0 = leaf, instance 1 = dot. A
    // "base glyph in every slot" regression would fail the DOT position check.
    const insts = svgInstancesFromString(svg);
    expect(insts.length).toBe(2);
    expect(insts[0].raw).toContain(LEAF_D);
    expect(insts[0].raw).not.toContain(DOT_D);
    expect(insts[1].raw).toContain(DOT_D);
    expect(insts[1].raw).not.toContain(LEAF_D);
  });

  it('PARITY through the export string: each slot glyph independently-transformed equals its canvas vertices', () => {
    // Slot 0 = asymmetric leaf FLIPPED on the diagonal host (mirror + rotation).
    // Slot 1 = dot (different vertex count). Parse the EXPORTED file's matrix +
    // verbatim d, apply the TEST-LOCAL affine, compare to the canvas polylines.
    const params = baseParams({ binding: seqChain([{ glyphRef: 'leaf', flip: true }, { glyphRef: 'dot' }]) });
    const { inst, ctx } = run(params);
    const svg = exportSVG(inst, motifLayer('layer-parity'));
    const insts = svgInstancesFromString(svg);
    expect(insts.length).toBe(2);

    const det = (m) => m[0] * m[3] - m[1] * m[2];
    expect(det(insts[0].matrix)).toBeLessThan(0); // slot 0 flipped → mirror
    expect(det(insts[1].matrix)).toBeGreaterThan(0);
    expect(Math.abs(insts[0].matrix[1])).toBeGreaterThan(1e-6); // rotation manifested
    expect(insts[0].paths[0].points.length).toBe(7); // leaf
    expect(insts[1].paths[0].points.length).toBe(8); // dot

    const canvasPolys = canvasPolylines(ctx.calls);
    const svgPolys = svgPolylines(insts);
    expect(canvasPolys.length).toBe(2);
    expect(svgPolys.length).toBe(2);
    canvasPolys.forEach((cPoly, i) => {
      const sPoly = svgPolys[i];
      expect(cPoly.length).toBe(sPoly.length);
      expect(cPoly.length).toBeGreaterThan(0);
      cPoly.forEach(([cx, cy], k) => {
        expect(cx).toBeCloseTo(sPoly[k][0], 2);
        expect(cy).toBeCloseTo(sPoly[k][1], 2);
      });
    });
  });

  describe('(a) modifier-only slot (no glyphRef) — falls back to base glyph AND its sizeScale manifests', () => {
    it('exports the BASE glyph for a glyph-less slot, with the sizeScale baked into the matrix', () => {
      // Slot 1 has ONLY sizeScale (no glyphRef) → base leaf, scaled 1.5×.
      const scaled = baseParams({ binding: seqChain([{ glyphRef: 'leaf' }, { sizeScale: 1.5 }]) });
      const baseline = baseParams({ binding: seqChain([{ glyphRef: 'leaf' }, { glyphRef: 'leaf' }]) });

      const svgScaled = exportSVG(run(scaled).inst, motifLayer('m-scaled'));
      const svgBaseline = exportSVG(run(baseline).inst, motifLayer('m-base'));

      const iScaled = svgInstancesFromString(svgScaled);
      const iBaseline = svgInstancesFromString(svgBaseline);
      expect(iScaled.length).toBe(2);
      expect(iBaseline.length).toBe(2);

      // Fallback: the glyph-less slot still exports the BASE leaf (not a gap).
      expect(iScaled[1].raw).toContain(LEAF_D);

      // DIFFER-FROM-BASELINE complement (the modifier-applied bite): instance 1's
      // matrix scale is ~1.5× the un-scaled baseline instance's. Instance 0 is
      // unchanged between scenes (anchor untouched by the sibling slot's scale).
      expect(scaleOf(iScaled[0].matrix)).toBeCloseTo(scaleOf(iBaseline[0].matrix), 4);
      expect(scaleOf(iScaled[1].matrix) / scaleOf(iBaseline[1].matrix)).toBeCloseTo(1.5, 3);
    });
  });

  describe('(b) per-slot rotationRandom — the rotation delta is baked into the exported matrix', () => {
    it('a flat-spread rotationRandom slot rotates its instance vs the same slot without it', () => {
      // Flat spread + LARGE range so the deterministic per-anchor delta is
      // unambiguously above precision (advisor note 2 — bell centers near 0).
      const RANGE = 75;
      const withRR = baseParams({
        binding: seqChain([
          { glyphRef: 'leaf' },
          { glyphRef: 'leaf', rotationRandom: { range: RANGE, spread: 'flat' } },
        ], { seed: 9 }),
      });
      const withoutRR = baseParams({
        binding: seqChain([{ glyphRef: 'leaf' }, { glyphRef: 'leaf' }], { seed: 9 }),
      });

      const { inst: instRR, ctx: ctxRR } = run(withRR);
      const svgRR = exportSVG(instRR, motifLayer('m-rr'));
      const iRR = svgInstancesFromString(svgRR);
      const iPlain = svgInstancesFromString(exportSVG(run(withoutRR).inst, motifLayer('m-plain')));
      expect(iRR.length).toBe(2);
      expect(iPlain.length).toBe(2);

      // DIFFER-FROM-BASELINE complement: instance 1 (the rotationRandom slot) has
      // a materially different rotation; instance 0 (no rotationRandom) is
      // identical between scenes. |Δrotation| well above the toBeCloseTo epsilon.
      const dRot = Math.abs(rotationOf(iRR[1].matrix) - rotationOf(iPlain[1].matrix));
      expect(dRot).toBeGreaterThan(0.05); // radians (~2.9°); real delta is far larger
      // Instance 0 untouched (its slot carries no rotationRandom).
      expect(rotationOf(iRR[0].matrix)).toBeCloseTo(rotationOf(iPlain[0].matrix), 6);

      // …and canvas == SVG still holds POINT-FOR-POINT for the rotationRandom
      // scene (deliverable 1b: prove parity for THIS modifier, since the delta is
      // baked into the SAME matrix that drives both emitters — a rotation that
      // reached SVG but not canvas would break here).
      const canvasPolys = canvasPolylines(ctxRR.calls);
      const svgPolys = svgPolylines(iRR);
      expect(canvasPolys.length).toBe(svgPolys.length);
      expect(canvasPolys.length).toBeGreaterThan(0);
      canvasPolys.forEach((cPoly, i) => {
        cPoly.forEach(([cx, cy], k) => {
          expect(cx).toBeCloseTo(svgPolys[i][k][0], 2);
          expect(cy).toBeCloseTo(svgPolys[i][k][1], 2);
        });
      });
    });

    it('rotationRandom is DETERMINISTIC across ctx seeds (same file every export)', () => {
      const params = baseParams({
        binding: seqChain([
          { glyphRef: 'leaf' },
          { glyphRef: 'leaf', rotationRandom: { range: 75, spread: 'flat' } },
        ], { seed: 9 }),
      });
      const a = exportSVG(run(params, 1).inst, motifLayer('m-det'));
      const b = exportSVG(run(params, 2).inst, motifLayer('m-det'));
      expect(a).toBe(b);
    });
  });
});
