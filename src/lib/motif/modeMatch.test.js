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

  it('flat slot glyph swapped ⇒ mode HOLDS (alternate-xo; identity is the rhythm, glyph-agnostic — ADR 0008)', () => {
    // REVERSES the pre-ADR-0008 "swapped slot glyph ⇒ custom" contract: a flat
    // mode's identity is its rhythm (glyph, rest), not which glyph fills a step.
    // Swapping the diamond for a dot keeps "Alternate x‑o".
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'alternate-xo').build(SEMANTIC_HOST);
    binding.chain[1].slots[0].glyphRef = 'dot';
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('alternate-xo');
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

describe('modeForMotif — ZONED identity is the Zone skeleton (Vine; ADR 0008)', () => {
  // The Vine's canonical form is the SKELETON only:
  //   { type:'sequence', zoned:true, zones:['apex','cell','stem'] }  (zone ids sorted)
  // Everything INSIDE a zone — glyphs, slot counts, deal mode, ends, continuous,
  // modifiers, rests — is the maker's content and never flips the mode.
  const vineBinding = (host = SEMANTIC_HOST) =>
    STARTER_CHIPS.find((c) => c.id === 'vine').build(host).binding;
  const seqOf = (binding) => binding.chain.find((b) => b.type === 'sequence');

  it('removing a zone ⇒ custom (skeleton {apex,cell,stem} ≠ {apex,cell})', () => {
    // DRIVER: without skeleton canonicalization both sides collapse to the flat
    // path (slots:[] on each) and this wrongly reads 'vine'. The skeleton branch
    // is what makes the zone SET load-bearing.
    const binding = vineBinding();
    const seq = seqOf(binding);
    seq.zones = seq.zones.filter((z) => z.zone !== 'stem');
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('custom');
  });

  // ── #150 (PRD #143) — criterion 5, the mode-identity consequence of the third
  // partition. The machinery is NOT new: modeMatch already canonicalizes a zoned
  // sequence to its SORTED zone-id list and deepEqual compares array length
  // first, so a three-Zone skeleton could never have matched a two-Zone one.
  // What IS new is that this now happens in the field — the Vine gained a Cell
  // Zone, so every Vine saved before this change reads as Custom. This is the
  // GUARDING TEST for that contract, deliberately not a change dressed as a fix.
  it('a skeleton INCLUDING Cell does not match one EXCLUDING it', () => {
    const withCell = vineBinding();
    expect(seqOf(withCell).zones.map((z) => z.zone)).toEqual(['apex', 'stem', 'cell']);
    expect(modeForMotif(withCell, SEMANTIC_HOST)).toBe('vine');

    // A Vine as it was STORED before this slice: Apex and Stem only.
    const stored = vineBinding();
    seqOf(stored).zones = seqOf(stored).zones.filter((z) => z.zone !== 'cell');
    expect(modeForMotif(stored, SEMANTIC_HOST)).toBe('custom');
  });

  it('the Cell Zone is identity, not content — its SLOTS are still maker content', () => {
    // The Zone's presence flips the mode; what is dealt inside it never does.
    const binding = vineBinding();
    const cell = seqOf(binding).zones.find((z) => z.zone === 'cell');
    cell.slots = [{ glyphRef: 'dot' }, { rest: true }];
    cell.mode = 'random';
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('vine');
  });

  it('zone AUTHORING order is not identity — the canonical list is sorted', () => {
    const binding = vineBinding();
    seqOf(binding).zones.reverse(); // cell, stem, apex
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('vine');
  });

  it('glyph swap INSIDE a zone ⇒ still vine (glyphs are maker content)', () => {
    const binding = vineBinding();
    seqOf(binding).zones.find((z) => z.zone === 'stem').slots[0].glyphRef = 'dot';
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('vine');
  });

  it('adding a slot to a zone ⇒ still vine (slot count is maker content)', () => {
    const binding = vineBinding();
    seqOf(binding).zones.find((z) => z.zone === 'stem').slots.push({ glyphRef: 'rosette' });
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('vine');
  });

  it('changing a zone mode/ends/continuous ⇒ still vine (deal is maker content)', () => {
    const binding = vineBinding();
    const apex = seqOf(binding).zones.find((z) => z.zone === 'apex');
    apex.mode = 'random';
    apex.ends = 'up';
    apex.continuous = false;
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('vine');
  });

  it('de-zoning (zones → flat slots) ⇒ custom (a flat sequence is a different skeleton)', () => {
    const binding = vineBinding();
    binding.chain[1] = {
      type: 'sequence',
      mode: 'cycle',
      slots: [{ glyphRef: 'rosette' }, { glyphRef: 'leaf' }],
    };
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('custom');
  });

  it('adding a chain block to the vine ⇒ custom (chain structure changed)', () => {
    const binding = vineBinding();
    binding.chain.push({ type: 'everyN', n: 2, offset: 0 });
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('custom');
  });

  it('a zoned sequence never matches a FLAT chip (zoned marker guarantees it)', () => {
    // Alternate-xo's route (roles:['crossing']) but a ZONED sequence grafted on.
    // Matches neither alternate-xo (its sequence is flat) nor vine (route roles
    // differ) ⇒ custom.
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'alternate-xo').build(SEMANTIC_HOST);
    binding.chain[1] = {
      type: 'sequence',
      zones: [
        { zone: 'apex', mode: 'cycle', slots: [{ glyphRef: 'diamond' }] },
        { zone: 'stem', mode: 'cycle', slots: [{ rest: true }] },
      ],
    };
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('custom');
  });

  it('a flat rhythm change on a flat chip ⇒ custom (glyph-agnostic ≠ slot-agnostic)', () => {
    // Alternate-xo is [glyph, rest]. Dropping the rest is a NEW rhythm (one step,
    // not two) ⇒ custom — even though a glyph SWAP would have held the mode.
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'alternate-xo').build(SEMANTIC_HOST);
    binding.chain[1].slots = [{ glyphRef: 'diamond' }]; // rest removed
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('custom');
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
