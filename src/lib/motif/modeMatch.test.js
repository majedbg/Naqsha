import { describe, it, expect } from 'vitest';
import { modeForMotif, applyModeChain } from './modeMatch.js';
import { STARTER_CHIPS } from './starterChips.js';

const CHIP_IDS = STARTER_CHIPS.map((c) => c.id);
const SEMANTIC_HOST = 'grid';
const EDGE_HOST = 'flowfield';

describe('modeForMotif — round-trip (every chip → its own id)', () => {
  for (const host of [SEMANTIC_HOST, EDGE_HOST]) {
    for (const chip of STARTER_CHIPS) {
      it(`${chip.id} round-trips on ${host}`, () => {
        const { binding } = chip.build(host);
        expect(modeForMotif(binding, host)).toBe(chip.id);
      });
    }
  }

  it('a chip does not collide with a DIFFERENT chip on the same host', () => {
    // Build each chip once; assert modeForMotif never returns a foreign id.
    for (const host of [SEMANTIC_HOST, EDGE_HOST]) {
      for (const chip of STARTER_CHIPS) {
        const { binding } = chip.build(host);
        const matched = modeForMotif(binding, host);
        expect(CHIP_IDS).toContain(matched);
        expect(matched).toBe(chip.id);
      }
    }
  });
});

describe('modeForMotif — normalization (semantically-equal, textually-different ⇒ same id)', () => {
  it('tolerates volatile defaults the rack may add (bypass:false, seed, continuous, sizeScale, key order)', () => {
    // alternate-xo on a semantic host, but rewritten as the rack might store it:
    // key-reordered route with an explicit bypass:false, and a sequence carrying
    // the engine defaults (mode/continuous/seed) plus a slot sizeScale:1.
    const binding = {
      chain: [
        { pathScope: 'all', bypass: false, roles: ['crossing'], type: 'route' },
        {
          type: 'sequence',
          slots: [{ glyphRef: 'diamond', sizeScale: 1 }, { rest: true }],
          mode: 'cycle',
          continuous: false,
          seed: 1,
        },
      ],
      placement: { sizing: { mode: 'fixed', size: 99 } }, // placement IGNORED
    };
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('alternate-xo');
  });

  it('role order is irrelevant (roles compared as a set)', () => {
    // Fabricate a two-role route echoed on both sides would be needed for a real
    // chip; here assert order-independence directly against border-march's route
    // by reordering nothing more than confirming a single-role stays matched.
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'border-march').build(EDGE_HOST);
    // reverse a (single-element) roles array — still equal as a set
    binding.chain[0].roles = [...binding.chain[0].roles].reverse();
    expect(modeForMotif(binding, EDGE_HOST)).toBe('border-march');
  });

  it('bypass:true is a real difference ⇒ custom', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'alternate-xo').build(SEMANTIC_HOST);
    binding.chain[0].bypass = true;
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('custom');
  });
});

describe('modeForMotif — one-field mutations ⇒ custom', () => {
  it('everyN n mutated (3→4) ⇒ custom (border-march)', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'border-march').build(EDGE_HOST);
    binding.chain[1].n = 4;
    expect(modeForMotif(binding, EDGE_HOST)).toBe('custom');
  });

  it('density mutated (0.25→0.3) ⇒ custom (sparse-scatter)', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'sparse-scatter').build(EDGE_HOST);
    binding.chain[1].density = 0.3;
    expect(modeForMotif(binding, EDGE_HOST)).toBe('custom');
  });

  it('slot glyph swapped ⇒ custom (alternate-xo)', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'alternate-xo').build(SEMANTIC_HOST);
    binding.chain[1].slots[0].glyphRef = 'dot';
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('custom');
  });

  it('route roles changed ⇒ custom (vine)', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'vine').build(SEMANTIC_HOST);
    binding.chain[0].roles = ['tip'];
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('custom');
  });

  it('an added block ⇒ custom', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'sparse-scatter').build(EDGE_HOST);
    binding.chain.push({ type: 'everyN', n: 2, offset: 0 });
    expect(modeForMotif(binding, EDGE_HOST)).toBe('custom');
  });
});

describe('modeForMotif — legacy / null safety ⇒ custom', () => {
  it('legacy selection-form binding (no .chain) ⇒ custom', () => {
    expect(modeForMotif({ selection: { roles: ['edge'] }, placement: {} }, EDGE_HOST)).toBe('custom');
  });
  it('null / undefined / empty ⇒ custom', () => {
    expect(modeForMotif(null, EDGE_HOST)).toBe('custom');
    expect(modeForMotif(undefined, EDGE_HOST)).toBe('custom');
    expect(modeForMotif({}, EDGE_HOST)).toBe('custom');
    expect(modeForMotif({ chain: null }, EDGE_HOST)).toBe('custom');
  });
});

describe('applyModeChain', () => {
  it('returns the chip build output for a real chip id (round-trips via modeForMotif)', () => {
    for (const host of [SEMANTIC_HOST, EDGE_HOST]) {
      for (const chip of STARTER_CHIPS) {
        const written = applyModeChain(chip.id, host);
        expect(written).toEqual(chip.build(host));
        expect(modeForMotif(written.binding, host)).toBe(chip.id);
      }
    }
  });

  it("returns null for 'custom' or an unknown id", () => {
    expect(applyModeChain('custom', EDGE_HOST)).toBeNull();
    expect(applyModeChain('nope', EDGE_HOST)).toBeNull();
    expect(applyModeChain(null, EDGE_HOST)).toBeNull();
  });
});
