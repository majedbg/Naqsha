import { describe, it, expect } from 'vitest';
import Dendrite, { decomposeIntoPaths } from '../Dendrite.js';
import { RecordingContext, Pattern } from '../drawingContext.js';
import { capturePolylines } from '../../motif/capturePolylines.js';

// Headless characterization of Dendrite (DLA branch skeleton). Under
// RecordingContext, ctx.random() is a deterministic mulberry32 stream, so the
// whole aggregation is reproducible. This locks the LOGIC (determinism,
// seedMode → output, maxNodes → bond count, valid line SVG, real symmetry
// wiring, speed), not production p5 bytes. Counts are kept modest for speed.
const SEED = 7;
const BASE = {
  seedMode: 'center',
  render: 'bonds',
  maxNodes: 400,
  stickiness: 0.8,
  nodeSpacing: 6,
  strokeWeight: 0.7,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#224488';
const OPACITY = 80;
const W = 800;
const H = 600;

function run(params = BASE, seed = SEED) {
  const inst = new Dendrite();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

const countPaths = (els) => els.filter((e) => e.startsWith('<polyline')).length;

// Total <polyline> point-to-point segments across all emitted paths — the
// same quantity `countLines` measured back when each bond was its own <line>.
// Used to prove the underlying bond set is unchanged: S1 only regroups bonds
// into connected paths, it does not add, drop, or duplicate any of them.
const countSegments = (els) =>
  els
    .filter((e) => e.startsWith('<polyline'))
    .reduce((sum, e) => {
      const m = e.match(/points="([^"]*)"/);
      const n = m ? m[1].trim().split(/\s+/).length : 0;
      return sum + Math.max(0, n - 1);
    }, 0);

describe('Dendrite (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Dendrite()).toBeInstanceOf(Pattern);
  });

  it('emits <polyline> paths and draws via ctx.beginShape/vertex/endShape', () => {
    const { inst, ctx } = run();
    expect(countPaths(inst.svgElements)).toBeGreaterThan(0);
    expect(ctx.calls.some((c) => c.op === 'beginShape')).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'vertex')).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'endShape')).toBe(true);
    // No per-bond <line> fragments and no ctx.line draw calls any more (S1).
    expect(inst.svgElements.some((e) => e.startsWith('<line'))).toBe(false);
    expect(ctx.calls.some((c) => c.op === 'line')).toBe(false);
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });

  it('different seeds change the output', () => {
    expect(run(BASE, 7).inst.svgElements).not.toEqual(run(BASE, 99).inst.svgElements);
  });

  it('larger maxNodes yields more bond segments', () => {
    const few = countSegments(run({ ...BASE, maxNodes: 300 }).inst.svgElements);
    const many = countSegments(run({ ...BASE, maxNodes: 900 }).inst.svgElements);
    expect(many).toBeGreaterThan(few);
  });

  it('each seedMode produces output', () => {
    for (const seedMode of ['center', 'ground', 'ring']) {
      const els = run({ ...BASE, seedMode }).inst.svgElements;
      expect(countSegments(els)).toBeGreaterThan(10);
    }
  });

  it('nodesBonds render adds circles on top of the paths', () => {
    const bonds = run({ ...BASE, render: 'bonds' }).inst.svgElements;
    const both = run({ ...BASE, render: 'nodesBonds' }).inst.svgElements;
    expect(both.some((e) => e.startsWith('<circle'))).toBe(true);
    expect(bonds.some((e) => e.startsWith('<circle'))).toBe(false);
    expect(both.length).toBeGreaterThan(bonds.length);
  });

  it('emits valid polyline SVG (parseable coords, open, no fill)', () => {
    const el = run().inst.svgElements.find((e) => e.startsWith('<polyline'));
    expect(el).toMatch(/^<polyline points="(-?[\d.]+,-?[\d.]+ ?)+" fill="none" stroke=".*" stroke-width=".*" stroke-linecap="round"\/>$/);
  });

  it('each emitted path has at least 2 points (at least one bond)', () => {
    const els = run({ ...BASE, maxNodes: 900 }).inst.svgElements;
    const pathsPts = els
      .filter((e) => e.startsWith('<polyline'))
      .map((e) => e.match(/points="([^"]*)"/)[1].trim().split(/\s+/).length);
    expect(pathsPts.length).toBeGreaterThan(0);
    for (const n of pathsPts) expect(n).toBeGreaterThanOrEqual(2);
  });

  it('path count is far smaller than bond (segment) count — long stems, not fragments', () => {
    const els = run({ ...BASE, maxNodes: 900 }).inst.svgElements;
    const paths = countPaths(els);
    const segments = countSegments(els);
    expect(paths).toBeGreaterThan(0);
    expect(segments).toBeGreaterThan(paths * 2); // paths << bonds, not 1:1 fragments
  });

  it('the longest emitted path spans many nodes, not just an endpoint pair', () => {
    const els = run({ ...BASE, maxNodes: 900 }).inst.svgElements;
    const lens = els
      .filter((e) => e.startsWith('<polyline'))
      .map((e) => e.match(/points="([^"]*)"/)[1].trim().split(/\s+/).length);
    expect(Math.max(...lens)).toBeGreaterThan(2);
  });

  it('the wrapped SVG group honors the real symmetry param', () => {
    const single = run({ ...BASE, symmetry: 1 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    const hex = run({ ...BASE, symmetry: 6 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    const singleGroups = (single.match(/<g transform="translate/g) || []).length;
    const hexGroups = (hex.match(/<g transform="translate/g) || []).length;
    expect(singleGroups).toBe(1);
    expect(hexGroups).toBe(6);
    expect(hex).toContain('rotate(60)');
  });

  it('symmetry=4 yields four rotated SVG groups', () => {
    const quad = run({ ...BASE, symmetry: 4 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    expect((quad.match(/<g transform="translate/g) || []).length).toBe(4);
    expect(quad).toContain('rotate(90)');
  });

  it('finishes a large budget without hanging', () => {
    const t0 = Date.now();
    const { inst } = run({ ...BASE, maxNodes: 2000 });
    const ms = Date.now() - t0;
    expect(countSegments(inst.svgElements)).toBeGreaterThan(500);
    expect(ms).toBeLessThan(5000); // generous ceiling; real default is far faster
  });

  // ── S1 acceptance: captured host paths are long connected polylines ────────
  // The whole point of S1 — a vine host arc-length sampling Dendrite should now
  // see a handful of long stems, not thousands of 6px fragments. Runs the real
  // capture pipeline (capturePolylines), mirroring the pattern
  // src/lib/motif/hostCapture.test.js uses for every other edge host.
  it('captured via capturePolylines: few long OPEN paths, not one-per-bond fragments', () => {
    const { ctx } = run({ ...BASE, maxNodes: 900 });
    const hostPaths = capturePolylines(ctx.calls);
    const totalSegments = hostPaths.reduce((sum, p) => sum + p.points.length - 1, 0);

    expect(hostPaths.length).toBeGreaterThan(0);
    // path count << bond (segment) count.
    expect(hostPaths.length).toBeLessThan(totalSegments / 2);
    // at least one path is a real stem, not a 2-point fragment.
    const maxPathLen = Math.max(...hostPaths.map((p) => p.points.length));
    expect(maxPathLen).toBeGreaterThan(2);
    // every captured path is open — a rooted skeleton has real termini.
    for (const p of hostPaths) expect(p.closed).toBe(false);
  });
});

// ── decomposeIntoPaths — pure decomposition, unit-tested directly ───────────
// Coordinate-free: hand-built synthetic bond forests where the correct
// partition can be verified by inspection, rather than relying on thousands of
// DLA-generated bonds. `bonds` must be CHILD-ASCENDING (parent index < its
// own child's index, sorted ascending by child), matching Dendrite's real
// invariant (see the file header).
describe('decomposeIntoPaths (pure decomposition, unit)', () => {
  /** Sum of {p,c} segments across all returned paths, as a Set of "p-c" keys. */
  const segmentSet = (paths) => {
    const s = new Set();
    for (const path of paths) {
      for (let i = 0; i + 1 < path.length; i++) s.add(`${path[i]}-${path[i + 1]}`);
    }
    return s;
  };
  const bondSet = (bonds) => new Set(bonds.map((b) => `${b.p}-${b.c}`));
  const countEmittedSegments = (paths) =>
    paths.reduce((sum, p) => sum + p.length - 1, 0);

  it('a simple chain (no junctions) is one path', () => {
    const bonds = [{ p: 0, c: 1 }, { p: 1, c: 2 }, { p: 2, c: 3 }];
    const paths = decomposeIntoPaths(bonds, 4);
    expect(paths).toEqual([[0, 1, 2, 3]]);
  });

  it('a Y junction splits into two paths — the deeper subtree continues', () => {
    // 1 has two children: 2 (leaf, depth 0) and 3→4 (depth 1, deeper).
    const bonds = [{ p: 0, c: 1 }, { p: 1, c: 2 }, { p: 1, c: 3 }, { p: 3, c: 4 }];
    const paths = decomposeIntoPaths(bonds, 5);
    expect(paths).toContainEqual([0, 1, 3, 4]); // main branch: continues via the deeper child
    expect(paths).toContainEqual([1, 2]); // side branch: starts fresh AT the junction
    expect(paths.length).toBe(2);
  });

  it('a multi-root forest (ground/ring seeding) decomposes each tree independently', () => {
    const bonds = [{ p: 0, c: 2 }, { p: 1, c: 3 }, { p: 3, c: 4 }];
    const paths = decomposeIntoPaths(bonds, 5);
    expect(paths).toContainEqual([0, 2]);
    expect(paths).toContainEqual([1, 3, 4]);
    expect(paths.length).toBe(2);
  });

  it('a junction AT the root is handled the same as an interior junction', () => {
    const bonds = [{ p: 0, c: 1 }, { p: 0, c: 2 }, { p: 2, c: 3 }];
    const paths = decomposeIntoPaths(bonds, 4);
    expect(paths).toContainEqual([0, 2, 3]); // deeper child continues
    expect(paths).toContainEqual([0, 1]); // shallower child starts a new path at the root
    expect(paths.length).toBe(2);
  });

  it('an isolated seed with no bonds emits no path', () => {
    expect(decomposeIntoPaths([], 3)).toEqual([]);
  });

  it('EVERY bond appears in EXACTLY ONE path — no duplicates, none dropped (property test)', () => {
    // Deterministic pseudo-random tree generator (no RNG dependency on the app).
    function randTree(n, seed) {
      let s = seed;
      const rand = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
      const bonds = [];
      for (let c = 1; c < n; c++) {
        const p = Math.floor(rand() * c); // parent among already-created nodes
        bonds.push({ p, c });
      }
      return bonds;
    }
    for (const seed of [1, 2, 3, 12345, 99999]) {
      const bonds = randTree(300, seed);
      const paths = decomposeIntoPaths(bonds, 300);
      expect(segmentSet(paths)).toEqual(bondSet(bonds));
      expect(countEmittedSegments(paths)).toBe(bonds.length);
      // partition, not one-path-per-tip: far fewer paths than bonds on a bushy tree.
      expect(paths.length).toBeLessThan(bonds.length);
    }
  });

  it('paths are arc-length ordered root/junction → tip (no backtracking within a path)', () => {
    // Each successive node in a path must actually be a CHILD of the previous
    // one (a real bond, walked forward) — i.e. paths never jump or reverse.
    const bonds = [{ p: 0, c: 1 }, { p: 1, c: 2 }, { p: 1, c: 3 }, { p: 3, c: 4 }, { p: 3, c: 5 }];
    const paths = decomposeIntoPaths(bonds, 6);
    const isChild = new Set(bonds.map((b) => `${b.p}-${b.c}`));
    for (const path of paths) {
      for (let i = 0; i + 1 < path.length; i++) {
        expect(isChild.has(`${path[i]}-${path[i + 1]}`)).toBe(true);
      }
    }
  });
});
