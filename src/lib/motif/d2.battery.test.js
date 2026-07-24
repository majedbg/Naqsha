// D2 — WHOLE-DIFF INTEGRATION HONESTY BATTERY (issue #79).
//
// This file is NOT a per-slice re-review (each phase was independently reviewed
// SOUND in its own slice). It pins the CROSS-CUTTING integration invariants that
// no single slice owned — the seams between chain → sequencer → placement — and
// the two "frozen-input" / "survivor-stable" contracts that only bite when the
// whole pipeline runs together. Pure JS: no p5/DOM/React.
//
// Coverage map to the D2 battery items (see docs/motif-chain-ORCHESTRATOR.md D2):
//   1. Determinism        — end-to-end twice ⇒ byte-identical (random + modifiers)
//   2. Survivor-stability — edit an UPSTREAM BLOCK, survivors of BOTH runs keep
//                           their slot + rotationRandomDelta (ADR-0005)
//   5. No input mutation  — deep-freeze the inputs to every pure entry point
//   6. Chain invariants   — terminal-sequence + C1 mutual-exclusivity integrated
// Items 3 (byte-identical legacy compile) and 4 (dual-emit per-slot parity) are
// owned by compileSelectionToChain.test.js / MotifPattern.test.js / export.d1
// and re-affirmed by chain.e2e.test.js; item 6's override-toggle half is owned by
// AnchorGhostOverlay.test.jsx. This file adds the pieces those don't.

import { describe, it, expect } from 'vitest';
import { runSelectionChain } from './chain.js';
import { dealSlots } from './sequencer.js';
import { compileSelectionToChain, resolveSelection } from './compileSelectionToChain.js';
import {
  addBlock,
  removeBlock,
  reorderChain,
  makeBlock,
  setSlot,
  togglePickedPath,
  hasSequence,
  sequenceIndex,
} from './chainEditor.js';
import {
  readChain,
  ensureChainForm,
  deepMergeBinding,
  applyPickedPathToggle,
} from './motifLayer.js';
import { capturePolylines } from './capturePolylines.js';
import { getSemanticAnchors } from './semanticAnchors.js';
import { gridWarpAnchorsCentered } from '../patterns/gridWarpAnchors.js';
import { stackWarpDisplacement } from '../fields/warp.js';
import { computeWarpFrame } from '../fields/warpFrame.js';
import { makeP5Random } from '../patterns/rng.js';
import { toSymmetryCount } from '../patterns/symmetryUtils.js';
import { ScalarField } from '../patterns/../fields/ScalarField.js';
import FlowField from '../patterns/FlowField.js';
import TopographicContours from '../patterns/TopographicContours.js';
import { RecordingContext } from '../patterns/drawingContext.js';

// ── fixtures ─────────────────────────────────────────────────────────────────
// Two-path anchor host: path 0 = ids p0_0..p0_9, path 1 = p1_0..p1_9. role
// 'edge', meta.pathIndex set, meta.closed false (open streamlines).
function mkAnchor(id, pathIndex, i) {
  return {
    id,
    role: 'edge',
    x: 100 + i * 40,
    y: 100 + pathIndex * 200,
    tangent: 0,
    normal: 0,
    s: i,
    meta: { pathIndex, closed: false },
  };
}
function twoPathHost(per = 10) {
  const out = [];
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < per; i++) out.push(mkAnchor(`p${p}_${i}`, p, i));
  }
  return out;
}

// A random-mode sequence with weighted slots + rotationRandom (exercises both the
// 'slot' and 'rot' hashRng channels). Random slot is a pure function of anchor.id.
const RANDOM_SEQUENCE = {
  type: 'sequence',
  mode: 'random',
  seed: 7,
  slots: [
    { glyphRef: 'flower', weight: 2, rotationRandom: { range: 30, spread: 'bell' } },
    { glyphRef: 'leaf', weight: 1, rotationRandom: { range: 15, spread: 'flat' } },
    { rest: true, weight: 1 },
  ],
};

// ── recursive deep-freeze (catches nested mutation the shallow freeze misses) ──
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

// ═══════════════════════════════════════════════════════════════════════════
// ITEM 2 — SURVIVOR STABILITY (ADR-0005), at the INTEGRATION level.
// Edit an UPSTREAM SELECTION BLOCK (everyN 2→3) so the survivor SET changes.
// Every anchor that survives BOTH edits must keep its random slot AND its
// rotationRandomDelta — because both are keyed on `hashRng(seed, anchor.id, …)`,
// independent of which other anchors survived. This is the claim the per-slice
// sequencer test could NOT make (it fed dealSlots different arrays directly);
// here the difference is produced by a real chain edit upstream of the deal.
// ═══════════════════════════════════════════════════════════════════════════
describe('D2 item 2 — survivor-stability across an upstream BLOCK edit', () => {
  const anchors = twoPathHost(10);
  // route → everyN(continuous) → density(hash) → sequence(random). density hash
  // is per-anchor-stable, so only the everyN edit moves the survivor set.
  const chainFor = (n) => [
    { type: 'route', roles: ['edge'], pathScope: 'all' },
    { type: 'everyN', n, offset: 0, continuous: false },
    { type: 'density', density: 0.8, seed: 3, rngMode: 'hash' },
    RANDOM_SEQUENCE,
  ];

  function dealFor(n) {
    const { survivors, sequence } = { ...runSelectionChain(anchors, chainFor(n)) };
    const assigns = dealSlots(survivors, sequence);
    const byId = new Map();
    survivors.forEach((s, i) => byId.set(s.id, assigns[i]));
    return byId;
  }

  it('anchors surviving BOTH everyN=2 and everyN=3 keep slotIndex + rotationRandomDelta', () => {
    const d2 = dealFor(2);
    const d3 = dealFor(3);
    const intersection = [...d2.keys()].filter((id) => d3.has(id));
    // Non-vacuous: per path, everyN=2 keeps idx 0,2,4,6,8; everyN=3 keeps 0,3,6,9;
    // positional intersection idx {0,6} × 2 paths, minus density drops. Assert we
    // actually have survivors in common so the loop isn't empty theater.
    expect(intersection.length).toBeGreaterThan(0);
    for (const id of intersection) {
      expect(d3.get(id).slotIndex, `slot for ${id}`).toBe(d2.get(id).slotIndex);
      expect(d3.get(id).rotationRandomDelta, `rot for ${id}`).toBe(
        d2.get(id).rotationRandomDelta,
      );
    }
  });

  it('MUTATION GUARD: keying the random slot off survivor INDEX would break the above', () => {
    // Prove the intersection anchors land at DIFFERENT survivor indices between
    // the two edits — so an index-keyed deal (the wrong impl) WOULD diverge, i.e.
    // the stability test has real teeth.
    const surv2 = runSelectionChain(anchors, chainFor(2)).survivors.map((a) => a.id);
    const surv3 = runSelectionChain(anchors, chainFor(3)).survivors.map((a) => a.id);
    const shared = surv2.filter((id) => surv3.includes(id));
    const movedIndex = shared.some((id) => surv2.indexOf(id) !== surv3.indexOf(id));
    expect(movedIndex).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ITEM 1 — DETERMINISM end-to-end (random mode + modifiers). The cycle-mode
// twice-run is pinned in chain.e2e.test.js; this adds the RANDOM branch (both
// hashRng channels) so a nondeterministic slot/rotation draw would surface.
// ═══════════════════════════════════════════════════════════════════════════
describe('D2 item 1 — determinism (random deal + rotationRandom, two full runs)', () => {
  const anchors = twoPathHost(12);
  const chain = [
    { type: 'route', roles: ['edge'], pathScope: 'all' },
    { type: 'skip', mask: [false, false, true], continuous: false },
    RANDOM_SEQUENCE,
  ];
  const oncePipeline = () => {
    const { survivors, sequence } = runSelectionChain(anchors, chain);
    return dealSlots(survivors, sequence).map((a) => ({
      slotIndex: a.slotIndex,
      glyphRef: a.glyphRef,
      rest: a.rest,
      rotationRandomDelta: a.rotationRandomDelta,
    }));
  };
  it('same seed+inputs ⇒ byte-identical assignment stream', () => {
    expect(oncePipeline()).toEqual(oncePipeline());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ITEM 5 — NO INPUT MUTATION. Deep-freeze the inputs to every pure entry point;
// a mutating write throws in ESM strict mode, so a green run PROVES purity over
// nested structures (chain[i].pickedPaths, slots, meta) a shallow freeze misses.
// ═══════════════════════════════════════════════════════════════════════════
describe('D2 item 5 — pure engine never mutates frozen inputs', () => {
  it('runSelectionChain(anchors, chain, opts)', () => {
    const anchors = deepFreeze(twoPathHost(6));
    const chain = deepFreeze([
      { type: 'route', roles: ['edge'], pathScope: 'picked', pickedPaths: [0] },
      { type: 'everyN', n: 2, continuous: false },
      { type: 'density', density: 0.5, seed: 1, rngMode: 'hash' },
      { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'a' }] },
    ]);
    const opts = deepFreeze({ canvasW: 800, canvasH: 600, overrides: { include: ['p0_1'], exclude: ['p1_2'] } });
    expect(() => runSelectionChain(anchors, chain, opts)).not.toThrow();
  });

  it('dealSlots(survivors, sequence)', () => {
    const survivors = deepFreeze(twoPathHost(6));
    const sequence = deepFreeze(JSON.parse(JSON.stringify(RANDOM_SEQUENCE)));
    expect(() => dealSlots(survivors, sequence)).not.toThrow();
  });

  it('compileSelectionToChain + resolveSelection', () => {
    const legacy = deepFreeze({ roles: ['edge'], rate: { n: 2, offset: 1 }, skip: [false, true], density: 0.7, seed: 4, overrides: { include: ['x'], exclude: [] } });
    expect(() => compileSelectionToChain(legacy)).not.toThrow();
    const anchors = deepFreeze(twoPathHost(6));
    const binding = deepFreeze({ selection: JSON.parse(JSON.stringify(legacy)) });
    expect(() => resolveSelection(binding, anchors, { canvasW: 800, canvasH: 600 })).not.toThrow();
  });

  it('chainEditor ops (add/remove/reorder/setSlot/togglePickedPath)', () => {
    const chain = deepFreeze([
      { type: 'route', roles: null, pathScope: 'all', pickedPaths: [1] },
      { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'a' }, { rest: true }] },
    ]);
    expect(() => addBlock(chain, makeBlock('everyN'))).not.toThrow();
    expect(() => removeBlock(chain, 0)).not.toThrow();
    expect(() => reorderChain(chain, 0, 1)).not.toThrow();
    expect(() => setSlot(chain, 1, 0, { sizeScale: 2 })).not.toThrow();
    expect(() => togglePickedPath(chain, 0, 2)).not.toThrow();
  });

  it('motifLayer readChain/ensureChainForm/deepMergeBinding/applyPickedPathToggle', () => {
    const legacyBinding = deepFreeze({ selection: { roles: ['edge'], rate: { n: 2 } }, placement: { sizing: { mode: 'fixed', size: 5 } } });
    expect(() => readChain(legacyBinding)).not.toThrow();
    expect(() => ensureChainForm(legacyBinding)).not.toThrow();
    const chainBinding = deepFreeze({ chain: [{ type: 'route', roles: null, pathScope: 'all' }], overrides: { include: [], exclude: [] }, placement: {} });
    expect(() => readChain(chainBinding)).not.toThrow();
    expect(() => ensureChainForm(chainBinding)).not.toThrow();
    expect(() => deepMergeBinding(chainBinding, { overrides: { exclude: ['z'] } })).not.toThrow();
    expect(() => applyPickedPathToggle(chainBinding, 0, 3)).not.toThrow();
  });

  it('capturePolylines(calls)', () => {
    const calls = deepFreeze([
      { op: 'push', args: [] },
      { op: 'translate', args: [10, 20] },
      { op: 'rotate', args: [0.5] },
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [0, 0] },
      { op: 'vertex', args: [5, 5] },
      { op: 'endShape', args: [null] },
      { op: 'pop', args: [] },
    ]);
    expect(() => capturePolylines(calls)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ITEM 6 — CHAIN INVARIANTS integrated: terminal-sequence (at-most-one, last)
// holds through add/remove/reorder; C1 mutual-exclusivity (chain-form never
// carries `selection`) holds through create/edit/persist/override toggle.
// ═══════════════════════════════════════════════════════════════════════════
describe('D2 item 6 — sequence-terminal invariant through add/remove/reorder', () => {
  const base = () => [
    { type: 'route', roles: null, pathScope: 'all' },
    { type: 'everyN', n: 2 },
    { type: 'sequence', mode: 'cycle', slots: [] },
  ];
  it('a second sequence is rejected (same ref, no add)', () => {
    const c = base();
    expect(addBlock(c, makeBlock('sequence'))).toBe(c);
  });
  it('a new selection block inserts BEFORE the sequence (never after)', () => {
    const next = addBlock(base(), makeBlock('density'));
    expect(sequenceIndex(next)).toBe(next.length - 1); // sequence still last
    expect(next[next.length - 2].type).toBe('density'); // new block landed just before it
  });
  it('reorder that would push a filter below the sequence is rejected (same ref)', () => {
    const c = base();
    // move the sequence (idx 2) up to idx 0 ⇒ would leave filters after it ⇒ reject
    expect(reorderChain(c, 2, 0)).toBe(c);
    expect(hasSequence(c) && sequenceIndex(c) === c.length - 1).toBe(true);
  });
  it('removing then re-adding a sequence keeps at-most-one', () => {
    const removed = removeBlock(base(), 2);
    expect(hasSequence(removed)).toBe(false);
    const readded = addBlock(removed, makeBlock('sequence'));
    expect(sequenceIndex(readded)).toBe(readded.length - 1);
    expect(readded.filter((b) => b.type === 'sequence')).toHaveLength(1);
  });
});

describe('D2 item 6 — C1 mutual-exclusivity: chain-form NEVER carries selection', () => {
  const legacy = { selection: { roles: ['edge'], rate: { n: 2 }, overrides: { include: ['a'], exclude: [] } }, placement: { sizing: { mode: 'fixed', size: 5 } } };

  it('ensureChainForm drops selection and carries overrides top-level (create/first-edit)', () => {
    const cf = ensureChainForm(legacy);
    expect(Array.isArray(cf.chain)).toBe(true);
    expect('selection' in cf).toBe(false);
    expect(cf.overrides).toEqual({ include: ['a'], exclude: [] });
  });

  it('deepMergeBinding onto a chain-form base never resurrects selection (the C2 trap)', () => {
    const cf = ensureChainForm(legacy);
    const edited = deepMergeBinding(cf, { chain: addBlock(cf.chain, makeBlock('density')) });
    expect('selection' in edited).toBe(false);
    expect(Array.isArray(edited.chain)).toBe(true);
  });

  it('applyPickedPathToggle migrates a LEGACY binding→chain-form in one step, no selection key', () => {
    // Pass the RAW legacy binding (compileSelectionToChain emits route as block 0);
    // applyPickedPathToggle must ensureChainForm INTERNALLY, drop `selection`, and
    // land the pick — the real legacy→chain migration path, not a pre-migrated one.
    const toggled = applyPickedPathToggle(legacy, 0, 2);
    expect('selection' in toggled).toBe(false);
    expect(Array.isArray(toggled.chain)).toBe(true);
    expect(readChain(toggled)[0].pickedPaths).toContain(2);
  });

  it('a chain-form binding survives a JSON persist round-trip byte-identically (no selection)', () => {
    const cf = ensureChainForm(legacy);
    const round = JSON.parse(JSON.stringify(cf));
    expect(round).toEqual(cf);
    expect('selection' in round).toBe(false);
  });
});

// ── D2 warp invariant — sole warp primitive across warp-aware extractors ──────
// The D2 invariant ("stackWarpDisplacement is the ONE warp-displacement primitive
// both renderer and extractor call — no parallel warp math anywhere") is a cross-
// cutting integration invariant no single slice owns: it binds the renderer, the
// grid warp extractor (#117), and future warp-aware extractors. This battery re-
// affirms it at the integration level for the grid extractor; the per-slice exact
// proof lives in patterns/__tests__/gridWarpAnchors.test.js. A grid CELL is the
// free-point role placed by a DIRECT stackWarpDisplacement call, so recomputing
// the primitive independently and matching the anchor byte-for-byte proves no
// extra/parallel warp math crept into the extractor.
describe('D2 — warp displacement is the sole primitive (grid warp anchors)', () => {
  it('a warped grid cell anchor’s displacement equals stackWarpDisplacement exactly', () => {
    const CW = 800;
    const CH = 600;
    const field = ScalarField.fromFunction((u, v) => Math.sin(u * 3) * Math.cos(v * 3), { nx: 129, ny: 129 });
    const params = {
      cols: 4, rows: 3, spacing: 60, jitter: 0, margin: 20,
      symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
      drawHorizontal: 1, drawVertical: 1, warpNodes: 6,
      modulation: { channel: 'warp', field, amount: 2 },
    };
    const anchors = gridWarpAnchorsCentered(params, makeP5Random(0), { canvasW: CW, canvasH: CH });
    const cells = anchors.filter((a) => a.role === 'cell');
    expect(cells.length).toBeGreaterThan(0);
    const sources = params.modulation.sources ?? [params.modulation];

    // Reconstruct the straight cell-centre lattice (jitter=0) and independently
    // apply the ONE primitive; the extractor's cell must match byte-for-byte.
    const spacing = params.spacing;
    const totalW = params.cols * spacing;
    const totalH = params.rows * spacing;
    const xs = [];
    for (let i = 0; i <= params.cols; i++) xs.push(-totalW / 2 + (i / params.cols) * totalW);
    const ys = [];
    for (let j = 0; j <= params.rows; j++) ys.push(-totalH / 2 + (j / params.rows) * totalH);
    for (const cell of cells) {
      const { col: i, row: j } = cell.meta;
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      const u = (cx + CW / 2) / CW;
      const v = (cy + CH / 2) / CH;
      const { dx, dy } = stackWarpDisplacement(sources, u, v);
      expect(cell.x).toBe(cx + dx);
      expect(cell.y).toBe(cy + dy);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D2 WARP BATTERY — the CROSS-PIPELINE harness for the two locked global
// invariants (PRD #109), extended to every warp-aware anchor path once both math
// extractors (#117 grid, #118 recursive) and the capture-probe injection (#110
// flowfield/topographic) exist. Each per-slice suite already carries its own
// exact-to-paint + no-warp + equivariance proofs; these blocks are the SINGLE
// place that re-affirms — one case per path per invariant — that no extractor has
// drifted from the renderer or from the invariant. They assert EXTERNAL behaviour
// (where anchors land, the sole-primitive diff, byte-exact equivariance), never
// internal call shapes.
//
//   INVARIANT 1 — D2 single-primitive: all warp displacement flows through
//     `stackWarpDisplacement`; no parallel warp math on any path.
//   INVARIANT 2 — symmetry × warp ordering (#107): byte-exact rotation-
//     equivariance anchor(k) == Rot_θk(anchor(0)) for the MATH paths (grid,
//     recursive) under N≥2 + non-zero startAngle; for the CAPTURE paths
//     (flowfield, topographic) equivariance is STRUCTURAL (geometry is captured
//     already-rotated) — so we assert the #103 frame criterion, NOT a rotation
//     test.
// ═══════════════════════════════════════════════════════════════════════════

const D2W = 800; // shared warp canvas dims for the cross-pipeline cases
const D2H = 600;

// A smooth guide with a real gradient in both axes (bends every host noticeably).
const d2Field = () =>
  ScalarField.fromFunction((u, v) => Math.sin(u * 3) * Math.cos(v * 3), { nx: 129, ny: 129 });

// ── GRID · INVARIANT 2 — byte-exact rotation-equivariance ────────────────────
// The grid warp extractor reconstructs its base anchors ONCE in the un-rotated
// local frame (warp is pre-symmetry); `push` is the sole per-copy transform, so
// each copy k must be Rot_θk of the single-copy master, byte-for-byte, in position
// AND frame+θ. Kept in the realistic amount≈1 regime where every crossing exists
// (#117: extreme warp can separate boundary curves — not an equivariance concern).
describe('D2 warp · grid — byte-exact rotation-equivariance (invariant 2, #107)', () => {
  const N = 4;
  const startAngle = 27; // non-zero, degrees
  const seed = 321;
  const base = {
    cols: 3, rows: 2, spacing: 55, jitter: 4, margin: 18,
    offsetX: 0, offsetY: 0, drawHorizontal: 1, drawVertical: 1, warpNodes: 6,
    modulation: { channel: 'warp', field: d2Field(), amount: 1 },
  };
  it('anchor(k) == Rot_θk(anchor(0)) across all roles (position AND frame)', () => {
    const ref = gridWarpAnchorsCentered(
      { ...base, symmetry: 1, startAngle: 0 }, makeP5Random(seed), { canvasW: D2W, canvasH: D2H },
    );
    const sym = gridWarpAnchorsCentered(
      { ...base, symmetry: N, startAngle }, makeP5Random(seed), { canvasW: D2W, canvasH: D2H },
    );
    const n = toSymmetryCount(N);
    expect(sym).toHaveLength(n * ref.length);
    const startRad = (startAngle * Math.PI) / 180;
    for (let k = 0; k < n; k++) {
      const theta = (2 * Math.PI * k) / n + startRad;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const copyK = sym.filter((x) => x.meta.copy === k);
      expect(copyK).toHaveLength(ref.length);
      for (let idx = 0; idx < ref.length; idx++) {
        const r = ref[idx];
        const c = copyK[idx];
        expect(c.role).toBe(r.role);
        expect(c.x).toBe(r.x * cos - r.y * sin);
        expect(c.y).toBe(r.x * sin + r.y * cos);
        expect(c.tangent).toBe(r.tangent + theta);
        expect(c.normal).toBe(r.normal + theta);
      }
    }
  });
});

// ── RECURSIVE · INVARIANT 1 — D2 single warp primitive ───────────────────────
// A recursive CELL/TIP is a FREE POINT placed by a DIRECT stackWarpDisplacement
// call (position) + computeWarpFrame (which finite-differences the SAME primitive,
// no parallel math). Recomputing the primitive independently at each ideal (no-
// warp) centre and matching the warped anchor proves no extra warp math crept in —
// the recursive analogue of the grid-cell D2 case above. Recursive is seedless.
describe('D2 warp · recursive — free-point displacement is solely stackWarpDisplacement (invariant 1)', () => {
  const CX = D2W / 2;
  const CY = D2H / 2;
  const geom = {
    shape: 'hexagon', depth: 3, rotationPerLevel: 15, scaleFactor: 0.7,
    scaleNonLinearity: 0, startScale: 70, symmetry: 1, startAngle: 0,
    offsetX: 0, offsetY: 0,
  };
  it('every warped cell/tip centre equals ideal + stackWarpDisplacement, frame = computeWarpFrame', () => {
    const modulation = { channel: 'warp', field: d2Field(), amount: 2 };
    const sources = [modulation];
    const warped = getSemanticAnchors('recursive', { ...geom, warpNodes: 4, modulation }, D2W, D2H);
    const ideal = getSemanticAnchors('recursive', geom, D2W, D2H)
      .filter((a) => a.role === 'cell' || a.role === 'tip');
    expect(ideal.length).toBeGreaterThan(0);
    const byId = new Map(warped.map((a) => [a.id, a]));
    for (const c of ideal) {
      const lx = c.x - CX;
      const ly = c.y - CY;
      const u = (lx + D2W / 2) / D2W;
      const v = (ly + D2H / 2) / D2H;
      const { dx, dy } = stackWarpDisplacement(sources, u, v);
      const frame = computeWarpFrame(sources, u, v, { W: D2W, H: D2H });
      const w = byId.get(c.id);
      expect(w).toBeTruthy();
      expect(w.x).toBeCloseTo(c.x + dx, 9);
      expect(w.y).toBeCloseTo(c.y + dy, 9);
      expect(w.tangent).toBeCloseTo(frame.tangent, 9);
      expect(w.normal).toBeCloseTo(frame.normal, 9);
    }
  });
});

// ── RECURSIVE · INVARIANT 2 — byte-exact rotation-equivariance ───────────────
// Under warp the recursive extractor reconstructs base anchors ONCE (pre-symmetry)
// then rides the SAME rigid `push` rotation into every sector. offsetX/Y = −W/2 ⇒
// ox = oy = 0 so world coords ARE the centred rotation, letting us reconstruct
// Rot_θk(master) operand-for-operand. Position AND frame+θ, byte-exact.
describe('D2 warp · recursive — byte-exact rotation-equivariance (invariant 2, #107)', () => {
  const W2 = 800;
  const H2 = 800;
  const geom = {
    shape: 'hexagon', depth: 3, rotationPerLevel: 15, scaleFactor: 0.7,
    startScale: 70, offsetX: -W2 / 2, offsetY: -H2 / 2, warpNodes: 4,
  };
  const modulation = { channel: 'warp', field: d2Field(), amount: 2 };
  const n = 3;
  const startDeg = 40;
  it('anchor(k) == Rot_θk(anchor(0)) for position AND frame, under N≥2 + non-zero startAngle', () => {
    const startRad = (startDeg * Math.PI) / 180;
    const master = getSemanticAnchors('recursive', { ...geom, modulation, symmetry: 1, startAngle: 0 }, W2, H2);
    const full = getSemanticAnchors('recursive', { ...geom, modulation, symmetry: n, startAngle: startDeg }, W2, H2);
    expect(full.length).toBe(master.length * n);
    const masterById = new Map(master.map((m) => [m.id, m]));
    for (const a of full) {
      const k = a.meta.copy;
      const theta = (2 * Math.PI * k) / n + startRad;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const baseId = a.id.slice(0, a.id.lastIndexOf(':'));
      const m = masterById.get(baseId);
      expect(m).toBeDefined();
      expect(a.x).toBe(m.x * cos - m.y * sin);
      expect(a.y).toBe(m.x * sin + m.y * cos);
      expect(a.tangent).toBe(m.tangent + theta);
      expect(a.normal).toBe(m.normal + theta);
      expect(a.s).toBe(m.s);
    }
  });
});

// ── CAPTURE HOSTS · flowfield + topographic — structural #103 criterion + D2 ──
// These hosts are on the CAPTURE pipeline: anchors are SAMPLED from the drawn
// geometry, so equivariance is STRUCTURAL (the geometry is captured already-
// rotated) — a rotation test would be redundant. What binds them to the two
// invariants is the #103 frame criterion: warp is pure + RNG-free + applied AFTER
// all noise/random consumption at UNWARPED coords, so the base geometry is byte-
// identical with and without warp, and the ONLY difference is the sole primitive's
// displacement. We render each host to a RecordingContext TWICE at one seed — with
// a warp modulation and without — fold BOTH paint streams through the real
// `capturePolylines`, and assert per captured vertex that
//   warped == unwarped + stackWarpDisplacement(sources, u, v)
// at the unwarped vertex's (u,v). This has teeth: it fails if the host grows any
// parallel warp math, if the base geometry shifts under warp (a noise-ordering
// regression), or if the probe stops injecting warp. The heavy end-to-end
// useCanvas render lives in useCanvas.warpCapture.test.jsx; this is the pure-JS
// cross-pipeline re-affirmation. symmetry='none' / offset 0 / startAngle 0 ⇒ the
// captured absolute vertex is LOCAL + (W/2, H/2), so the host's unit-domain
// u = (local.x + W/2)/W equals abs.x / W.
const FLOW_PARAMS = {
  particleCount: 30, stepLength: 6, noiseScale: 0.01, curlStrength: 90,
  patternScale: 1, strokeWeight: 1, symmetry: 'none', startAngle: 0, offsetX: 0, offsetY: 0,
};
const TOPO_PARAMS = {
  levels: 6, noiseScale: 2.5, octaves: 2, warp: 0, levelBias: 0, resolution: 48,
  strokeWeight: 0.6, symmetry: 'none', startAngle: 0, offsetX: 0, offsetY: 0,
};

function captureHost(PatternClass, params, modulation, seed = 5) {
  const pattern = new PatternClass();
  const ctx = new RecordingContext({ seed });
  const p = modulation ? { ...params, modulation } : { ...params };
  pattern.generateWithContext(ctx, seed, p, D2W, D2H, '#000000', 100);
  return capturePolylines(ctx.calls);
}

describe.each([
  ['flowfield', FlowField, FLOW_PARAMS],
  ['topographic', TopographicContours, TOPO_PARAMS],
])('D2 warp · capture host %s — structural #103 criterion + sole primitive (invariants 1 & 2)', (name, PatternClass, params) => {
  it('warped capture == unwarped capture + stackWarpDisplacement, per vertex (base byte-identical)', () => {
    const modulation = { channel: 'warp', field: d2Field(), amount: 3 };
    const sources = [modulation];
    const base = captureHost(PatternClass, params, null);
    const warped = captureHost(PatternClass, params, modulation);

    // Non-vacuous: the host must actually emit captured geometry.
    expect(base.length).toBeGreaterThan(0);
    // #103 base byte-identity: warp is applied AFTER noise/random, so the polyline
    // STRUCTURE (path count + per-path vertex count) is unchanged by the warp.
    expect(warped.length).toBe(base.length);

    let maxDisp = 0;
    for (let pi = 0; pi < base.length; pi++) {
      const bp = base[pi].points;
      const wp = warped[pi].points;
      expect(wp.length).toBe(bp.length);
      expect(warped[pi].closed).toBe(base[pi].closed);
      for (let vi = 0; vi < bp.length; vi++) {
        const u = bp[vi].x / D2W; // abs.x/W == host's (local.x + W/2)/W
        const v = bp[vi].y / D2H;
        const { dx, dy } = stackWarpDisplacement(sources, u, v);
        expect(wp[vi].x).toBeCloseTo(bp[vi].x + dx, 9);
        expect(wp[vi].y).toBeCloseTo(bp[vi].y + dy, 9);
        maxDisp = Math.max(maxDisp, Math.hypot(dx, dy));
      }
    }
    // The warp field genuinely moved the geometry (else the equality is empty
    // theater — a zero field would pass trivially).
    expect(maxDisp).toBeGreaterThan(1);
  });

  it('a non-warp (density) modulation is a geometric no-op — captured geometry byte-identical', () => {
    // The hosts branch ONLY on channel==='warp'; a density guide must leave the
    // captured geometry byte-for-byte unchanged (the #103 "warp-free" half).
    const density = { channel: 'density', field: d2Field(), amount: 3 };
    const base = captureHost(PatternClass, params, null);
    const withDensity = captureHost(PatternClass, params, density);
    expect(withDensity).toEqual(base);
  });
});
