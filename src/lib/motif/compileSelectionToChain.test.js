import { describe, it, expect } from 'vitest';
import { compileSelectionToChain, resolveSelection } from './compileSelectionToChain.js';
import { runSelectionChain } from './chain.js';
import { selectAnchors } from './placementEngine.js';
import { mulberry32 } from '../patterns/rng.js';

// ---------------------------------------------------------------------------
// Anchor fixtures (mirror chain.test.js). Only the fields the SELECTION stage
// reads (id, role, x, y, meta.pathIndex/closed) matter; the rest are carried
// through untouched so a survivor is `===` its input anchor.
// ---------------------------------------------------------------------------
function mkAnchor(role, x, y, id, meta = {}) {
  return {
    id,
    role,
    x,
    y,
    tangent: 0,
    normal: 0,
    s: 0,
    meta: { pathIndex: 0, sampleIndex: 0, closed: false, ...meta },
  };
}

// Two paths interleaved in GLOBAL input order so per-path restart vs continuous
// is observable: [p0#0, p1#0, p0#1, p1#1, ...]. This is the fixture that only
// stays byte-identical when the compiled cycling blocks carry `continuous:true`.
function twoPathInterleaved(perPath) {
  const out = [];
  for (let i = 0; i < perPath; i++) {
    out.push(mkAnchor('edge', i * 10, 0, `p0_a${i}`, { pathIndex: 0, sampleIndex: i }));
    out.push(mkAnchor('edge', i * 10, 50, `p1_a${i}`, { pathIndex: 1, sampleIndex: i }));
  }
  return out;
}

const ids = (arr) => arr.map((a) => a.id);
const blockOfType = (chain, type) => chain.find((b) => b.type === type);

// ========================================================================
// Per-field compilation — hand-derived expected chain blocks
// ========================================================================
describe('compileSelectionToChain — per-field compilation', () => {
  it('empty selection {} compiles to a keep-all canonical chain', () => {
    const { chain, overrides } = compileSelectionToChain({});
    // route (roles:null, pathScope:all) + everyN (n:1,offset:0,continuous) +
    // density (density:1,seed:1,sequential). No skip (null), no field (absent).
    expect(chain).toEqual([
      { type: 'route', roles: null, pathScope: 'all' },
      { type: 'everyN', n: 1, offset: 0, continuous: true },
      { type: 'density', density: 1, seed: 1, rngMode: 'sequential' },
    ]);
    expect(overrides).toBeUndefined();
  });

  it('roles → route.roles', () => {
    const { chain } = compileSelectionToChain({ roles: ['edge', 'tip'] });
    expect(blockOfType(chain, 'route')).toEqual({
      type: 'route',
      roles: ['edge', 'tip'],
      pathScope: 'all',
    });
  });

  it('roles null stays null (route keeps all)', () => {
    const { chain } = compileSelectionToChain({ roles: null });
    expect(blockOfType(chain, 'route').roles).toBeNull();
  });

  it('rate → everyN with continuous:true (MANDATORY)', () => {
    const { chain } = compileSelectionToChain({ rate: { n: 3, offset: 1 } });
    expect(blockOfType(chain, 'everyN')).toEqual({
      type: 'everyN',
      n: 3,
      offset: 1,
      continuous: true,
    });
  });

  it('rate defaults mirror selectAnchors (n:1, offset:0) when absent/partial', () => {
    expect(blockOfType(compileSelectionToChain({}).chain, 'everyN')).toEqual({
      type: 'everyN',
      n: 1,
      offset: 0,
      continuous: true,
    });
    expect(blockOfType(compileSelectionToChain({ rate: { n: 4 } }).chain, 'everyN')).toEqual({
      type: 'everyN',
      n: 4,
      offset: 0,
      continuous: true,
    });
    expect(blockOfType(compileSelectionToChain({ rate: { offset: 2 } }).chain, 'everyN')).toEqual({
      type: 'everyN',
      n: 1,
      offset: 2,
      continuous: true,
    });
  });

  it('skip (non-empty) → skip block with continuous:true (MANDATORY)', () => {
    const mask = [false, false, true];
    const { chain } = compileSelectionToChain({ skip: mask });
    expect(blockOfType(chain, 'skip')).toEqual({
      type: 'skip',
      mask,
      continuous: true,
    });
  });

  it('skip absent/null/empty → NO skip block (byte-identical no-op)', () => {
    expect(blockOfType(compileSelectionToChain({}).chain, 'skip')).toBeUndefined();
    expect(blockOfType(compileSelectionToChain({ skip: null }).chain, 'skip')).toBeUndefined();
    expect(blockOfType(compileSelectionToChain({ skip: [] }).chain, 'skip')).toBeUndefined();
  });

  it('density + seed → density block with rngMode:sequential (MANDATORY) carrying seed', () => {
    const { chain } = compileSelectionToChain({ density: 0.4, seed: 99 });
    expect(blockOfType(chain, 'density')).toEqual({
      type: 'density',
      density: 0.4,
      seed: 99,
      rngMode: 'sequential',
    });
  });

  it('density defaults to 1 and seed defaults to 1 (selectAnchors DEFAULTS)', () => {
    expect(blockOfType(compileSelectionToChain({ density: 0.3 }).chain, 'density')).toEqual({
      type: 'density',
      density: 0.3,
      seed: 1,
      rngMode: 'sequential',
    });
    expect(blockOfType(compileSelectionToChain({}).chain, 'density')).toEqual({
      type: 'density',
      density: 1,
      seed: 1,
      rngMode: 'sequential',
    });
  });

  it('field present → field block (threshold/invert defaults 0.5/false)', () => {
    const field = { sampleNorm: (u) => u };
    expect(blockOfType(compileSelectionToChain({ field }).chain, 'field')).toEqual({
      type: 'field',
      field,
      threshold: 0.5,
      invert: false,
    });
    expect(
      blockOfType(
        compileSelectionToChain({ field, fieldThreshold: 0.2, fieldInvert: true }).chain,
        'field',
      ),
    ).toEqual({ type: 'field', field, threshold: 0.2, invert: true });
  });

  it('field absent/null → NO field block', () => {
    expect(blockOfType(compileSelectionToChain({}).chain, 'field')).toBeUndefined();
    expect(blockOfType(compileSelectionToChain({ field: null }).chain, 'field')).toBeUndefined();
  });

  it('overrides passthrough verbatim (NOT a chain block per ADR-0004)', () => {
    const overrides = { include: ['a', { x: 1, y: 2, role: 'edge' }], exclude: ['b'], tolerance: 5 };
    const compiled = compileSelectionToChain({ overrides });
    expect(compiled.overrides).toBe(overrides); // verbatim reference
    // overrides never appear as a block in the chain
    expect(compiled.chain.some((b) => b.type === 'overrides')).toBe(false);
  });

  it('canonical block ORDER is route → everyN → skip → density → field', () => {
    const field = { sampleNorm: () => 1 };
    const { chain } = compileSelectionToChain({
      roles: ['edge'],
      rate: { n: 2 },
      skip: [true, false],
      density: 0.5,
      seed: 3,
      field,
    });
    expect(chain.map((b) => b.type)).toEqual(['route', 'everyN', 'skip', 'density', 'field']);
  });

  it('STRUCTURAL pin: load-bearing flags survive compilation regardless of fuzz seed', () => {
    const field = { sampleNorm: () => 1 };
    const { chain } = compileSelectionToChain({
      rate: { n: 2 },
      skip: [true, false],
      density: 0.5,
      field,
    });
    // These three flags are what keep multi-path density byte-identical to
    // selectAnchors. A refactor that silently drops one must fail HERE, not
    // only when the fuzz happens to sample the exposing combo.
    expect(blockOfType(chain, 'everyN').continuous).toBe(true);
    expect(blockOfType(chain, 'skip').continuous).toBe(true);
    expect(blockOfType(chain, 'density').rngMode).toBe('sequential');
  });
});

// ========================================================================
// Explicit parity vignettes (before the big fuzz)
// ========================================================================
describe('compileSelectionToChain — targeted parity with selectAnchors', () => {
  const run = (anchors, legacy, opts = {}) => {
    const legacyRes = selectAnchors(anchors, legacy, opts);
    const compiled = compileSelectionToChain(legacy);
    const chainedRes = runSelectionChain(anchors, compiled.chain, {
      ...opts,
      overrides: compiled.overrides,
    });
    return { legacyRes, chainedRes };
  };

  it('empty selection keeps ALL anchors (survivors + orphans identical)', () => {
    const anchors = twoPathInterleaved(6);
    const { legacyRes, chainedRes } = run(anchors, {});
    expect(ids(chainedRes.survivors)).toEqual(ids(anchors));
    expect(ids(chainedRes.survivors)).toEqual(ids(legacyRes.survivors));
    expect(chainedRes.orphans).toEqual(legacyRes.orphans);
  });

  it('multi-path everyN+skip+density<1 is byte-identical (continuous flags load-bearing)', () => {
    const anchors = twoPathInterleaved(12);
    const legacy = {
      roles: ['edge'],
      rate: { n: 2, offset: 0 },
      skip: [false, false, true],
      density: 0.6,
      seed: 7,
    };
    const { legacyRes, chainedRes } = run(anchors, legacy);
    expect(ids(chainedRes.survivors)).toEqual(ids(legacyRes.survivors));
    // guard against a vacuous pass
    expect(chainedRes.survivors.length).toBeGreaterThan(0);
    expect(chainedRes.survivors.length).toBeLessThan(anchors.length);
  });

  it('density>=1 draws NO rng: survivors independent of seed, match selectAnchors', () => {
    const anchors = twoPathInterleaved(8);
    for (const seed of [1, 42, 9999]) {
      for (const density of [1, 1.5, 3]) {
        const { legacyRes, chainedRes } = run(anchors, { density, seed });
        expect(ids(chainedRes.survivors)).toEqual(ids(anchors)); // keeps all
        expect(ids(chainedRes.survivors)).toEqual(ids(legacyRes.survivors));
      }
    }
  });

  it('field + threshold/invert parity (with canvas dims)', () => {
    const anchors = twoPathInterleaved(10);
    const field = { sampleNorm: (u, v) => (u + v) / 2 };
    const legacy = { field, fieldThreshold: 0.4, fieldInvert: true };
    const { legacyRes, chainedRes } = run(anchors, legacy, { canvasW: 100, canvasH: 100 });
    expect(ids(chainedRes.survivors)).toEqual(ids(legacyRes.survivors));
  });

  it('overrides include/exclude (real id, missing id, spatial ref) parity incl orphans', () => {
    const anchors = twoPathInterleaved(6);
    const legacy = {
      density: 0.5,
      seed: 5,
      overrides: {
        include: ['p1_a3', 'does_not_exist', { x: 0, y: 50, role: 'edge' }],
        exclude: ['p0_a0'],
      },
    };
    const { legacyRes, chainedRes } = run(anchors, legacy);
    expect(ids(chainedRes.survivors)).toEqual(ids(legacyRes.survivors));
    expect(chainedRes.orphans).toEqual(legacyRes.orphans);
  });
});

// ========================================================================
// resolveSelection acceptance helper (chain-present vs selection-present)
// ========================================================================
describe('resolveSelection — both-shapes acceptance seam', () => {
  it('selection-present: compiles + runs, byte-identical to selectAnchors', () => {
    const anchors = twoPathInterleaved(8);
    const selection = { roles: ['edge'], rate: { n: 2 }, density: 0.7, seed: 3 };
    const legacyRes = selectAnchors(anchors, selection, { canvasW: 100, canvasH: 100 });
    const res = resolveSelection({ selection }, anchors, { canvasW: 100, canvasH: 100 });
    expect(ids(res.survivors)).toEqual(ids(legacyRes.survivors));
    expect(res.orphans).toEqual(legacyRes.orphans);
    expect(res.sequence).toBeNull();
  });

  it('selection-present injects the compiled overrides (from selection.overrides)', () => {
    const anchors = twoPathInterleaved(5);
    const selection = { overrides: { exclude: ['p0_a0'] } };
    const legacyRes = selectAnchors(anchors, selection, {});
    const res = resolveSelection({ selection }, anchors, {});
    expect(ids(res.survivors)).toEqual(ids(legacyRes.survivors));
    expect(res.survivors.some((a) => a.id === 'p0_a0')).toBe(false);
  });

  it('chain-present: runs the stored chain, passes opts.overrides straight through', () => {
    const anchors = twoPathInterleaved(6);
    const chain = [
      { type: 'route', roles: ['edge'] },
      { type: 'everyN', n: 2, offset: 0, continuous: true },
      { type: 'sequence', slots: [] },
    ];
    const direct = runSelectionChain(anchors, chain, { overrides: { include: ['p1_a3'] } });
    const res = resolveSelection({ chain }, anchors, { overrides: { include: ['p1_a3'] } });
    expect(ids(res.survivors)).toEqual(ids(direct.survivors));
    // sequence block is passed through untouched (terminal, for A4)
    expect(res.sequence).toBe(chain[2]);
  });

  it('chain-present takes precedence over a stray selection on the same binding', () => {
    const anchors = twoPathInterleaved(4);
    const chain = [{ type: 'route', roles: ['tip'] }]; // keeps none (all edge)
    const res = resolveSelection({ chain, selection: { roles: ['edge'] } }, anchors, {});
    expect(res.survivors).toEqual([]); // chain won, not the selection
  });
});

// ========================================================================
// The byte-identity GOLDEN FUZZ SWEEP — the whole point of A3.
// Random multi-path fixtures × random legacy selections; for EACH, the
// compiled chain must reproduce selectAnchors EXACTLY on survivors AND orphans.
// ========================================================================
describe('compileSelectionToChain — byte-identity fuzz sweep (>=500 cases)', () => {
  const CASES = 600;
  const ROLE_POOL = ['edge', 'tip', 'crossing'];

  function makeAnchors(rand) {
    const nPaths = 1 + Math.floor(rand() * 3); // 1..3 paths
    const out = [];
    for (let p = 0; p < nPaths; p++) {
      const perPath = Math.floor(rand() * 9); // 0..8 anchors on this path
      for (let i = 0; i < perPath; i++) {
        const role = ROLE_POOL[Math.floor(rand() * ROLE_POOL.length)];
        out.push(
          mkAnchor(role, Math.floor(rand() * 100), Math.floor(rand() * 100), `p${p}_a${i}`, {
            pathIndex: p,
            sampleIndex: i,
            closed: rand() < 0.5,
          }),
        );
      }
    }
    // Interleave paths so per-path vs continuous cycling is exercised: sort by
    // sampleIndex, stable within it keeps path grouping mixed in global order.
    out.sort((a, b) => a.meta.sampleIndex - b.meta.sampleIndex);
    return out;
  }

  function makeSelection(rand, anchors) {
    const sel = {};

    // roles: undefined | null | random subset (incl empty & non-present roles)
    const rRoll = rand();
    if (rRoll < 0.3) {
      // leave absent
    } else if (rRoll < 0.45) {
      sel.roles = null;
    } else {
      const subset = ROLE_POOL.filter(() => rand() < 0.5);
      if (rand() < 0.2) subset.push('ghost_role'); // a role no anchor has
      sel.roles = subset; // may be empty ⇒ filters all
    }

    // rate: undefined | {n?, offset?} with degenerate n (incl 0) + neg offset
    const rateRoll = rand();
    if (rateRoll >= 0.25) {
      const rate = {};
      if (rand() < 0.85) rate.n = Math.floor(rand() * 5); // 0..4 (0 degenerate)
      if (rand() < 0.7) rate.offset = Math.floor(rand() * 6) - 2; // -2..3
      sel.rate = rate;
    }

    // skip: undefined | null | [] | random boolean mask
    const skipRoll = rand();
    if (skipRoll < 0.5) {
      // absent
    } else if (skipRoll < 0.6) {
      sel.skip = rand() < 0.5 ? null : [];
    } else {
      const len = 1 + Math.floor(rand() * 5);
      sel.skip = Array.from({ length: len }, () => rand() < 0.5);
    }

    // density: undefined | <1 (draws) | >=1 (no draw) ; seed varied
    const dRoll = rand();
    if (dRoll >= 0.2) {
      sel.density = rand() < 0.6 ? rand() : 1 + rand() * 2; // <1 or >=1
      if (rand() < 0.8) sel.seed = [1, 7, 42, 99, 4242, 12345][Math.floor(rand() * 6)];
    }

    // field: undefined | null | random scalar field with threshold/invert
    const fRoll = rand();
    if (fRoll >= 0.5) {
      const kind = Math.floor(rand() * 3);
      const field = {
        sampleNorm:
          kind === 0
            ? (u) => u
            : kind === 1
              ? (u, v) => (u + v) / 2
              : (u, v) => Math.abs(Math.sin(u * 6) * Math.cos(v * 6)),
      };
      sel.field = field;
      if (rand() < 0.8) sel.fieldThreshold = rand();
      if (rand() < 0.5) sel.fieldInvert = rand() < 0.5;
    }

    // overrides: undefined | include/exclude with real ids, missing ids, spatial
    if (rand() < 0.4 && anchors.length > 0) {
      const pickId = () => anchors[Math.floor(rand() * anchors.length)].id;
      const mkRef = () => {
        const t = rand();
        if (t < 0.5) return pickId(); // real id
        if (t < 0.7) return `missing_${Math.floor(rand() * 1000)}`; // missing id
        // spatial ref near a real anchor (sometimes with a role)
        const base = anchors[Math.floor(rand() * anchors.length)];
        const ref = { x: base.x + (rand() * 6 - 3), y: base.y + (rand() * 6 - 3) };
        if (rand() < 0.5) ref.role = ROLE_POOL[Math.floor(rand() * ROLE_POOL.length)];
        return ref;
      };
      const overrides = {};
      if (rand() < 0.8) overrides.include = Array.from({ length: Math.floor(rand() * 3) }, mkRef);
      if (rand() < 0.8) overrides.exclude = Array.from({ length: Math.floor(rand() * 3) }, mkRef);
      if (rand() < 0.3) overrides.tolerance = 1 + rand() * 12;
      sel.overrides = overrides;
    }

    return sel;
  }

  it(`survivors AND orphans are byte-identical across ${CASES} random cases`, () => {
    const rand = mulberry32(0xc0ffee);
    let removedSome = 0;
    let hadOverrides = 0;
    for (let c = 0; c < CASES; c++) {
      const anchors = makeAnchors(rand);
      const legacy = makeSelection(rand, anchors);
      // canvas dims: sometimes present (exercises field), sometimes absent
      const opts = rand() < 0.75 ? { canvasW: 100, canvasH: 100 } : {};

      const legacyRes = selectAnchors(anchors, legacy, opts);
      const compiled = compileSelectionToChain(legacy);
      const chainedRes = runSelectionChain(anchors, compiled.chain, {
        ...opts,
        overrides: compiled.overrides,
      });

      const ctx = () => `case ${c} · legacy=${JSON.stringify(legacy, fieldReplacer)}`;
      expect(ids(chainedRes.survivors), ctx()).toEqual(ids(legacyRes.survivors));
      expect(chainedRes.orphans, ctx()).toEqual(legacyRes.orphans);

      if (chainedRes.survivors.length < anchors.length && anchors.length > 0) removedSome++;
      if (legacy.overrides) hadOverrides++;
    }
    // Coverage sanity: the sweep is not a vacuous keep-all parade.
    expect(removedSome).toBeGreaterThan(CASES * 0.3);
    expect(hadOverrides).toBeGreaterThan(CASES * 0.2);
  });

  // JSON can't stringify the field function; replace it for readable failures.
  function fieldReplacer(key, value) {
    return key === 'field' && typeof value === 'object' ? '[field]' : value;
  }
});
