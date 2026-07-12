import { describe, it, expect } from 'vitest';
import {
  MOTIF_TYPE,
  isMotifLayer,
  createMotifParams,
  motifHostId,
  motifAutoName,
  deepMergeBinding,
  readChain,
  ensureChainForm,
} from './motifLayer';
import { compileSelectionToChain, resolveSelection } from './compileSelectionToChain';

// motifLayer.js — schema helpers for the motif layer flat model (mirrors
// useLayers.js createLayer conventions §3 of docs/motif-adorn-arch-brief.md).
// A motif layer is a normal flat layer whose type/patternType is 'motif' and
// whose params carry {glyphRef, hostLayerId, binding, anchorMode, edgeOpts,
// source}. No cascade/cleanup logic lives here — dangling references are
// tolerated and only resolved (or dropped) at adornGraph derivation time.

describe('MOTIF_TYPE', () => {
  it('is the string "motif"', () => {
    expect(MOTIF_TYPE).toBe('motif');
  });
});

describe('isMotifLayer', () => {
  it('is true when layer.type === "motif"', () => {
    expect(isMotifLayer({ type: 'motif' })).toBe(true);
  });

  it('is true when layer.patternType === "motif"', () => {
    expect(isMotifLayer({ patternType: 'motif' })).toBe(true);
  });

  it('is true when BOTH type and patternType are "motif"', () => {
    expect(isMotifLayer({ type: 'motif', patternType: 'motif' })).toBe(true);
  });

  it('is false for a normal pattern layer', () => {
    expect(isMotifLayer({ patternType: 'voronoi' })).toBe(false);
  });

  it('is false for import/text layers', () => {
    expect(isMotifLayer({ type: 'import', patternType: 'import' })).toBe(false);
    expect(isMotifLayer({ type: 'text', patternType: 'text' })).toBe(false);
  });

  it('tolerates null/undefined/empty input without throwing', () => {
    expect(isMotifLayer(null)).toBe(false);
    expect(isMotifLayer(undefined)).toBe(false);
    expect(isMotifLayer({})).toBe(false);
  });
});

describe('createMotifParams', () => {
  it('stores glyphRef, hostLayerId, anchorMode, edgeOpts, source verbatim when provided', () => {
    const params = createMotifParams({
      glyphRef: 'leaf-01',
      hostLayerId: 'layer-3',
      anchorMode: 'crossing',
      edgeOpts: { spacing: 40 },
      source: { kind: 'library', id: 'leaf-01' },
      binding: { selection: { roles: ['crossing'] }, placement: { sizing: { mode: 'fixed' } } },
    });
    expect(params.glyphRef).toBe('leaf-01');
    expect(params.hostLayerId).toBe('layer-3');
    expect(params.anchorMode).toBe('crossing');
    expect(params.edgeOpts).toEqual({ spacing: 40 });
    expect(params.source).toEqual({ kind: 'library', id: 'leaf-01' });
    expect(params.binding).toEqual({
      selection: { roles: ['crossing'] },
      placement: { sizing: { mode: 'fixed' } },
    });
  });

  it('defaults anchorMode to "edge"', () => {
    const params = createMotifParams({ glyphRef: 'leaf-01', hostLayerId: 'layer-1' });
    expect(params.anchorMode).toBe('edge');
  });

  it('defaults edgeOpts to { spacing: 24 } when omitted', () => {
    const params = createMotifParams({ glyphRef: 'leaf-01', hostLayerId: 'layer-1' });
    expect(params.edgeOpts).toEqual({ spacing: 24 });
  });

  it('defaults source to null when omitted', () => {
    const params = createMotifParams({ glyphRef: 'leaf-01', hostLayerId: 'layer-1' });
    expect(params.source).toBeNull();
  });

  it('defaults binding to { selection: {}, placement: {} } when omitted (so placeMotifs uses its own defaults)', () => {
    const params = createMotifParams({ glyphRef: 'leaf-01', hostLayerId: 'layer-1' });
    expect(params.binding).toEqual({ selection: {}, placement: {} });
  });

  it('normalizes a partial binding (missing selection or placement) by filling the missing half with {}', () => {
    const withSelectionOnly = createMotifParams({ binding: { selection: { roles: ['tip'] } } });
    expect(withSelectionOnly.binding).toEqual({ selection: { roles: ['tip'] }, placement: {} });

    const withPlacementOnly = createMotifParams({ binding: { placement: { flip: true } } });
    expect(withPlacementOnly.binding).toEqual({ selection: {}, placement: { flip: true } });
  });

  it('tolerates being called with no argument at all', () => {
    const params = createMotifParams();
    expect(params).toEqual({
      glyphRef: undefined,
      hostLayerId: undefined,
      binding: { selection: {}, placement: {} },
      anchorMode: 'edge',
      edgeOpts: { spacing: 24 },
      source: null,
    });
  });
});

describe('motifHostId', () => {
  it('reads layer.params.hostLayerId', () => {
    expect(motifHostId({ params: { hostLayerId: 'layer-9' } })).toBe('layer-9');
  });

  it('returns null when params is missing', () => {
    expect(motifHostId({})).toBeNull();
  });

  it('returns null when hostLayerId is not set', () => {
    expect(motifHostId({ params: {} })).toBeNull();
  });

  it('returns null for null/undefined layer', () => {
    expect(motifHostId(null)).toBeNull();
    expect(motifHostId(undefined)).toBeNull();
  });
});

describe('motifAutoName', () => {
  it('formats "<glyph name> on <host name>"', () => {
    const host = { name: 'Voronoi 1' };
    const glyph = { name: 'Leaf' };
    expect(motifAutoName(host, glyph)).toBe('Leaf on Voronoi 1');
  });

  it('falls back to "Motif" when glyph is missing', () => {
    const host = { name: 'Voronoi 1' };
    expect(motifAutoName(host, null)).toBe('Motif on Voronoi 1');
    expect(motifAutoName(host, undefined)).toBe('Motif on Voronoi 1');
    expect(motifAutoName(host, {})).toBe('Motif on Voronoi 1');
  });

  it('falls back to "layer" when host is missing', () => {
    const glyph = { name: 'Leaf' };
    expect(motifAutoName(null, glyph)).toBe('Leaf on layer');
    expect(motifAutoName(undefined, glyph)).toBe('Leaf on layer');
    expect(motifAutoName({}, glyph)).toBe('Leaf on layer');
  });

  it('falls back to both defaults when host and glyph are missing', () => {
    expect(motifAutoName(null, null)).toBe('Motif on layer');
  });
});

// C1 — chain data plumbing (issue #79). B3 flagged that normalizeBinding
// silently dropped `binding.chain`/`binding.overrides`, so a chain never
// survived createMotifParams. These tests pin the fix + the new pure
// accessors the rack UI (C2/C3) will read/write through.

describe('createMotifParams — chain-form binding preservation (C1)', () => {
  it('preserves binding.chain + binding.overrides + binding.placement verbatim (chain-form input)', () => {
    const chain = [{ type: 'route', roles: null, pathScope: 'all' }];
    const overrides = { include: ['a1'], exclude: [] };
    const params = createMotifParams({
      glyphRef: 'leaf-01',
      hostLayerId: 'layer-1',
      binding: { chain, overrides, placement: { flip: true } },
    });
    expect(params.binding).toEqual({
      chain,
      overrides,
      placement: { flip: true },
    });
  });

  it('preserves binding.chain without overrides when overrides is absent', () => {
    const chain = [{ type: 'everyN', n: 2, offset: 0, continuous: true }];
    const params = createMotifParams({ binding: { chain } });
    expect(params.binding).toEqual({ chain, placement: {} });
    expect(params.binding).not.toHaveProperty('overrides');
  });

  it('does NOT force selection to coexist with a chain-form binding', () => {
    const chain = [];
    const params = createMotifParams({ binding: { chain, placement: {} } });
    expect(params.binding).not.toHaveProperty('selection');
  });

  it('a legacy (no chain) binding still yields byte-identical {selection, placement} (regression pin)', () => {
    const params = createMotifParams({
      binding: { selection: { roles: ['crossing'] }, placement: { sizing: { mode: 'fixed' } } },
    });
    expect(params.binding).toEqual({
      selection: { roles: ['crossing'] },
      placement: { sizing: { mode: 'fixed' } },
    });
    expect(params.binding).not.toHaveProperty('chain');
    expect(params.binding).not.toHaveProperty('overrides');
  });

  it('an empty/omitted binding still defaults to legacy shape { selection: {}, placement: {} }', () => {
    expect(createMotifParams({}).binding).toEqual({ selection: {}, placement: {} });
    expect(createMotifParams().binding).toEqual({ selection: {}, placement: {} });
  });
});

describe('readChain (C1) — lazy-compile-on-read accessor for the rack UI', () => {
  it('returns binding.chain AS-IS (same reference) when chain is present', () => {
    const chain = [{ type: 'route', roles: null, pathScope: 'all' }];
    const binding = { chain, placement: {} };
    expect(readChain(binding)).toBe(chain);
  });

  it('compiles binding.selection when chain is absent (legacy binding)', () => {
    const selection = { roles: ['tip'], rate: { n: 2, offset: 1 } };
    const binding = { selection, placement: {} };
    expect(readChain(binding)).toEqual(compileSelectionToChain(selection).chain);
  });

  it('handles an empty/undefined binding gracefully, matching compileSelectionToChain({})', () => {
    expect(readChain(undefined)).toEqual(compileSelectionToChain({}).chain);
    expect(readChain(null)).toEqual(compileSelectionToChain({}).chain);
    expect(readChain({})).toEqual(compileSelectionToChain({}).chain);
  });

  it('never mutates the input binding', () => {
    const selection = { roles: ['tip'] };
    const binding = { selection, placement: {} };
    const snapshot = JSON.parse(JSON.stringify(binding));
    readChain(binding);
    expect(binding).toEqual(snapshot);
  });
});

describe('ensureChainForm (C1) — the first-edit rewrite primitive', () => {
  it('is idempotent: an already-chain-form binding is returned UNCHANGED (same reference)', () => {
    const binding = { chain: [{ type: 'route', roles: null, pathScope: 'all' }], placement: {} };
    expect(ensureChainForm(binding)).toBe(binding);
  });

  it('rewrites a legacy binding to chain-form with the compiled chain + overrides', () => {
    const selection = { roles: ['tip'], rate: { n: 2 }, overrides: { include: ['x'] } };
    const binding = { selection, placement: { flip: true } };
    const { chain, overrides } = compileSelectionToChain(selection);
    const result = ensureChainForm(binding);
    expect(result.chain).toEqual(chain);
    expect(result.overrides).toEqual(overrides);
    expect(result.placement).toEqual({ flip: true });
  });

  it('drops the stale `selection` key when rewriting to chain-form (documented choice — see contract comment)', () => {
    const binding = { selection: { roles: ['tip'] }, placement: {} };
    const result = ensureChainForm(binding);
    expect(result).not.toHaveProperty('selection');
  });

  it('never mutates the input binding', () => {
    const binding = { selection: { roles: ['tip'] }, placement: {} };
    const snapshot = JSON.parse(JSON.stringify(binding));
    ensureChainForm(binding);
    expect(binding).toEqual(snapshot);
  });

  it('omits `overrides` on the rewritten binding when the legacy selection carried none', () => {
    const binding = { selection: { roles: ['tip'] }, placement: {} };
    const result = ensureChainForm(binding);
    expect(result).not.toHaveProperty('overrides');
  });

  it('is consistent with readChain: the compiled chain equals what readChain returns for the same legacy binding', () => {
    const binding = { selection: { roles: ['tip'], density: 0.5, seed: 7 }, placement: {} };
    expect(ensureChainForm(binding).chain).toEqual(readChain(binding));
  });

  // Render-seam consistency lock: ensureChainForm parks overrides at the
  // TOP-LEVEL binding.overrides (see decision above). MotifPattern.generate
  // already threads that exact field into resolveSelection's opts.overrides
  // for chain-form bindings (compileSelectionToChain.js `resolveSelection`,
  // consumed at src/lib/motif/MotifPattern.js:107-111 — verified by reading,
  // not re-tested here since it's the render seam C1 must not touch). This
  // test pins the C1-side half of that contract: rewriting a legacy binding
  // WITH overrides via ensureChainForm, then running it through
  // resolveSelection with its own top-level overrides threaded, must select
  // identically to running the original legacy binding directly — so the
  // upgrade-on-first-edit never silently drops a user's canvas-pin override.
  it('an upgraded binding selects identically to the original when its overrides are threaded (D9 upgrade-safety)', () => {
    const anchors = [
      { id: 'a1', role: 'tip', x: 0, y: 0, tangent: 0, normal: 0, s: 0, meta: { pathIndex: 0 } },
      { id: 'a2', role: 'tip', x: 10, y: 0, tangent: 0, normal: 0, s: 1, meta: { pathIndex: 0 } },
      { id: 'a3', role: 'tip', x: 20, y: 0, tangent: 0, normal: 0, s: 2, meta: { pathIndex: 0 } },
    ];
    const binding = {
      selection: { roles: ['tip'], rate: { n: 2 }, overrides: { include: ['a2'], exclude: [] } },
      placement: {},
    };
    const before = resolveSelection(binding, anchors);
    const upgraded = ensureChainForm(binding);
    const after = resolveSelection(upgraded, anchors, { overrides: upgraded.overrides });
    expect(after.survivors.map((s) => s.id)).toEqual(before.survivors.map((s) => s.id));
    expect(after.orphans).toEqual(before.orphans);
  });
});

describe('deepMergeBinding — chain edits (C1)', () => {
  it('a chain patch replaces the chain array wholesale WITHOUT clobbering placement/overrides', () => {
    const base = {
      chain: [{ type: 'route', roles: null, pathScope: 'all', bypass: false }],
      overrides: { include: ['a1'] },
      placement: { flip: true, jitter: { x: 2 } },
    };
    const newChain = [{ type: 'route', roles: null, pathScope: 'all', bypass: true }];
    const merged = deepMergeBinding(base, { chain: newChain });
    expect(merged.chain).toBe(newChain);
    expect(merged.overrides).toEqual({ include: ['a1'] });
    expect(merged.placement).toEqual({ flip: true, jitter: { x: 2 } });
  });

  it('toggling a single block bypass (caller builds the new chain array) merges cleanly', () => {
    const base = {
      chain: [
        { type: 'route', roles: null, pathScope: 'all', bypass: false },
        { type: 'everyN', n: 2, offset: 0, continuous: true, bypass: false },
      ],
      placement: {},
    };
    const toggled = base.chain.map((block, i) => (i === 1 ? { ...block, bypass: true } : block));
    const merged = deepMergeBinding(base, { chain: toggled });
    expect(merged.chain[1].bypass).toBe(true);
    expect(merged.chain[0].bypass).toBe(false);
    expect(merged.placement).toEqual({});
    expect(base.chain[1].bypass).toBe(false); // input untouched
  });

  it('does not mutate the base binding', () => {
    const base = { chain: [{ type: 'route' }], placement: { flip: true } };
    const snapshot = JSON.parse(JSON.stringify(base));
    deepMergeBinding(base, { chain: [{ type: 'route', bypass: true }] });
    expect(base).toEqual(snapshot);
  });
});
