import { describe, it, expect } from 'vitest';
import { resolveModulationForTarget } from './resolveModulationForTarget';
import { latticeForLayer } from './latticeForLayer';
import { makeExtractedPatternClass } from '../patterns/ExtractedPatternGenerator';
import { RecordingContext } from '../patterns/drawingContext';

// INTEGRATION: the wired path a grid-guide→motif pair actually takes at render
// time — resolveModulationForTarget(target, layers) → the motif's generate(with
// modulation) → toSVGGroup — exercised together (the unit suites test each in
// isolation). Also pins the fit-to-cell scaling that keeps a photo-sized tile
// from stamping into an overlapping blob at every crossing.

const CANVAS = 800;

// A deliberately PHOTO-SIZED tile (600px) — much larger than a grid cell — so
// the scaling behaviour is the one that matters in practice.
const TILE = {
  width: 600,
  height: 600,
  fills: [{ d: 'M0,0 L600,0 L600,600 Z', role: 'engrave' }],
  strokes: [],
};

function gridGuide(params, maps) {
  return {
    id: 'g',
    patternType: 'grid',
    seed: 7,
    params,
    modulator: { maps },
  };
}

describe('lattice integration — grid guide stamps a motif', () => {
  it('resolves the grid guide into a lattice the motif renders at every crossing', () => {
    const motif = { id: 'm', patternType: 'extracted-1' };
    const guide = gridGuide(
      { cols: 2, rows: 2, spacing: 40, symmetry: 1 },
      [{ targetLayerId: 'm', channel: 'lattice', amount: 1 }]
    );

    // 1. Resolver finds the guide for THIS target and returns the lattice.
    const mod = resolveModulationForTarget(motif, [guide, motif]);
    expect(mod).not.toBeNull();
    expect(mod.channel).toBe('lattice');
    expect(mod.cellSize).toBe(40);
    // 3×3 crossings, symmetry 1.
    expect(mod.nodes).toHaveLength(9);
    // Resolver's nodes are exactly what latticeForLayer produces (wiring intact).
    expect(mod.nodes).toEqual(latticeForLayer(guide).nodes);
    // No field-transfer keys leak onto a lattice modulation.
    expect(mod.field).toBeUndefined();
    expect(mod.range).toBeUndefined();

    // 2. The motif generates with that modulation → one stamp per node.
    const Cls = makeExtractedPatternClass({ tile: TILE });
    const inst = new Cls();
    const ctx = new RecordingContext({ seed: 7 });
    inst.generateWithContext(ctx, 7, { modulation: mod }, CANVAS, CANVAS, '#000', 100);

    expect(inst._latticeNodes).toHaveLength(9);
    // Fit-to-cell: longest side 600 → 40*0.9/600 = 0.06.
    expect(inst._latticeScale).toBeCloseTo((40 * 0.9) / 600, 12);
    // Nodes are canvas-centre-relative + (cx,cy): the symmetry-1 grid centres on
    // the canvas, so the middle crossing sits at the canvas centre.
    const centre = inst._latticeNodes.find(
      (n) => Math.abs(n.x - CANVAS / 2) < 1e-9 && Math.abs(n.y - CANVAS / 2) < 1e-9
    );
    expect(centre).toBeTruthy();

    // A transform stack was pushed/popped once per node (9× each), with a scale.
    const pushes = ctx.calls.filter((k) => k.op === 'push').length;
    const pops = ctx.calls.filter((k) => k.op === 'pop').length;
    const scales = ctx.calls.filter((k) => k.op === 'scale').length;
    expect(pushes).toBe(9);
    expect(pops).toBe(9);
    expect(scales).toBe(9);

    // 3. SVG export mirrors it: 9 stamped groups, each carrying the scale and the
    // tile path — canvas == SVG from the shared cached node array.
    const svg = inst.toSVGGroup('m', '#000', 100);
    const groupCount = (svg.match(/<g transform="translate\(/g) || []).length;
    expect(groupCount).toBe(9);
    expect((svg.match(/scale\(/g) || []).length).toBe(9);
    expect((svg.match(/M0,0 L600,0 L600,600 Z/g) || []).length).toBe(9);
  });

  it('scales stamps to FIT the cell — adjacent motifs do not overlap', () => {
    const motif = { id: 'm', patternType: 'extracted-1' };
    const spacing = 40;
    const guide = gridGuide(
      { cols: 3, rows: 3, spacing, symmetry: 1 },
      [{ targetLayerId: 'm', channel: 'lattice', amount: 1 }]
    );
    const mod = resolveModulationForTarget(motif, [guide, motif]);

    const Cls = makeExtractedPatternClass({ tile: TILE });
    const inst = new Cls();
    inst.generateWithContext(
      new RecordingContext({ seed: 7 }),
      7,
      { modulation: mod },
      CANVAS,
      CANVAS,
      '#000',
      100
    );

    // The scaled footprint of a stamp is longest_side * scale. It must not exceed
    // the cell edge (spacing) — otherwise neighbours collide into a blob. This is
    // the assertion that would fail if the fit-to-cell scaling regressed.
    const scaledExtent = Math.max(TILE.width, TILE.height) * inst._latticeScale;
    expect(scaledExtent).toBeLessThanOrEqual(spacing);
    expect(scaledExtent).toBeCloseTo(spacing * 0.9, 9);
  });

  it('a non-grid guide yields no lattice (motif renders static, one centred tile)', () => {
    const motif = { id: 'm', patternType: 'extracted-1' };
    const spiralGuide = {
      id: 's',
      patternType: 'spiral',
      seed: 1,
      params: {},
      modulator: { maps: [{ targetLayerId: 'm', channel: 'lattice', amount: 1 }] },
    };
    // Spiral can't produce a lattice → the map falls through → no modulation.
    expect(resolveModulationForTarget(motif, [spiralGuide, motif])).toBeNull();

    const Cls = makeExtractedPatternClass({ tile: TILE });
    const inst = new Cls();
    inst.generateWithContext(new RecordingContext({ seed: 1 }), 1, {}, CANVAS, CANVAS, '#000', 100);
    expect(inst._latticeNodes).toBeNull();
    const svg = inst.toSVGGroup('m', '#000', 100);
    // One centred group, no per-node scale.
    expect((svg.match(/<g /g) || []).length).toBe(1);
    expect(svg).not.toContain('scale(');
  });
});
