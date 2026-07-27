// overrides.js — the per-anchor override RECORD model (#136).
//
// The canonical shape is now `{records: [{ref, hidden?, scale?, angle?}],
// tolerance?}`: ONE record per ref that rides resolveRef (attach / legacy `:0`
// fallback / spatial rebind / orphan) AS A UNIT. `hidden:false` is the legacy
// include (a force-show pin), `hidden:true` the legacy exclude (force-hide),
// hidden ABSENT means "rules decide" — a record can carry scale/angle only and
// never touch survivorship. Legacy `{include, exclude}` is migrate-on-read via
// `normalizeOverrides`, and MUST stay byte-identical through `applyOverrides`
// (placementEngine.test.js / chain.test.js pin that contract unchanged).
//
// `records` is an ARRAY deliberately: deepMergeBinding deep-merges plain
// objects (a keyed map would resurrect deleted records on merge) but REPLACES
// arrays wholesale — the existing write contract. Insertion order is the
// deterministic tie-break (first record to resolve to an anchor claims it).

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TOLERANCE,
  refKey,
  normalizeOverrides,
  applyOverrides,
  resolveOverrideRecords,
} from './overrides.js';

// ── fixtures (mirrors placementEngine.test.js) ───────────────────────────────
const mkAnchor = (role, x, y, id) => ({
  id,
  role,
  x,
  y,
  tangent: 0,
  normal: Math.PI / 2,
  s: 0,
  meta: {},
});

// a0..a{n-1} on a horizontal line, 10px apart, role 'edge'.
const edgeRow = (n) => Array.from({ length: n }, (_, i) => mkAnchor('edge', i * 10, 0, `a${i}`));

const indexById = (list) => new Map(list.map((a) => [a.id, a]));
const sorted = (set) => [...set].sort();

// ── refKey ───────────────────────────────────────────────────────────────────
describe('refKey', () => {
  it('string ref → itself', () => {
    expect(refKey('a1')).toBe('a1');
  });

  it('object ref with id → the id (coords ignored)', () => {
    expect(refKey({ id: 'a1', x: 5, y: 5 })).toBe('a1');
  });

  it('coordinate ref → @x,y (role appended when present)', () => {
    expect(refKey({ x: 12, y: 34 })).toBe('@12,34');
    expect(refKey({ x: 12, y: 34, role: 'edge' })).toBe('@12,34,edge');
  });

  it('null / keyless refs → null', () => {
    expect(refKey(null)).toBeNull();
    expect(refKey(undefined)).toBeNull();
    expect(refKey({})).toBeNull();
    expect(refKey({ role: 'edge' })).toBeNull(); // role without coords is unusable
    expect(refKey({ x: 5 })).toBeNull(); // half a coordinate is unusable
  });
});

// ── normalizeOverrides ───────────────────────────────────────────────────────
describe('normalizeOverrides', () => {
  it('null/undefined input → undefined', () => {
    expect(normalizeOverrides(undefined)).toBeUndefined();
    expect(normalizeOverrides(null)).toBeUndefined();
  });

  it('legacy include/exclude migrate to records with hidden false/true, in order', () => {
    const out = normalizeOverrides({ include: ['a1', 'a3'], exclude: ['a2'] });
    expect(out).toEqual({
      records: [
        { ref: 'a1', hidden: false },
        { ref: 'a3', hidden: false },
        { ref: 'a2', hidden: true },
      ],
    });
  });

  it('a ref in BOTH legacy arrays collapses to ONE hidden:true record (exclude wins)', () => {
    const out = normalizeOverrides({ include: ['a2'], exclude: ['a2'] });
    expect(out.records).toEqual([{ ref: 'a2', hidden: true }]);
  });

  it('legacy object refs are preserved VERBATIM (same reference)', () => {
    const ref = { x: 12, y: 1 };
    const out = normalizeOverrides({ include: [ref] });
    expect(out.records[0].ref).toBe(ref);
  });

  it('tolerance is carried; empty legacy arrays → {records: []}', () => {
    expect(normalizeOverrides({ include: [], exclude: [], tolerance: 4 })).toEqual({
      records: [],
      tolerance: 4,
    });
    expect(normalizeOverrides({})).toEqual({ records: [] });
  });

  it('new shape passes through; dedup by refKey, FIRST occurrence wins', () => {
    const out = normalizeOverrides({
      records: [
        { ref: 'a1', hidden: false, scale: 2 },
        { ref: { id: 'a1' }, hidden: true }, // same refKey via ref.id — dropped
        { ref: 'a2', hidden: true },
      ],
      tolerance: 6,
    });
    expect(out.records).toEqual([
      { ref: 'a1', hidden: false, scale: 2 },
      { ref: 'a2', hidden: true },
    ]);
    expect(out.tolerance).toBe(6);
  });

  it('keyless refs are kept verbatim, never deduped against each other', () => {
    const r1 = { ref: { role: 'edge' }, hidden: true };
    const r2 = { ref: {}, hidden: false };
    const out = normalizeOverrides({ records: [r1, r2] });
    expect(out.records).toEqual([r1, r2]);
  });

  it('records-present input is authoritative — stray include/exclude keys are IGNORED', () => {
    const out = normalizeOverrides({
      records: [{ ref: 'a1', hidden: true }],
      include: ['a9'], // stale legacy leftovers must not resurrect
      exclude: ['a8'],
    });
    expect(out.records).toEqual([{ ref: 'a1', hidden: true }]);
  });

  it('never mutates its input (legacy AND new shape)', () => {
    const legacy = Object.freeze({
      include: Object.freeze(['a1']),
      exclude: Object.freeze(['a1', 'a2']),
      tolerance: 4,
    });
    expect(() => normalizeOverrides(legacy)).not.toThrow();

    const rec = Object.freeze({ ref: 'a1', hidden: false });
    const fresh = Object.freeze({ records: Object.freeze([rec, rec]) });
    expect(() => normalizeOverrides(fresh)).not.toThrow();
  });
});

// ── applyOverrides — NEW record shape ────────────────────────────────────────
describe('applyOverrides — record shape', () => {
  it('a pin (hidden:false) re-adds a rule-dropped anchor', () => {
    const list = edgeRow(4);
    const survivors = new Set(['a0', 'a2']); // a1 rule-dropped
    const orphans = applyOverrides(survivors, list, indexById(list), {
      records: [{ ref: 'a1', hidden: false }],
    });
    expect(sorted(survivors)).toEqual(['a0', 'a1', 'a2']);
    expect(orphans).toEqual([]);
  });

  it('a hide (hidden:true) removes a placed anchor', () => {
    const list = edgeRow(4);
    const survivors = new Set(['a0', 'a1', 'a2', 'a3']);
    applyOverrides(survivors, list, indexById(list), {
      records: [{ ref: 'a2', hidden: true }],
    });
    expect(sorted(survivors)).toEqual(['a0', 'a1', 'a3']);
  });

  it('hide WINS when a pin record and a hide record resolve to the same anchor', () => {
    const list = edgeRow(4); // a2 at x=20
    const survivors = new Set(['a0']);
    // Different refKeys (id vs coord) so both records survive normalize; both
    // resolve to a2 — pass 2 (hides) runs after pass 1 (pins) and wins.
    applyOverrides(survivors, list, indexById(list), {
      records: [
        { ref: 'a2', hidden: false },
        { ref: { x: 21, y: 0 }, hidden: true },
      ],
      tolerance: 8,
    });
    expect(sorted(survivors)).toEqual(['a0']);
  });

  it('a scale/angle-only record (hidden absent) never touches survivorship and is never an orphan', () => {
    const list = edgeRow(3);
    const survivors = new Set(['a0', 'a1']);
    const orphans = applyOverrides(survivors, list, indexById(list), {
      records: [
        { ref: 'a2', scale: 2 }, // resolved but no hidden → a2 must NOT be added
        { ref: 'nope', angle: 90 }, // unresolved but no hidden → NOT an orphan
      ],
    });
    expect(sorted(survivors)).toEqual(['a0', 'a1']);
    expect(orphans).toEqual([]);
  });

  it('an unresolved pin pushes its ref VERBATIM to orphans', () => {
    const list = edgeRow(3);
    const survivors = new Set(['a0']);
    const ref = { x: 999, y: 999 };
    const orphans = applyOverrides(survivors, list, indexById(list), {
      records: [{ ref, hidden: false }],
      tolerance: 8,
    });
    expect(orphans).toEqual([ref]);
    expect(orphans[0]).toBe(ref); // same reference, not a copy
    expect(sorted(survivors)).toEqual(['a0']);
  });

  it('a {x,y,role} ref spatially rebinds ≤ tolerance as a unit (role-filtered)', () => {
    const list = [
      mkAnchor('tip', 10, 0, 't0'), // nearest overall
      mkAnchor('edge', 12, 0, 'e0'), // farther but role matches
    ];
    const survivors = new Set();
    applyOverrides(survivors, list, indexById(list), {
      records: [{ ref: { x: 10, y: 0, role: 'edge' }, hidden: false }],
      tolerance: 8,
    });
    expect(sorted(survivors)).toEqual(['e0']);
  });

  it('legacy `${id}:0` base-copy fallback works through a record ref', () => {
    const list = [
      mkAnchor('crossing', 0, 0, 'crossing:1:1:0'),
      mkAnchor('crossing', 100, 100, 'crossing:1:1:1'),
    ];
    const survivors = new Set();
    const orphans = applyOverrides(survivors, list, indexById(list), {
      records: [{ ref: 'crossing:1:1', hidden: false }],
    });
    expect(sorted(survivors)).toEqual(['crossing:1:1:0']);
    expect(orphans).toEqual([]);
  });
});

// ── applyOverrides — LEGACY shape regression (mirrors placementEngine tests) ──
describe('applyOverrides — legacy shape (byte-identical regression)', () => {
  it('include re-adds a dropped anchor', () => {
    const list = edgeRow(6);
    const survivors = new Set(['a0', 'a2', 'a4']); // rate n:2 survivors
    const orphans = applyOverrides(survivors, list, indexById(list), { include: ['a1'] });
    expect(sorted(survivors)).toEqual(['a0', 'a1', 'a2', 'a4']);
    expect(orphans).toEqual([]);
  });

  it('exclude wins when include and exclude target the same anchor', () => {
    const list = edgeRow(4);
    const survivors = new Set(['a0', 'a1', 'a3']);
    applyOverrides(survivors, list, indexById(list), {
      include: ['a2'],
      exclude: ['a2'],
    });
    expect(sorted(survivors)).toEqual(['a0', 'a1', 'a3']);
  });

  it('out-of-tolerance include becomes a VERBATIM orphan', () => {
    const list = edgeRow(3);
    const survivors = new Set(['a0', 'a1', 'a2']);
    const ref = { x: 100, y: 100 };
    const orphans = applyOverrides(survivors, list, indexById(list), {
      include: [ref],
      tolerance: 8,
    });
    expect(sorted(survivors)).toEqual(['a0', 'a1', 'a2']);
    expect(orphans).toEqual([ref]);
    expect(orphans[0]).toBe(ref);
  });
});

// ── resolveOverrideRecords — the next ticket's resolution seam ───────────────
describe('resolveOverrideRecords', () => {
  it('maps resolved records by ANCHOR id (spatial rebind included)', () => {
    const list = edgeRow(4); // a2 at x=20
    const rec1 = { ref: 'a1', scale: 2 };
    const rec2 = { ref: { x: 21, y: 0 }, hidden: true };
    const { byAnchorId, orphans } = resolveOverrideRecords(list, indexById(list), {
      records: [rec1, rec2],
      tolerance: 8,
    });
    expect(byAnchorId.get('a1')).toBe(rec1);
    expect(byAnchorId.get('a2')).toBe(rec2);
    expect(byAnchorId.size).toBe(2);
    expect(orphans).toEqual([]);
  });

  it('FIRST record (insertion order) to resolve to an anchor claims it', () => {
    const list = edgeRow(3); // a1 at x=10
    const first = { ref: 'a1', scale: 2 };
    const second = { ref: { x: 9, y: 0 }, angle: 45 }; // rebinds to a1 too
    const { byAnchorId, orphans } = resolveOverrideRecords(list, indexById(list), {
      records: [first, second],
      tolerance: 8,
    });
    expect(byAnchorId.size).toBe(1);
    expect(byAnchorId.get('a1')).toBe(first);
    // the losing claimant has no hidden:false → not an orphan either
    expect(orphans).toEqual([]);
  });

  it('legacy-shape input yields synthesized records', () => {
    const list = edgeRow(4);
    const { byAnchorId } = resolveOverrideRecords(list, indexById(list), {
      include: ['a1'],
      exclude: ['a2'],
    });
    expect(byAnchorId.get('a1')).toEqual({ ref: 'a1', hidden: false });
    expect(byAnchorId.get('a2')).toEqual({ ref: 'a2', hidden: true });
  });

  it('orphans = refs of unresolved PINS only (hidden:false), verbatim', () => {
    const list = edgeRow(2);
    const pinRef = { x: 500, y: 500 };
    const { byAnchorId, orphans } = resolveOverrideRecords(list, indexById(list), {
      records: [
        { ref: pinRef, hidden: false }, // unresolved pin → orphan
        { ref: 'zz', hidden: true }, // unresolved hide → silently ignored
        { ref: 'zzz', scale: 3 }, // unresolved passive record → ignored
      ],
      tolerance: 8,
    });
    expect(byAnchorId.size).toBe(0);
    expect(orphans).toEqual([pinRef]);
    expect(orphans[0]).toBe(pinRef);
  });

  it('undefined overrides → empty map, no orphans; default tolerance applies otherwise', () => {
    const list = edgeRow(2);
    const empty = resolveOverrideRecords(list, indexById(list), undefined);
    expect(empty.byAnchorId.size).toBe(0);
    expect(empty.orphans).toEqual([]);

    // No explicit tolerance → DEFAULT_TOLERANCE (8) governs the rebind.
    const near = { ref: { x: 10 + DEFAULT_TOLERANCE, y: 0 }, hidden: false }; // dist = 8 ≤ 8
    const { byAnchorId } = resolveOverrideRecords(list, indexById(list), { records: [near] });
    expect(byAnchorId.has('a1')).toBe(true);
  });
});
