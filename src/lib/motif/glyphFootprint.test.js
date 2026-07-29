// The glyph library's footprint fields — `footprintCenter` and
// `footprintRadius` — are DERIVED data (decision 2). Nothing consumes them yet;
// this file is the whole safety net standing between a transcription error and
// a silent geometry change across 58 built-ins.
//
// Four things are asserted here, in the order they matter:
//
//   1. THE DIFF GATE. `paths`, `viewRadius` and `root` on the 58 vector records
//      are pinned by a digest taken from the file as it stood BEFORE the
//      enrichment script ran (§7: a one-shot pass rewriting a 997-line data file
//      is a single point of failure, and a mistake in it is a silent geometry
//      change rather than a crash). The digest is the ticket's "unchanged
//      byte-for-byte" check, landed as a test rather than eyeballed once.
//   2. THE RECOMPUTE. Every committed `footprintCenter`/`footprintRadius` is
//      re-derived from that glyph's own `paths` and compared EXACTLY — not to a
//      tolerance. A tolerance would let a 1e-8 transcription error through, and
//      1e-8 is four orders of magnitude larger than the 1e-16 at which §3's
//      degeneracy table lives.
//   3. THE FRAME. `footprintCenter` is measured from the glyph's `root`, in the
//      glyph's local units. Two invariants catch a frame or units bug without
//      re-running the measurement: the circle cannot be larger than the root
//      disc, and it must reach the farthest point.
//   4. §3's DEGENERACY TABLE, reproduced off the shipped records. This is the
//      contract the solver slice is written against — decision 7 exists because
//      28 of 62 glyphs sit within 1% of `|fc| = fr`.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { MOTIF_GLYPHS } from './glyphs.js';
import { VECTOR_MOTIF_GLYPHS } from './vectorMotifsGlyphs.js';
import { minEnclosingCircle } from './minEnclosingCircle.js';
import { flattenPathD } from '../plotter/pathOps.js';

// SHA-256 over `id`, `paths`, `viewRadius` and `root` of all 58 vector records,
// in file order, taken from `git show HEAD:src/lib/motif/vectorMotifsGlyphs.js`
// at a11bd65 — i.e. the file as committed BEFORE
// `scripts/enrichVectorMotifFootprints.mjs` first touched it. Serialised through
// `JSON.stringify`, whose number formatting is the shortest round-tripping
// representation of the double, so a single-bit change to any coordinate moves
// the digest.
const PRE_ENRICHMENT_DIGEST = 'a1ce1a454fd4e3e89548504aa5f180c8d0f7e04fbad9da4bebbf728f5b8eaa33';

const ALL_GLYPHS = { ...MOTIF_GLYPHS, ...VECTOR_MOTIF_GLYPHS };

// The point set, reproduced exactly as `scripts/measureGlyphFootprints.mjs:6-13`
// builds it: `flattenPathD` at tol 0.05, paths concatenated in record order, no
// dedup and no filtering. This is not incidental. Welzl's shuffle is
// `(i * 2654435761) % (i + 1)`, a function of array length and index order, so
// reordering or de-duplicating the cloud permutes it differently and can move
// the circle at 1e-16 — which is exactly the `slice18`/`slice91` sign flip §7
// warns about.
function cloudOf(glyph) {
  const out = [];
  for (const p of glyph.paths || []) {
    const { points } = flattenPathD(p.d, 0.05);
    for (const q of points) out.push({ x: q[0], y: q[1] });
  }
  return out;
}

const rootOf = (glyph) => glyph.root || { x: 0, y: 0 };

describe('the enrichment did not disturb the art it measured', () => {
  it('pins `paths`, `viewRadius` and `root` on all 58 vector records to their pre-enrichment bytes', () => {
    const h = createHash('sha256');
    for (const [id, g] of Object.entries(VECTOR_MOTIF_GLYPHS)) {
      h.update(
        `${id}\n${JSON.stringify(g.paths)}\n${JSON.stringify(g.viewRadius)}\n${JSON.stringify(g.root)}\n`
      );
    }
    expect(Object.keys(VECTOR_MOTIF_GLYPHS)).toHaveLength(58);
    expect(h.digest('hex')).toBe(PRE_ENRICHMENT_DIGEST);
  });
});

describe('every glyph carries a usable footprint', () => {
  // An absent field is not a safe default: a glyph missing `footprintRadius`
  // under `sizing.footprint: 'tight'` falls to `undefined` and poisons the
  // quadratic with NaN rather than degrading. There is no fallback to add — the
  // fix is that no glyph is missing it.
  it.each(Object.keys(ALL_GLYPHS))('%s has a finite centre and a strictly positive radius', (id) => {
    const g = ALL_GLYPHS[id];
    expect(Number.isFinite(g.footprintCenter?.x)).toBe(true);
    expect(Number.isFinite(g.footprintCenter?.y)).toBe(true);
    expect(Number.isFinite(g.footprintRadius)).toBe(true);
    expect(g.footprintRadius).toBeGreaterThan(0);
  });

  it('covers all 62 built-ins', () => {
    expect(Object.keys(ALL_GLYPHS)).toHaveLength(62);
  });
});

describe('the committed numbers are the measured numbers', () => {
  // EXACT equality, deliberately. See the header.
  it.each(Object.keys(ALL_GLYPHS))('%s re-derives from its own paths', (id) => {
    const g = ALL_GLYPHS[id];
    const cloud = cloudOf(g);
    for (const p of cloud) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    const mec = minEnclosingCircle(cloud);
    const root = rootOf(g);
    expect(g.footprintCenter.x).toBe(mec.x - root.x);
    expect(g.footprintCenter.y).toBe(mec.y - root.y);
    expect(g.footprintRadius).toBe(mec.r);
  });
});

describe('the footprint is expressed in the glyph-local, root-relative frame', () => {
  // `footprintRadius` is the MINIMAL enclosing circle, so it can never exceed
  // the root-centred disc that `viewRadius` describes — and the circle must
  // reach the farthest point, so `|fc| + fr` covers it. Both are computed
  // against the RE-MEASURED max distance from root, never against the stored
  // `viewRadius`: `leaf`'s 20.1 is deliberately rounded UP from ≈20.0250 for
  // safety margin, so the stored number would fail the second invariant on
  // exactly one glyph for a reason that has nothing to do with the frame.
  it.each(Object.keys(ALL_GLYPHS))('%s nests inside its own root disc and reaches its farthest point', (id) => {
    const g = ALL_GLYPHS[id];
    const root = rootOf(g);
    const cloud = cloudOf(g);
    const rootRadius = Math.max(...cloud.map((p) => Math.hypot(p.x - root.x, p.y - root.y)));
    const fc = g.footprintCenter;
    expect(g.footprintRadius).toBeLessThanOrEqual(rootRadius + 1e-9);
    expect(Math.hypot(fc.x, fc.y) + g.footprintRadius).toBeGreaterThanOrEqual(rootRadius - 1e-9);
  });
});

describe("§3's degeneracy table, reproduced off the shipped records", () => {
  // `A = |fc|² − fr²` is the quadratic's leading coefficient (§3). It vanishes
  // when the root lies ON its own minimal enclosing circle, which is the typical
  // case here rather than the edge case: the 58 vector built-ins root at bbox
  // bottom-center, and the bottom edge is one of the extreme points determining
  // the circle. Normalised by `fr²` so the buckets are scale-free.
  // Computed per test rather than at module scope so a missing field fails one
  // assertion instead of aborting collection for the whole file.
  const table = () =>
    Object.entries(ALL_GLYPHS).map(([id, g]) => {
      const { x, y } = g.footprintCenter;
      const k = Math.hypot(x, y) / g.footprintRadius;
      const A = (x ** 2 + y ** 2 - g.footprintRadius ** 2) / g.footprintRadius ** 2;
      return { id, k, A };
    });

  // The harness's median: sort ascending, take index floor(n/2). Replicated
  // rather than averaged so the number matches the doc digit for digit.
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  it('reports |fc|/fr min 0.0000, median 0.9481, max 1.0000', () => {
    const ks = table().map((r) => r.k);
    expect(Math.min(...ks).toFixed(4)).toBe('0.0000');
    expect(median(ks).toFixed(4)).toBe('0.9481');
    expect(Math.max(...ks).toFixed(4)).toBe('1.0000');
  });

  it('puts 28 of 62 glyphs within 1% of degenerate', () => {
    expect(table().filter((r) => Math.abs(r.A) < 0.01)).toHaveLength(28);
  });

  it('leaves exactly leaf, slice17, slice95 and slice91 degenerate to machine precision', () => {
    expect(table().filter((r) => Math.abs(r.A) < 1e-9).map((r) => r.id).sort()).toEqual(
      ['leaf', 'slice17', 'slice91', 'slice95']
    );
  });

  it('reports slice18 and slice91 as sign-ambiguous, both at |A|/fr² ≈ 0', () => {
    // A > 0 says the root sits OUTSIDE its own minimal enclosing circle, which
    // is geometrically impossible — so the sign is measurement slack, not a fact
    // about the art. Decision 7 never asserts which root is physical, so these
    // two can only ever produce a conservative answer.
    //
    // ⚠️ The two are not equally marginal, and §3's "≈ 0" is quoted at the
    // script's 4-decimal display precision, which is the precision asserted
    // here. `slice91` is at ~7e-16, genuine float noise in |fc|² − fr².
    // `slice18` is at ~1.6e-6 — above the float noise floor, and attributable to
    // the slack the measurement carries by construction: `inCirc`'s 1e-9
    // tolerance lets Welzl return a circle marginally inside the true minimum,
    // and the `d` strings are authored to 2 decimals while `root` is stored at
    // full double precision, so the bbox bottom-center can miss the flattened
    // hull by a hair. Both still sit three orders of magnitude inside the 0.01
    // near-degenerate bucket, so neither changes which branch of decision 7 they
    // exercise.
    const positive = table().filter((r) => r.A > 0);
    expect(positive.map((r) => r.id).sort()).toEqual(['slice18', 'slice91']);
    for (const r of positive) expect(Math.abs(r.A).toFixed(4)).toBe('0.0000');
  });
});
