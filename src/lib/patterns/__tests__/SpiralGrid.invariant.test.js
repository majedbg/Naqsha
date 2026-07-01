import { describe, it, expect } from 'vitest';
import Spiral from '../Spiral.js';
import Grid from '../Grid.js';
import { RecordingContext } from '../drawingContext.js';
import { ScalarField } from '../../fields/ScalarField.js';

// UNMODULATED-INVARIANT regression net for the "Spiral & Grid as modulation
// targets" feature (docs/spiral-grid-modulation-targets.md §2, §3, §8).
//
// The entire snapshot-safety story rests on ONE guarantee: when there is no
// MATCHING modulation, Spiral and Grid emit EXACTLY what they emit today —
// byte-identical. Spiral consumes the new 'distort' channel; Grid consumes
// 'warp'. Any other channel (or a null/absent modulation) must be a no-op, and
// the mere PRESENCE of the new params (distortFrame / warpNodes) must not move
// rendered output while unmodulated.
//
// These tests are written BEFORE the feature edits and must stay GREEN after —
// they are the invariant, not a hope. Grid additionally must stay a straight
// `<line>` emitter until warp is actually applied (no premature <path>).

const W = 800;
const H = 600;
const COLOR = '#224488';
const OPACITY = 80;

const risingField = () =>
  ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });

function runSpiral(seed, params) {
  const inst = new Spiral();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, W, H, COLOR, OPACITY);
  return inst;
}

function runGrid(seed, params) {
  const inst = new Grid();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, W, H, COLOR, OPACITY);
  return inst;
}

describe('Spiral unmodulated invariant', () => {
  const SEED = 42;
  // distortAmount > 0 so the noise-distortion block actually runs — the field
  // masks THIS block, so it is the meaningful thing to hold byte-identical.
  const PARAMS = {
    armCount: 3, turns: 4, innerRadius: 10, outerRadius: 200, growth: 1.0,
    distortAmount: 30, distortScale: 0.01, wobbleAmp: 0, wobbleFreq: 8,
    stepsPerTurn: 60, strokeWeight: 0.8, symmetry: 1,
    startAngle: 0, offsetX: 0, offsetY: 0,
  };

  const baseline = () => runSpiral(SEED, PARAMS).svgElements;

  it('is byte-identical with modulation absent vs. explicitly null', () => {
    expect(runSpiral(SEED, { ...PARAMS, modulation: null }).svgElements)
      .toEqual(baseline());
  });

  it('is a no-op for a NON-distort channel (warp / density)', () => {
    const field = risingField();
    expect(runSpiral(SEED, { ...PARAMS, modulation: { field, channel: 'warp', amount: 3 } }).svgElements)
      .toEqual(baseline());
    expect(runSpiral(SEED, { ...PARAMS, modulation: { field, channel: 'density', amount: 3 } }).svgElements)
      .toEqual(baseline());
  });

  it('is unchanged by the mere presence of distortFrame while unmodulated', () => {
    expect(runSpiral(SEED, { ...PARAMS, distortFrame: 'polar' }).svgElements).toEqual(baseline());
    expect(runSpiral(SEED, { ...PARAMS, distortFrame: 'cartesian' }).svgElements).toEqual(baseline());
  });

  it('emits M/L polyline paths only (never a cubic C segment) when unmodulated', () => {
    // Spiral svgElements are { pathD, strokeWeight } objects; the <path> string
    // is produced by contentFor. The pathD must stay an M/L polyline.
    for (const el of baseline()) {
      expect(el.pathD).toMatch(/^M/);
      expect(el.pathD).not.toMatch(/[Cc]\s*-?\d/); // no cubic segments in a spiral
    }
  });
});

describe('Grid unmodulated invariant', () => {
  const SEED = 7;
  const PARAMS = {
    cols: 4, rows: 3, spacing: 30, nonLinear: 0.5, jitter: 2,
    drawHorizontal: 1, drawVertical: 1, margin: 10,
    strokeWeight: 0.8, symmetry: 2, startAngle: 15, offsetX: 5, offsetY: -5,
  };

  const baseline = () => runGrid(SEED, PARAMS).svgElements;

  it('is byte-identical with modulation absent vs. explicitly null', () => {
    expect(runGrid(SEED, { ...PARAMS, modulation: null }).svgElements).toEqual(baseline());
  });

  it('is a no-op for a NON-warp channel (density)', () => {
    const field = risingField();
    expect(runGrid(SEED, { ...PARAMS, modulation: { field, channel: 'density', amount: 3 } }).svgElements)
      .toEqual(baseline());
  });

  it('is unchanged by the mere presence of warpNodes while unmodulated', () => {
    expect(runGrid(SEED, { ...PARAMS, warpNodes: 6 }).svgElements).toEqual(baseline());
    expect(runGrid(SEED, { ...PARAMS, warpNodes: 24 }).svgElements).toEqual(baseline());
  });

  it('emits straight <line> elements (never a subdivided <path>) when unmodulated', () => {
    for (const el of baseline()) {
      expect(el).toContain('<line');
      expect(el).not.toContain('<path');
    }
  });
});
