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
