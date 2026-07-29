// Circle Packing as a motif host, END TO END (#146): the real pattern stashes
// its accepted circles → resolveMotifHost forwards them → getSemanticAnchors
// turns them into `cell` anchors carrying `hostRadius` → the placement engine
// fits one glyph inside each circle.
//
// EVERY assertion counts ACCEPTED PLACEMENTS (`placements.length` / the
// `placements` array), never `placementStats.placed` — that counter is
// initialised to the post-cap CANDIDATE count, before the no-fit, below-floor
// and rest rejections, so it will happily report glyphs that were rejected.

import { describe, it, expect } from 'vitest';
import CirclePacking from '../patterns/CirclePacking.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import MotifPattern from './MotifPattern.js';
import { getSemanticAnchors } from './semanticAnchors.js';
import { placeMotifs } from './placementEngine.js';
import { resolveMotifHostParams } from './resolveMotifHost.js';
import { defaultMotifAddOpts } from './defaultBinding.js';
import { getGlyph } from './glyphs.js';
import { rolesForHost } from './hostRoles.js';
import { isMotifHost, isSemanticHost, defaultRolesForHost } from './hostKinds.js';

const W = 800;
const H = 600;
const BOUNDARY = { type: 'rect', width: W, height: H };
const PARAMS = { attempts: 600, minRadius: 8, maxRadius: 50 };

/** Run the real pattern and return its stashed accepted circles. */
function packing(params = {}, seed = 7) {
  const inst = new CirclePacking();
  inst.generate(
    new RecordingContext({ seed: 1 }),
    seed,
    { ...PARAMS, ...params },
    W,
    H,
    '#000000',
    100
  );
  return inst.motifHostGeometry.circles;
}

/** The anchors a motif on this packing would actually see. */
function anchorsFor(params = {}, seed = 7) {
  return getSemanticAnchors('circlepacking', { ...PARAMS, ...params }, W, H, {
    circles: packing(params, seed),
  });
}

describe('Circle Packing is a motif host', () => {
  it('is registered as a SEMANTIC motif host defaulting to the cell role', () => {
    expect(isMotifHost('circlepacking')).toBe(true);
    expect(isSemanticHost('circlepacking')).toBe(true);
    expect(defaultRolesForHost('circlepacking')).toEqual(['cell']);
  });

  it('the Route block offers Cells and no other role', () => {
    expect(rolesForHost('circlepacking', PARAMS)).toEqual(['cell']);
  });

  it('the default "+ Add Motif" binding routes to cells and semantic anchoring', () => {
    const opts = defaultMotifAddOpts('circlepacking', 'leaf');
    expect(opts.anchorMode).toBe('semantic');
    expect(opts.binding.selection.roles).toEqual(['cell']);
  });

  it('resolveMotifHostParams forwards the host\'s stashed circles to the extractor', () => {
    const host = { id: 'h1', patternType: 'circlepacking', params: PARAMS, seed: 7 };
    const motif = { id: 'm1', patternType: 'motif', params: { hostLayerId: 'h1' } };
    const resolved = resolveMotifHostParams(motif, [host, motif], {
      h1: { circles: packing() },
    });
    expect(resolved.hostPatternType).toBe('circlepacking');
    expect(resolved.circles.length).toBe(packing().length);
    // No anchorMode override — this is a SEMANTIC host, not an edge host.
    expect(resolved.anchorMode).toBeUndefined();
  });

  it('a host that has not been probed yet degrades to null anchors, not a throw', () => {
    expect(getSemanticAnchors('circlepacking', PARAMS, W, H, {})).toBeNull();
    expect(getSemanticAnchors('circlepacking', PARAMS, W, H)).toBeNull();
    // An empty packing is an honest empty anchor set, NOT null.
    expect(getSemanticAnchors('circlepacking', PARAMS, W, H, { circles: [] })).toEqual([]);
  });
});

describe('Circle Packing places one glyph per circle', () => {
  it('selecting Circle Packing as a host places one glyph per circle', () => {
    const circles = packing();
    expect(circles.length).toBeGreaterThan(10);
    const anchors = anchorsFor();
    expect(anchors).toHaveLength(circles.length);
    // The default add-path binding, with the floor lowered so the criterion is
    // about ONE-PER-CIRCLE and not about the size floor (which has its own test).
    const opts = defaultMotifAddOpts('circlepacking', 'leaf');
    const binding = {
      ...opts.binding,
      placement: {
        ...opts.binding.placement,
        sizing: { ...opts.binding.placement.sizing, min: 0 },
      },
    };
    const { placements } = placeMotifs(anchors, binding, {
      canvasW: W,
      canvasH: H,
      boundary: BOUNDARY,
      // #207: the default add-path binding now packs by the TIGHT law, which
      // reads the glyph's measured footprint. The real path always has the glyph
      // — it is what `defaultMotifAddOpts` was called with.
      glyph: getGlyph('leaf'),
    });
    // ACCEPTED placements, one per circle — never placementStats.placed.
    expect(placements).toHaveLength(circles.length);
    // Every glyph sits inside the circle it occupies.
    placements.forEach((pl) => {
      const c = circles[Number(pl.anchorId.split(':')[1])];
      const d = Math.hypot(pl.x - c.x, pl.y - c.y);
      expect(pl.radius + d).toBeLessThanOrEqual(c.r + 1e-9);
    });
  });

  it('the REAL default add-path — app default packing params + default binding — is not empty', () => {
    // The boundary case a defaults-blind test sails past: CirclePacking's own
    // defaults (minRadius 4, maxRadius 60, attempts 2000) against the default
    // motif binding's size floor (min 3, margin 0.85). 0.85 × 4 = 3.4 clears the
    // floor of 3, so the smallest containers ARE adorned — but only just, and if
    // either default moves this is where it shows.
    const inst = new CirclePacking();
    inst.generate(new RecordingContext({ seed: 1 }), 7, {}, W, H, '#000000', 100);
    const circles = inst.motifHostGeometry.circles;
    const anchors = getSemanticAnchors('circlepacking', {}, W, H, { circles });
    const opts = defaultMotifAddOpts('circlepacking', 'leaf');
    const { placements, rejected } = placeMotifs(anchors, opts.binding, {
      canvasW: W,
      canvasH: H,
      boundary: BOUNDARY,
      glyph: getGlyph('leaf'),
    });
    expect(circles.length).toBeGreaterThan(50);
    expect(placements.length).toBeGreaterThan(0);
    expect(rejected.filter((r) => r.reason === 'below-floor')).toEqual([]);
    expect(placements).toHaveLength(circles.length);
  });

  it('the RENDERER stamps one glyph per circle — MotifPattern threads `circles` through', () => {
    // The last link in the chain, and the only one the other tests skip: every
    // module either side of MotifPattern is exercised directly, so a typo in the
    // key it forwards to getSemanticAnchors (`circle:`, `sites:`, a dropped line)
    // would leave the whole suite green while the feature rendered nothing.
    const circles = packing();
    const opts = defaultMotifAddOpts('circlepacking', 'leaf');
    const inst = new MotifPattern();
    inst.generateWithContext(
      new RecordingContext({ seed: 1 }),
      7,
      {
        glyphRef: 'leaf',
        anchorMode: 'semantic',
        hostPatternType: 'circlepacking',
        hostParams: { ...PARAMS },
        circles,
        binding: {
          ...opts.binding,
          placement: {
            ...opts.binding.placement,
            sizing: { ...opts.binding.placement.sizing, min: 0 },
          },
        },
      },
      W,
      H,
      '#123456',
      100
    );
    // lastPlacementPositions IS the accepted, post-cap placement list (what the
    // draw loop stamps) — not the pre-rejection statistics counter.
    expect(inst.lastPlacementPositions).toHaveLength(circles.length);
    expect(inst.svgElements).toHaveLength(circles.length);
    // And each stamped glyph really is contained by the circle it occupies.
    inst.lastPlacementPositions.forEach((pos, i) => {
      const c = circles[i];
      expect(pos.radius + Math.hypot(pos.x - c.x, pos.y - c.y)).toBeLessThanOrEqual(c.r + 1e-9);
    });
  });

  it('glyph radius tracks circle radius across the packing\'s real spread', () => {
    const circles = packing();
    const anchors = anchorsFor();
    const { placements } = placeMotifs(
      anchors,
      { placement: { sizing: { mode: 'proportional', size: 1000, min: 0, margin: 0.9 } } },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    );
    const byId = new Map(placements.map((p) => [p.anchorId, p]));
    const radii = circles.map((c, i) => ({ host: c.r, glyph: byId.get(`cell:${i}`).radius }));
    const small = radii.reduce((a, b) => (a.host < b.host ? a : b));
    const large = radii.reduce((a, b) => (a.host > b.host ? a : b));
    expect(large.host).toBeGreaterThan(small.host * 1.5); // a real spread exists
    expect(large.glyph).toBeGreaterThan(small.glyph);
  });

  it('the NESTED render yields one anchor per SITE, not one per ring', () => {
    const outlines = anchorsFor({ render: 'outlines' });
    const nested = anchorsFor({ render: 'nested', ringCount: 5 });
    expect(nested).toHaveLength(outlines.length);
    // And no two anchors coincide — a per-ring stash would have produced five
    // anchors sharing every centre, which the empty-circle test would silently
    // reduce to one placement.
    const keys = new Set(nested.map((a) => `${a.x},${a.y}`));
    expect(keys.size).toBe(nested.length);
  });

  it('the LINKS render hosts motifs identically to the OUTLINES render', () => {
    const place = (render) =>
      placeMotifs(
        anchorsFor({ render }),
        { placement: { sizing: { mode: 'proportional', size: 1000, min: 0, margin: 0.9 } } },
        { canvasW: W, canvasH: H, boundary: BOUNDARY }
      ).placements;
    expect(place('links')).toEqual(place('outlines'));
    expect(place('nested')).toEqual(place('outlines'));
  });

  it('regenerating the packing moves the glyphs with it', () => {
    const place = (seed) =>
      placeMotifs(
        anchorsFor({}, seed),
        { placement: { sizing: { mode: 'proportional', size: 1000, min: 0, margin: 0.9 } } },
        { canvasW: W, canvasH: H, boundary: BOUNDARY }
      ).placements;
    const a = place(7);
    const b = place(8);
    expect(a.length).toBeGreaterThan(0);
    expect(b.map((p) => [p.x, p.y])).not.toEqual(a.map((p) => [p.x, p.y]));
    // Same seed ⇒ same placements (reproducibility).
    expect(place(7)).toEqual(a);
  });

  it('a start angle and offsets carry the anchors with the paint', () => {
    const A = 25;
    const D = 30;
    const E = -12;
    const a = (A * Math.PI) / 180;
    const base = anchorsFor();
    const moved = anchorsFor({ startAngle: A, offsetX: D, offsetY: E });
    expect(moved).toHaveLength(base.length);
    // world = R(a)·centred + (W/2 + offsetX, H/2 + offsetY) — hand-authored.
    base.forEach((anchor, i) => {
      const px = anchor.x - W / 2;
      const py = anchor.y - H / 2;
      expect(moved[i].x).toBeCloseTo(px * Math.cos(a) - py * Math.sin(a) + W / 2 + D, 6);
      expect(moved[i].y).toBeCloseTo(px * Math.sin(a) + py * Math.cos(a) + H / 2 + E, 6);
      expect(moved[i].hostRadius).toBeCloseTo(anchor.hostRadius, 12);
    });
  });
});

describe('Circle Packing composes with the Chain', () => {
  const place = (selection) =>
    placeMotifs(
      anchorsFor(),
      {
        selection: { roles: ['cell'], ...selection },
        placement: { sizing: { mode: 'proportional', size: 1000, min: 0, margin: 0.9 } },
      },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    ).placements;

  it('the RATE (every-Nth) block thins the packing\'s anchors', () => {
    const all = place({});
    const everyThird = place({ rate: { n: 3, offset: 0 } });
    expect(everyThird.length).toBe(Math.ceil(all.length / 3));
    expect(everyThird.length).toBeLessThan(all.length);
  });

  it('the SKIP block thins the packing\'s anchors', () => {
    const all = place({});
    const skipped = place({ skip: [false, true] });
    expect(skipped.length).toBe(Math.ceil(all.length / 2));
  });

  it('the DENSITY block thins the packing\'s anchors', () => {
    const all = place({});
    const sparse = place({ density: 0.4, seed: 3 });
    expect(sparse.length).toBeGreaterThan(0);
    expect(sparse.length).toBeLessThan(all.length);
    // Seeded ⇒ reproducible.
    expect(place({ density: 0.4, seed: 3 }).length).toBe(sparse.length);
  });

  it('a container below the size floor receives NO placement — the maker\'s "do not adorn" control', () => {
    // A floor above margin × the smallest circle leaves the smallest containers
    // bare while the roomy ones are still adorned.
    const circles = packing();
    const smallest = Math.min(...circles.map((c) => c.r));
    const floor = 0.9 * smallest + 1;
    const { placements, rejected } = placeMotifs(
      anchorsFor(),
      {
        selection: { roles: ['cell'] },
        placement: { sizing: { mode: 'proportional', size: 1000, min: floor, margin: 0.9 } },
      },
      { canvasW: W, canvasH: H, boundary: BOUNDARY }
    );
    const belowFloor = rejected.filter((r) => r.reason === 'below-floor');
    expect(belowFloor.length).toBeGreaterThan(0);
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.length).toBeLessThan(circles.length);
    // Every ACCEPTED placement clears the floor…
    for (const pl of placements) expect(pl.radius).toBeGreaterThanOrEqual(floor);
    // …and no rejected anchor appears among them.
    const rejectedIds = new Set(rejected.map((r) => r.anchorId));
    for (const pl of placements) expect(rejectedIds.has(pl.anchorId)).toBe(false);
  });
});
