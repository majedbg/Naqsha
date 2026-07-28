// Motif host-geometry capture for Girih / IslamicStar (PRD #143, ticket #152).
//
// Girih stashes its DE-DUPLICATED VERTEX GRAPH and SKELETON EDGE LIST on
// `instance.motifHostGeometry` during generate(), in CANVAS-PIXEL (top-left
// origin) frame:
//   motifHostGeometry = { girihVertices: [{x,y}, …], girihEdges: [[i,j], …] }
//
// THE GRAPH, NOT THE DRAW LIST. The draw list differs between render modes —
// skeleton mode holds strap LINES, interlace mode holds woven BAND POLYGONS —
// so reading it would make the host's anchors depend on its look. The vertex
// graph is built (and cropped) BEFORE either mode branches, so the stash is
// render-mode independent by construction. `stash(skeleton) === stash(interlaced)`
// below is the criterion "skeleton-render and interlace-render girih host motifs
// identically", settled outright.
//
// ONLY VERTICES ON A SURVIVING EDGE. The pattern crops by dropping EDGES
// (`edges.filter(...)`) and never touches `verts`, so the raw vertex array keeps
// endpoints whose every incident edge was filtered away. Those are degree-0: not
// a tip, not a crossing, not on any strand, and pure noise in any index scheme.
// The stash is re-indexed onto the referenced set so every stashed vertex sits on
// a drawn skeleton edge. (The extractor guards degree-0 independently — it is
// also handed literal test geometry.)
//
// FRAME. The pattern builds origin-centred and paints through
// applySymmetryDraw(ctx, 1, cx, cy, drawBase, startAngle, offsetX, offsetY),
// i.e. translate(cx+offsetX, cy+offsetY) then rotate(startAngle). So
//   world = R(startAngle)·centred + (canvasW/2 + offsetX, canvasH/2 + offsetY)
// Symmetry is HARDCODED to 1 here, so there are no copies to replicate — but the
// start-angle rotation is real and IS applied (unlike Voronoi's stash, which
// documents that it matches no visible copy at a nonzero start angle). The frame
// math below is HAND-AUTHORED, never reusing the implementation's conversion.
//
// RNG. Adding the stash must consume NO RNG. Girih's contract is unusually
// clean: ctx.randomSeed(seed) at the top and the ONLY ctx.random calls in the
// whole file are the irregularity loop — exactly two per skeleton vertex. So the
// draw COUNT is 0 at irregularity 0 and exactly 2 × |verts| above it, and a stray
// draw anywhere (including after the loop) changes it in BOTH cases. The digests
// were captured by running THIS FILE's `gen` against the unmodified pattern
// (main @ 03692d7) before the stash existed.

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import IslamicStar from './IslamicStar.js';
import { RecordingContext } from './drawingContext.js';

const W = 800;
const H = 600;
const CX = W / 2;
const CY = H / 2;

function gen(params = {}, seed = 7) {
  const inst = new IslamicStar();
  const ctx = new RecordingContext({ seed: 1 });
  inst.generate(ctx, seed, params, W, H, '#000000', 100);
  return { inst, ctx };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Degree of every stashed vertex, from the stashed edge list. */
function degrees({ girihVertices, girihEdges }) {
  const deg = new Array(girihVertices.length).fill(0);
  for (const [a, b] of girihEdges) {
    deg[a] += 1;
    deg[b] += 1;
  }
  return deg;
}

describe('Girih motif host-geometry capture (vertex graph + skeleton edges)', () => {
  it('stashes a non-empty vertex graph and edge list', () => {
    const { girihVertices, girihEdges } = gen().inst.motifHostGeometry;
    expect(Array.isArray(girihVertices)).toBe(true);
    expect(Array.isArray(girihEdges)).toBe(true);
    expect(girihVertices.length).toBeGreaterThan(0);
    expect(girihEdges.length).toBeGreaterThan(0);
    for (const v of girihVertices) {
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
    }
    for (const e of girihEdges) {
      expect(e).toHaveLength(2);
      expect(e[0]).toBeGreaterThanOrEqual(0);
      expect(e[1]).toBeGreaterThanOrEqual(0);
      expect(e[0]).toBeLessThan(girihVertices.length);
      expect(e[1]).toBeLessThan(girihVertices.length);
      expect(e[0]).not.toBe(e[1]);
    }
  });

  it('is the GRAPH, not the draw list — skeleton and interlace stash identically', () => {
    // The criterion "skeleton-render and interlace-render girih host motifs
    // identically". The draw lists differ wildly (lines vs band polygons); the
    // graph is built before the branch.
    const skeleton = gen({ render: 'skeleton' });
    const interlaced = gen({ render: 'interlaced' });
    expect(skeleton.inst.motifHostGeometry).toEqual(interlaced.inst.motifHostGeometry);
    // …and the draw streams really ARE different, proving the equality above is
    // not two identical renders.
    expect(skeleton.inst.svgElements.length).not.toBe(interlaced.inst.svgElements.length);
    // bandWidth<=0 takes the skeleton branch too — same graph again.
    expect(gen({ bandWidth: 0 }).inst.motifHostGeometry).toEqual(
      skeleton.inst.motifHostGeometry
    );
  });

  it('every stashed vertex sits on at least one stashed edge (no degree-0 orphans)', () => {
    // The crop drops EDGES, not vertices. Orphaned endpoints must not reach the
    // extractor: they are neither tip nor crossing nor on any strand.
    for (const params of [{}, { tiling: 'hex12' }, { density: 6 }, { irregularity: 0.5 }]) {
      const g = gen(params).inst.motifHostGeometry;
      const deg = degrees(g);
      expect(deg.every((d) => d > 0)).toBe(true);
    }
  });

  it('carries all three degree cases — bends, crossings AND crop-margin tips', () => {
    // Girih tips are crop-margin artifacts: the tiling overruns the canvas and is
    // filtered to a margin WIDER than the canvas, so loose ends are cut edges at
    // that margin. A ragged ring, not a designed border — and some sit outside the
    // visible area, which is why placement counts can never equal tip counts.
    const g = gen().inst.motifHostGeometry;
    const deg = degrees(g);
    expect(deg.filter((d) => d === 1).length).toBeGreaterThan(0); // tips
    expect(deg.filter((d) => d === 2).length).toBeGreaterThan(0); // bends
    expect(deg.filter((d) => d >= 3).length).toBeGreaterThan(0); // crossings
  });

  it('emits vertices in CANVAS-PIXEL frame — matching the DRAWN skeleton lines', () => {
    // Skeleton mode draws one ctx.line per skeleton edge, origin-centred. Lift the
    // recorded args by the canvas centre by hand and require an exact match with
    // the stashed graph's edge endpoints.
    const { inst, ctx } = gen({ render: 'skeleton' });
    const { girihVertices, girihEdges } = inst.motifHostGeometry;
    const lines = ctx.calls.filter((c) => c.op === 'line').map((c) => c.args);
    expect(lines.length).toBe(girihEdges.length);
    girihEdges.forEach(([a, b], i) => {
      const [x1, y1, x2, y2] = lines[i];
      expect(girihVertices[a].x).toBeCloseTo(x1 + CX, 9);
      expect(girihVertices[a].y).toBeCloseTo(y1 + CY, 9);
      expect(girihVertices[b].x).toBeCloseTo(x2 + CX, 9);
      expect(girihVertices[b].y).toBeCloseTo(y2 + CY, 9);
    });
  });

  it('applies the offsetX/offsetY term', () => {
    const D = 37;
    const E = -19;
    const base = gen().inst.motifHostGeometry;
    const shifted = gen({ offsetX: D, offsetY: E }).inst.motifHostGeometry;
    expect(shifted.girihEdges).toEqual(base.girihEdges);
    base.girihVertices.forEach((v, i) => {
      expect(shifted.girihVertices[i].x).toBeCloseTo(v.x + D, 9);
      expect(shifted.girihVertices[i].y).toBeCloseTo(v.y + E, 9);
    });
  });

  it('applies the startAngle rotation about the pattern origin (hand-authored)', () => {
    const A = 33;
    const a = (A * Math.PI) / 180;
    const base = gen().inst.motifHostGeometry;
    const rotated = gen({ startAngle: A }).inst.motifHostGeometry;
    expect(rotated.girihEdges).toEqual(base.girihEdges);
    base.girihVertices.forEach((v, i) => {
      const px = v.x - CX;
      const py = v.y - CY;
      expect(rotated.girihVertices[i].x).toBeCloseTo(px * Math.cos(a) - py * Math.sin(a) + CX, 6);
      expect(rotated.girihVertices[i].y).toBeCloseTo(px * Math.sin(a) + py * Math.cos(a) + CY, 6);
    });
  });

  it('start angle AND offsets compose in the painted order (rotate, then translate)', () => {
    const A = 33;
    const D = 21;
    const E = -14;
    const a = (A * Math.PI) / 180;
    const base = gen().inst.motifHostGeometry;
    const both = gen({ startAngle: A, offsetX: D, offsetY: E }).inst.motifHostGeometry;
    base.girihVertices.forEach((v, i) => {
      const px = v.x - CX;
      const py = v.y - CY;
      expect(both.girihVertices[i].x).toBeCloseTo(px * Math.cos(a) - py * Math.sin(a) + CX + D, 6);
      expect(both.girihVertices[i].y).toBeCloseTo(px * Math.sin(a) + py * Math.cos(a) + CY + E, 6);
    });
  });

  it('survives the irregularity setting — a jittered girih still stashes a graph', () => {
    // Story 27. The jitter is applied to the SKELETON vertices before the crop, so
    // the stash tracks the jittered paint rather than the ideal tiling.
    const plain = gen().inst.motifHostGeometry;
    const jittered = gen({ irregularity: 0.5 }).inst.motifHostGeometry;
    expect(jittered.girihVertices.length).toBeGreaterThan(0);
    expect(jittered.girihEdges.length).toBeGreaterThan(0);
    expect(jittered.girihVertices).not.toEqual(plain.girihVertices);
  });

  it('is deterministic — repeated generation yields identical geometry', () => {
    expect(gen({ irregularity: 0.5 }).inst.motifHostGeometry).toEqual(
      gen({ irregularity: 0.5 }).inst.motifHostGeometry
    );
  });

  it('re-seeding moves a jittered girih (the host seed drives the anchors)', () => {
    const a = gen({ irregularity: 0.5 }, 7).inst.motifHostGeometry;
    const b = gen({ irregularity: 0.5 }, 8).inst.motifHostGeometry;
    expect(b.girihVertices).not.toEqual(a.girihVertices);
  });

  it('adding the stash consumed NO RNG — the draw COUNT is unchanged', () => {
    // The whole file's only ctx.random calls are the irregularity loop: exactly
    // two per skeleton vertex (pre-crop). 0 draws with irregularity off. Counting
    // catches a stray draw ANYWHERE in generate() — including one placed AFTER the
    // graph is built, which leaves this pattern's own output intact but
    // desynchronises the shared live-p5 stream for whatever renders next.
    const count = (params) => {
      const inst = new IslamicStar();
      const ctx = new RecordingContext({ seed: 1 });
      let draws = 0;
      const real = ctx.random.bind(ctx);
      ctx.random = (...a) => {
        draws += 1;
        return real(...a);
      };
      inst.generate(ctx, 7, params, W, H, '#000000', 100);
      return { draws, inst };
    };
    for (const params of [
      {},
      { render: 'skeleton' },
      { tiling: 'hex12' },
      { startAngle: 33, offsetX: 21, offsetY: -14 },
    ]) {
      const { draws, inst } = count(params);
      expect(draws).toBe(0);
      expect(inst.motifHostGeometry.girihEdges.length).toBeGreaterThan(0);
    }
    // Irregularity on: exactly 4486 draws at default density/tiling — 2 per
    // pre-crop skeleton vertex. Measured against the unmodified pattern.
    expect(count({ irregularity: 0.5 }).draws).toBe(4486);
  });

  it('adding the stash consumed NO RNG — the draw stream is byte-identical', () => {
    // Digests captured by running this file's `gen` against the UNMODIFIED pattern
    // (main @ 03692d7, before motifHostGeometry existed). Both the recorded draw
    // stream and the emitted SVG are hashed: a single stray ctx.random() call
    // shifts every jittered vertex and both digests change.
    const CASES = [
      ['skeleton', { render: 'skeleton' }, '44db30ee7bf08aed', '3a805fc9aac66f38'],
      ['interlaced', { render: 'interlaced' }, '9539a9140703b27e', '0a1c77324c2169f2'],
      ['irregular', { irregularity: 0.5 }, '37411468303aaf22', '471a29519fee4168'],
      [
        'angle+offset',
        { startAngle: 33, offsetX: 21, offsetY: -14 },
        'c871977be94b0a42',
        '0a1c77324c2169f2',
      ],
      ['hex12', { tiling: 'hex12' }, '1e3078c471cd0e64', '020da4e0583c5727'],
      ['density6', { density: 6 }, '75ce3dbd898235a4', '156878f565179011'],
    ];
    for (const [name, params, callDigest, svgDigest] of CASES) {
      const { inst, ctx } = gen(params);
      expect(`${name}:${sha(JSON.stringify(ctx.calls))}`).toBe(`${name}:${callDigest}`);
      expect(`${name}:${sha(inst.svgElements.join('\n'))}`).toBe(`${name}:${svgDigest}`);
    }
  });
});
