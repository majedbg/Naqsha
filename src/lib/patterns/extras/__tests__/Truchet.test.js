import { describe, it, expect } from 'vitest';
import Truchet from '../Truchet.js';
import { RecordingContext, Pattern } from '../../drawingContext.js';

// Headless characterization of Truchet. Pins svgElements + toSVGGroup for a
// fixed seed+params. Under RecordingContext the per-tile orientation choice is
// deterministic — this locks the LOGIC, not production bytes.
const SEED = 42;
const PARAMS = {
  tiles: 6,
  tileSet: 'arcs',
  strokeWeight: 1.0,
  symmetry: 1, // must be 1: applySymmetryDraw runs drawBase once per copy, so a
  //             higher value would multiply canvas op counts vs. svgElements and
  //             break the canvas==SVG agreement assertion below.
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run(params = PARAMS) {
  const inst = new Truchet();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('Truchet (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Truchet()).toBeInstanceOf(Pattern);
  });

  it('renders headlessly and pins svgElements (golden master)', () => {
    const { inst } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
    expect(inst.svgElements).toMatchSnapshot();
  });

  it('pins the wrapped SVG group output', () => {
    const { inst } = run();
    expect(inst.toSVGGroup('L1', COLOR, OPACITY)).toMatchSnapshot();
  });

  it('emits beginShape/vertex/endShape draw calls for the arcs tileSet', () => {
    const { ctx } = run();
    const beginCalls = ctx.calls.filter((c) => c.op === 'beginShape');
    const vertexCalls = ctx.calls.filter((c) => c.op === 'vertex');
    const endCalls = ctx.calls.filter((c) => c.op === 'endShape');
    expect(beginCalls.length).toBeGreaterThan(0);
    expect(vertexCalls.length).toBeGreaterThan(0);
    expect(endCalls.length).toBe(beginCalls.length);
  });

  it('locks canvas==SVG agreement: one drawn shape per svgElement', () => {
    // With symmetry=1, drawBase runs exactly once. The number of canvas shapes
    // (beginShape ops for arcs) must equal the number of svgElements, proving
    // BOTH renderers consumed the same single-RNG-pass tile array. If a second
    // RNG pull or a separate loop desynced them, these counts would diverge.
    const { inst, ctx } = run();
    const beginCalls = ctx.calls.filter((c) => c.op === 'beginShape');
    expect(beginCalls.length).toBe(inst.svgElements.length);
    // arcs => 2 quarter-arcs per tile => 2 * tiles^2 shapes.
    expect(inst.svgElements.length).toBe(2 * PARAMS.tiles * PARAMS.tiles);
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });

  it('diagonals tileSet emits line shapes that agree canvas==SVG', () => {
    const params = { ...PARAMS, tileSet: 'diagonals' };
    const { inst, ctx } = run(params);
    const beginCalls = ctx.calls.filter((c) => c.op === 'beginShape');
    // one diagonal polyline per tile
    expect(inst.svgElements.length).toBe(PARAMS.tiles * PARAMS.tiles);
    expect(beginCalls.length).toBe(inst.svgElements.length);
  });
});
