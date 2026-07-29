// @vitest-environment jsdom
// THE PEN EDITOR MUST RE-MEASURE THE FOOTPRINT ON SAVE (PR blocker 1).
//
// `serializeWorkingCopy` used to emit only `{name, tradition, viewRadius, root,
// paths}`, and `useLayers.updateCustomGlyph` does `{...glyph, id}` — a FULL
// replace. So every Save from the pen editor DROPPED `footprintCenter` /
// `footprintRadius`, and since #207 a new motif layer is born
// `sizing.footprint: 'tight'`, which makes `placementEngine` throw (ruling 7d,
// deliberately loud) rather than pack by the law the user opted out of. The
// layer then renders blank.
//
// PRESERVING the two fields is NOT the fix. Editing paths changes the art, so a
// carried-over measurement is stale BY DEFINITION — `applyEdit`/`applyRoot`
// already recompute `viewRadius` on every commit while nothing re-measured the
// minimal enclosing circle. So the editor RE-MEASURES on save, over the same
// point cloud that yields `viewRadius` (the parsed anchor model's anchors + its
// bezier handles), through the one module that defines "tight"
// (`minEnclosingCircle` via `measureFootprint`) — never a re-derived Welzl.
//
// The round-trip through `resolvePlacements` is the test. A presence check on
// the two fields would pass for a carried-over stale measurement; the edited
// case below would not.
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useMotifEditor, {
  makeWorkingCopy,
  serializeWorkingCopy,
} from './useMotifEditor.js';
import { parseDToAnchors, anchorsToD } from '../../lib/motif/pathModel.js';
import { importMotif } from '../../lib/motif/importMotif.js';
import { resolvePlacements } from '../../lib/motif/placementEngine.js';
import { minEnclosingCircle } from '../../lib/motif/minEnclosingCircle.js';
import { flattenPathD } from '../../lib/plotter/pathOps.js';
import { MOTIF_GLYPHS } from '../../lib/motif/glyphs.js';
import { VECTOR_MOTIF_GLYPHS } from '../../lib/motif/vectorMotifsGlyphs.js';

const ALL_GLYPHS = { ...MOTIF_GLYPHS, ...VECTOR_MOTIF_GLYPHS };

// An SVG whose art hangs well off to one side of its bbox bottom-centre root —
// the whole point of the tight footprint. Curves included so the anchor-handle
// cloud and the flattened cloud are genuinely different point sets.
const SVG = `<svg viewBox="0 0 40 30"><title>Vine</title>
  <path d="M4,28 C4,10 14,4 24,4 L34,4 L34,14 L24,14 C14,14 10,20 10,28 Z"/>
  <path d="M28,8 L32,8"/>
</svg>`;

const BOUNDARY = { type: 'rect', width: 400, height: 300 };
const PAGE = { policy: 'page', useNormal: false, offset: 0, perRole: {} };
const TIGHT = { mode: 'proportional', size: 20, min: 0, margin: 0.85, footprint: 'tight' };

const anchor = (id, x, y) => ({ id, role: 'edge', x, y, tangent: 0, normal: Math.PI / 2, s: 0, meta: {} });
const ROW = [anchor('a', 80, 150), anchor('b', 140, 150), anchor('c', 205, 150)];

/** Pack a saved glyph exactly as MotifPattern does for a new (tight) layer. */
const packWith = (glyph) =>
  resolvePlacements(ROW, { orientation: PAGE, sizing: TIGHT }, { boundary: BOUNDARY, glyph });

/** Every flattened art point of a glyph, root-relative. */
function artRootRelative(glyph) {
  const rx = glyph.root?.x ?? 0;
  const ry = glyph.root?.y ?? 0;
  const out = [];
  for (const p of glyph.paths || []) {
    for (const [x, y] of flattenPathD(p.d).points) out.push({ x: x - rx, y: y - ry });
  }
  return out;
}

describe('pen-editor Save round-trip — the saved glyph still packs (blocker 1)', () => {
  it('a real import → open → Save survives resolvePlacements in tight mode', () => {
    const parsed = importMotif(SVG);
    expect(parsed.ok).toBe(true);
    const imported = { ...parsed.glyph, id: 'user:1' };

    // Open the editor on it exactly as Studio does (real parseD/anchorsToD)…
    const wc = makeWorkingCopy(imported, parseDToAnchors);
    // …and Save with no edit at all.
    const saved = { ...serializeWorkingCopy(wc, anchorsToD), id: 'user:1' };

    // Before the fix this threw: glyph "user:1" (anchor "a") is missing a
    // measured footprint — and `useCanvas`'s per-layer catch turned that into a
    // console line and a blank layer.
    expect(() => packWith(saved)).not.toThrow();
    expect(packWith(saved).placements.length).toBeGreaterThan(0);

    expect(Number.isFinite(saved.footprintRadius)).toBe(true);
    expect(saved.footprintRadius).toBeGreaterThan(0);
    expect(Number.isFinite(saved.footprintCenter?.x)).toBe(true);
    expect(Number.isFinite(saved.footprintCenter?.y)).toBe(true);
  });

  it('the saved measurement CONTAINS the saved art (frame check, §7z 5-rev-built)', () => {
    const imported = importMotif(SVG).glyph;
    const saved = serializeWorkingCopy(makeWorkingCopy(imported, parseDToAnchors), anchorsToD);
    const { x: cx, y: cy } = saved.footprintCenter;
    for (const q of artRootRelative(saved)) {
      expect(Math.hypot(q.x - cx, q.y - cy)).toBeLessThanOrEqual(saved.footprintRadius + 1e-9);
    }
  });

  it('is measured FROM THE ROOT, not from the origin', () => {
    // Art entirely to the +x of a root at the origin: a 20×10 box, x∈[10,30],
    // y∈[0,10]. Its minimal enclosing circle is the circumcircle of the four
    // corners — centre (20, 5), radius √(10² + 5²). Measured from the origin
    // root, `footprintCenter` must therefore be (+20, +5): a forgotten `− root`
    // or an origin-centred measurement both move it.
    const glyph = {
      name: 'Box',
      tradition: 'custom',
      viewRadius: Math.hypot(30, 10),
      root: { x: 0, y: 0, angle: 0 },
      paths: [{ d: 'M10,0 L30,0 L30,10 L10,10 Z', closed: true }],
    };
    const saved = serializeWorkingCopy(makeWorkingCopy(glyph, parseDToAnchors), anchorsToD);
    expect(saved.footprintCenter.x).toBeCloseTo(20, 9);
    expect(saved.footprintCenter.y).toBeCloseTo(5, 9);
    expect(saved.footprintRadius).toBeCloseTo(Math.hypot(10, 5), 9);
  });

  it('an EDITED glyph is re-measured, not carried over stale', () => {
    const imported = { ...importMotif(SVG).glyph, id: 'user:1' };
    const { result } = renderHook(() =>
      useMotifEditor(imported, { parseD: parseDToAnchors, anchorsToD })
    );

    // Drag the first anchor of the first path a long way out, exactly as a
    // PenCanvas commit does: new paths array, path marked dirty.
    const paths = result.current.working.paths;
    const model = paths[0].model;
    const moved = {
      ...model,
      subpaths: model.subpaths.map((sp, i) =>
        i === 0
          ? { ...sp, anchors: sp.anchors.map((a, j) => (j === 0 ? { ...a, x: a.x - 60, y: a.y - 40 } : a)) }
          : sp
      ),
    };
    act(() => result.current.applyEdit([{ ...paths[0], model: moved, dirty: true }, paths[1]]));

    const saved = { ...result.current.serialize(), id: 'user:1' };
    // The measurement moved with the art — a carried-over field would be the
    // import's, and the import's circle cannot contain the dragged anchor.
    expect(saved.footprintRadius).toBeGreaterThan(imported.footprintRadius);
    for (const q of artRootRelative(saved)) {
      expect(Math.hypot(q.x - saved.footprintCenter.x, q.y - saved.footprintCenter.y))
        .toBeLessThanOrEqual(saved.footprintRadius + 1e-9);
    }
    expect(packWith(saved).placements.length).toBeGreaterThan(0);
  });

  it('measures through minEnclosingCircle itself — the same cloud viewRadius reduces', () => {
    // No parseD ⇒ no anchor model ⇒ the cloud falls back to the flattened `d`s,
    // which is the cloud `importMotif` reduced. Same points, same order, so the
    // circle comes back BIT-IDENTICAL to the import's.
    const imported = importMotif(SVG).glyph;
    const saved = serializeWorkingCopy(makeWorkingCopy(imported));
    expect(saved.footprintCenter).toEqual(imported.footprintCenter);
    expect(saved.footprintRadius).toBe(imported.footprintRadius);

    // And with a model, it is still Welzl over the anchor+handle cloud.
    const wc = makeWorkingCopy(imported, parseDToAnchors);
    const cloud = [];
    for (const p of wc.paths) {
      for (const sp of p.model.subpaths) {
        for (const a of sp.anchors) {
          cloud.push({ x: a.x, y: a.y });
          if (a.in) cloud.push({ x: a.in.x, y: a.in.y });
          if (a.out) cloud.push({ x: a.out.x, y: a.out.y });
        }
      }
    }
    const mec = minEnclosingCircle(cloud);
    const out = serializeWorkingCopy(wc, anchorsToD);
    expect(out.footprintCenter.x).toBe(mec.x - wc.root.x);
    expect(out.footprintCenter.y).toBe(mec.y - wc.root.y);
    expect(out.footprintRadius).toBe(mec.r);
  });

  it('all 62 built-ins survive an editor round-trip: art contained, fr ≤ viewRadius', () => {
    // The population check behind the single-glyph cases above — the fork-a-
    // built-in path (`useMotifEditorSession.openFork`) runs every one of these
    // through exactly this round-trip, and a built-in carries no `footprint*`
    // of its own into the working copy's `paths`, so the measurement is the
    // editor's own. Measured, not assumed: 0 of 62 exceed their `viewRadius`,
    // and every flattened art point lands inside the saved circle.
    let checked = 0;
    for (const glyph of Object.values(ALL_GLYPHS)) {
      if (!glyph.paths?.length) continue;
      checked++;
      const saved = serializeWorkingCopy(makeWorkingCopy(glyph, parseDToAnchors), anchorsToD);
      expect(saved.footprintRadius).toBeLessThanOrEqual(saved.viewRadius);
      const { x: cx, y: cy } = saved.footprintCenter;
      for (const q of artRootRelative(saved)) {
        expect(Math.hypot(q.x - cx, q.y - cy)).toBeLessThanOrEqual(saved.footprintRadius + 1e-9);
      }
    }
    expect(checked).toBe(62);
  });

  it('a glyph with nothing measurable keeps whatever it arrived with', () => {
    // `openNew`'s blank draft: no paths, so there is no cloud and nothing to
    // measure. Serialize must not invent a circle — and must not lose one.
    const blank = { name: 'New motif', tradition: 'custom', paths: [], viewRadius: 0, root: { x: 0, y: 0, angle: 0 } };
    const out = serializeWorkingCopy(makeWorkingCopy(blank, parseDToAnchors), anchorsToD);
    expect(out.footprintRadius).toBeUndefined();
    expect(out.footprintCenter).toBeUndefined();

    const carried = serializeWorkingCopy(
      makeWorkingCopy({ ...blank, footprintCenter: { x: 1, y: 2 }, footprintRadius: 3 }, parseDToAnchors),
      anchorsToD
    );
    expect(carried.footprintCenter).toEqual({ x: 1, y: 2 });
    expect(carried.footprintRadius).toBe(3);
  });
});
