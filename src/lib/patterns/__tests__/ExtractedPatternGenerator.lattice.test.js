import { describe, it, expect } from 'vitest';
import { RecordingContext } from '../drawingContext.js';
import { makeExtractedPatternClass } from '../ExtractedPatternGenerator';

// Grid-as-lattice on the motif consumer: when params.modulation.channel is
// 'lattice', ExtractedPatternGenerator STAMPS its tile once per node (push /
// translate / rotate / pop, centred on the node) and caches the absolute nodes
// on this._latticeNodes so toSVGGroup emits identical placements. With no
// lattice modulation it draws ONE centred tile (byte-identical to before) and
// sets this._latticeNodes = null.

// Tiny fake entity — makeExtractedPatternClass only reads entity.tile.
const TILE_D = 'M0,0 L10,0 L10,10 Z';
const fakeEntity = () => ({
  patternId: 'fake-lattice',
  title: 'fake',
  tile: {
    width: 10,
    height: 10,
    fills: [{ d: TILE_D, role: 'engrave' }],
    strokes: [],
  },
});

const CANVAS_W = 200;
const CANVAS_H = 100;
const CX = CANVAS_W / 2; // 100
const CY = CANVAS_H / 2; // 50

// Two nodes with NONZERO angles so a rotate() call is recorded per node.
const NODES = [
  { x: 10, y: 20, angle: Math.PI / 2 },
  { x: -5, y: 15, angle: Math.PI },
];
const latticeParams = () => ({
  modulation: { channel: 'lattice', nodes: NODES.map((n) => ({ ...n })), amount: 1 },
});

describe('ExtractedPatternGenerator — generate() with lattice modulation', () => {
  it('caches absolute nodes (cx+nd.x, cy+nd.y) on this._latticeNodes', () => {
    const Cls = makeExtractedPatternClass(fakeEntity());
    const inst = new Cls();
    inst.generateWithContext(new RecordingContext(), 1, latticeParams(), CANVAS_W, CANVAS_H, '#000000', 100);

    expect(inst._latticeNodes).toHaveLength(2);
    expect(inst._latticeNodes[0]).toMatchObject({ x: CX + 10, y: CY + 20, angle: Math.PI / 2 });
    expect(inst._latticeNodes[1]).toMatchObject({ x: CX - 5, y: CY + 15, angle: Math.PI });
  });

  it('emits push/translate/rotate/pop per node and draws the tile at each', () => {
    const Cls = makeExtractedPatternClass(fakeEntity());
    const inst = new Cls();
    const ctx = new RecordingContext();
    inst.generateWithContext(ctx, 1, latticeParams(), CANVAS_W, CANVAS_H, '#000000', 100);

    const ops = ctx.calls.map((c) => c.op);
    expect(ops.filter((o) => o === 'push')).toHaveLength(2);
    expect(ops.filter((o) => o === 'pop')).toHaveLength(2);
    expect(ops.filter((o) => o === 'rotate')).toHaveLength(2); // both angles nonzero
    // translate(nd.x, nd.y) once per node (tile body uses vertex offsets, not translate).
    const translates = ctx.calls.filter((c) => c.op === 'translate');
    expect(translates).toHaveLength(2);
    expect(translates[0].args).toEqual([CX + 10, CY + 20]);
    expect(translates[1].args).toEqual([CX - 5, CY + 15]);
    // rotate carries the node angle.
    const rotates = ctx.calls.filter((c) => c.op === 'rotate');
    expect(rotates[0].args).toEqual([Math.PI / 2]);
    expect(rotates[1].args).toEqual([Math.PI]);
    // The tile geometry is actually drawn (vertices emitted) at each stamp.
    expect(ctx.calls.filter((c) => c.op === 'beginShape').length).toBeGreaterThanOrEqual(2);
    expect(ctx.calls.filter((c) => c.op === 'vertex').length).toBeGreaterThan(0);
  });
});

describe('ExtractedPatternGenerator — generate() without modulation (unchanged)', () => {
  it('sets this._latticeNodes = null and still draws the centred tile', () => {
    const Cls = makeExtractedPatternClass(fakeEntity());
    const inst = new Cls();
    const ctx = new RecordingContext();
    inst.generateWithContext(ctx, 1, {}, CANVAS_W, CANVAS_H, '#000000', 100);

    expect(inst._latticeNodes).toBeNull();
    // Draws once, centred — no transform-stack stamping.
    expect(ctx.calls.filter((c) => c.op === 'beginShape').length).toBeGreaterThan(0);
    expect(ctx.calls.filter((c) => c.op === 'vertex').length).toBeGreaterThan(0);
    expect(ctx.calls.filter((c) => c.op === 'push')).toHaveLength(0);
    expect(ctx.calls.filter((c) => c.op === 'translate')).toHaveLength(0);
  });
});

describe('ExtractedPatternGenerator — toSVGGroup() lattice vs single', () => {
  it('emits exactly one inner <g> per node with the path repeated per node', () => {
    const Cls = makeExtractedPatternClass(fakeEntity());
    const inst = new Cls();
    inst.generateWithContext(new RecordingContext(), 1, latticeParams(), CANVAS_W, CANVAS_H, '#334455', 90);
    const svg = inst.toSVGGroup('layer-9', '#334455', 90);

    // Outer group carries id + opacity, NO transform (transform lives on inners).
    expect(svg).toContain('id="layer-9"');
    expect(svg).toContain('opacity="0.9"');
    // One inner translate-group per node ⇒ 2 (the outer group has no translate).
    expect(svg.match(/transform="translate\(/g)).toHaveLength(2);
    // The tile path d appears once per node stamp.
    const dEsc = TILE_D; // no special chars ⇒ escapeAttr is a no-op here
    expect(svg.split(dEsc).length - 1).toBe(2);

    // Each inner group centres the tile after translating to the node:
    //   translate(x y) rotate(deg) translate(-w/2 -h/2)
    // Node 0 absolute (110, 70), angle π/2 ⇒ 90deg.
    expect(svg).toContain('translate(110.00 70.00) rotate(90.0000) translate(-5.00 -5.00)');
    // Node 1 absolute (95, 65), angle π ⇒ 180deg.
    expect(svg).toContain('translate(95.00 65.00) rotate(180.0000) translate(-5.00 -5.00)');

    // The SVG node coords equal the cached absolute this._latticeNodes (canvas==SVG).
    expect(inst._latticeNodes[0].x).toBe(110);
    expect(inst._latticeNodes[0].y).toBe(70);
    expect(inst._latticeNodes[1].x).toBe(95);
    expect(inst._latticeNodes[1].y).toBe(65);
  });

  it('unmodulated: emits exactly ONE centring translate group (original behaviour)', () => {
    const Cls = makeExtractedPatternClass(fakeEntity());
    const inst = new Cls();
    inst.generateWithContext(new RecordingContext(), 1, {}, CANVAS_W, CANVAS_H, '#334455', 100);
    const svg = inst.toSVGGroup('layer-9', '#334455', 100);

    // Original structure: outer group carries the single centring translate.
    // ox = cx - w/2 = 100 - 5 = 95 ; oy = cy - h/2 = 50 - 5 = 45.
    expect(svg.match(/transform="translate\(/g)).toHaveLength(1);
    expect(svg).toContain('transform="translate(95 45)"');
    // The path appears exactly once (single tile).
    expect(svg.split(TILE_D).length - 1).toBe(1);
  });
});
