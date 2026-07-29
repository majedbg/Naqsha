import { describe, it, expect } from 'vitest';
import { modeForMotif, applyModeChain } from './modeMatch.js';
import { STARTER_CHIPS } from './starterChips.js';
import { SEMANTIC_MOTIF_HOSTS, defaultRolesForHost } from './hostKinds.js';
import { rolesForHost } from './hostRoles.js';

const CHIP_IDS = STARTER_CHIPS.map((c) => c.id);
const SEMANTIC_HOST = 'grid';
const EDGE_HOST = 'flowfield';

// Grid.js gates each axis at >= 0.5, so 0 draws nothing on that axis.
const COLUMNS_ONLY = { drawHorizontal: 0, drawVertical: 1 };
const BOTH_AXES = { drawHorizontal: 1, drawVertical: 1 };

describe('modeForMotif — round-trip (every chip → its own id)', () => {
  // #150 adds the two CELL hosts to the loop. The Vine's Route now varies by host
  // (it comes from `rolesForHost`), which is exactly where a host-dependent chain
  // could stop matching itself — so clicking Vine on a packing must light **Vine**
  // in the mode column, not Custom. `truchet` covers the mixed case.
  for (const host of [SEMANTIC_HOST, EDGE_HOST, 'circlepacking', 'truchet']) {
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

  // `hold` (#187) is a per-slot size modifier, the peer of sizeScale — setting
  // one is a customisation and the mode column must say so, or it silently
  // reports a preset the canvas is no longer drawing.
  it('a slot hold ⇒ custom (alternate-xo), exactly as sizeScale does', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'alternate-xo').build(SEMANTIC_HOST);
    binding.chain[1].slots[0].hold = 0.5;
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('custom');
  });

  // The migration guarantee. Both sides run through the same canonicalSlot, so
  // absent and an explicit 0 collapse to the same canonical form — no document
  // authored before `hold` existed changes its mode, and a slider dragged back
  // to 0 returns to the preset rather than sticking on Custom.
  it('hold 0 — absent or explicit — HOLDS the mode (no document rewritten by #187)', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'alternate-xo').build(SEMANTIC_HOST);
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('alternate-xo'); // absent
    binding.chain[1].slots[0].hold = 0;
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('alternate-xo'); // explicit 0
    binding.chain[1].slots[0].hold = undefined; // what the card writes to clear
    expect(modeForMotif(binding, SEMANTIC_HOST)).toBe('alternate-xo');
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

// ── THE EFFECTIVE CHAIN (2026-07-28, ADR 0008 amendment) ─────────────────────
//
// modeForMotif matches the chain the CANVAS RENDERS, not the one the document
// stores: the stored side goes through `coerceRoles` first, exactly as
// MotifPattern and AnchorGhostOverlay do. The symptom that forced it: build an
// Alternate x‑o on a two-axis Grid (stores `['crossing']`), toggle the Grid to
// columns-only (#166/#168) and the mode column flipped to Custom with no motif
// edit — while the glyphs went on rendering, relocated to along the lines by the
// very coercion the matcher was ignoring. The label was lying about the canvas,
// and `Inspector.applyMode` stashed the maker's work under `cache.custom`
// instead of `cache['alternate-xo']`.
describe('modeForMotif — matches the EFFECTIVE chain (what the canvas renders)', () => {
  const chip = (id) => STARTER_CHIPS.find((c) => c.id === id);

  it('a chain stored for a two-axis Grid still reads as its mode under single-axis params', () => {
    // THE MOTIVATING CASE. Stored roles `['crossing']`; a columns-only Grid emits
    // `edge` alone, so the render coerces them — and so must the match.
    const built = chip('alternate-xo').build('grid', BOTH_AXES);
    expect(built.binding.chain[0].roles).toEqual(['crossing']); // the premise
    expect(modeForMotif(built.binding, 'grid', COLUMNS_ONLY)).toBe('alternate-xo');
  });

  it('the same holds for the ZONED Vine (its stored Route is all four roles)', () => {
    // The Vine's Route is the union of the roles the host emits, so a two-axis
    // Grid stores four and a columns-only Grid builds one. Both coerce to
    // `['edge']` at render; the Zone skeleton is untouched either way.
    const built = chip('vine').build('grid', BOTH_AXES);
    expect(built.binding.chain[0].roles).toEqual(['crossing', 'edge', 'tip', 'cell']);
    expect(modeForMotif(built.binding, 'grid', COLUMNS_ONLY)).toBe('vine');
  });

  it('every starter chip stored two-axis survives the axis toggle', () => {
    for (const c of STARTER_CHIPS) {
      expect(modeForMotif(c.build('grid', BOTH_AXES).binding, 'grid', COLUMNS_ONLY)).toBe(c.id);
    }
  });

  // THE GUARD THE `anchorMode` DERIVATION EXISTS FOR. `coerceRoles`' first branch
  // reads a MISSING anchorMode as 'edge', so a matcher that coerced without one
  // would rewrite EVERY semantic host's roles to `['edge']` and read Custom on a
  // Voronoi or a Recursive that never changed. The derivation
  // (`isEdgeHost ? 'edge' : 'semantic'`) is what keeps these lit.
  describe('a genuinely SEMANTIC host is untouched', () => {
    for (const host of ['voronoi', 'recursive', 'spiral', 'girih', 'truchet']) {
      it(`every chip still round-trips on ${host} (with and without params)`, () => {
        for (const c of STARTER_CHIPS) {
          expect(modeForMotif(c.build(host).binding, host)).toBe(c.id);
          expect(modeForMotif(c.build(host, {}).binding, host, {})).toBe(c.id);
        }
      });
    }

    it('a two-axis Grid is unchanged — the stored roles pass through verbatim', () => {
      for (const c of STARTER_CHIPS) {
        expect(modeForMotif(c.build('grid', BOTH_AXES).binding, 'grid', BOTH_AXES)).toBe(c.id);
      }
      // and a role the host DOES emit still diverges the mode (matching is not
      // a blanket "roles no longer count").
      const b = chip('alternate-xo').build('grid', BOTH_AXES).binding;
      b.chain[0].roles = ['tip'];
      expect(modeForMotif(b, 'grid', BOTH_AXES)).toBe('custom');
    });
  });

  it('MODE IDENTITY IS NON-INJECTIVE on a coercing host — accepted, ADR 0008', () => {
    // On a columns-only Grid the host cannot tell `['crossing']` from `['edge']`
    // (it emits only edges and renders both identically), so both read as the
    // same mode. Toggle the axis back and they split again. The label
    // distinguishes exactly what the HOST can distinguish — no more, no less.
    const crossing = chip('alternate-xo').build('grid', BOTH_AXES).binding;
    const edge = chip('alternate-xo').build('grid', COLUMNS_ONLY).binding;
    expect(modeForMotif(crossing, 'grid', COLUMNS_ONLY)).toBe('alternate-xo');
    expect(modeForMotif(edge, 'grid', COLUMNS_ONLY)).toBe('alternate-xo');
    // …and on the two-axis Grid the same two chains are different modes.
    expect(modeForMotif(crossing, 'grid', BOTH_AXES)).toBe('alternate-xo');
    expect(modeForMotif(edge, 'grid', BOTH_AXES)).toBe('custom');
  });

  it('is READ-ONLY: matching never mutates the binding it was handed', () => {
    // `coerceRoles` clones, and modeForMotif returns a string — nothing here may
    // ever write the coerced value back into the document.
    const binding = chip('alternate-xo').build('grid', BOTH_AXES).binding;
    const before = JSON.parse(JSON.stringify(binding));
    modeForMotif(binding, 'grid', COLUMNS_ONLY);
    expect(binding).toEqual(before);
    expect(binding.chain[0].roles).toEqual(['crossing']);
  });

  // THE BRANCH-3 HAZARD, decided rather than ignored. When a stored role survives
  // NO intersection, `coerceRoles` falls back to `defaultRolesForHost(type)` —
  // which is params-BLIND. Feeding that into identity matching is safe for two
  // reasons, and this pair of tests is the standing proof of the second:
  //   • the RENDER runs the identical fallback, so the mode named is still the
  //     chain the canvas drew — which is the whole contract; and
  //   • the fallback is never a role the host cannot serve, because the only
  //     params-narrowing semantic host is `grid` and a single-axis Grid is
  //     diverted by branch 1 long before the fallback is reachable.
  it('the params-blind fallback is always a role the host actually emits', () => {
    for (const host of SEMANTIC_MOTIF_HOSTS) {
      const avail = rolesForHost(host);
      expect(avail.length).toBeGreaterThan(0);
      for (const r of defaultRolesForHost(host)) expect(avail).toContain(r);
    }
  });

  it("repays part of #154's recorded cost: a pre-narrowing Vine reads as Vine again", () => {
    // hostRoles.js records the ACCEPTED cost of narrowing Voronoi (no `tip`) and
    // Spiral (no `cell`): the Vine chip's Route dropped a role, so saved Vines on
    // those hosts read as **Custom** on load — render-neutral (the dropped role
    // matched no anchor) but visible in the mode column, and it moved their
    // modeCache key. Matching the effective chain intersects the dead role away
    // on the stored side too, so they read as Vine again. No document migrated.
    for (const [host, dead] of [
      ['voronoi', 'tip'],
      ['spiral', 'cell'],
    ]) {
      expect(rolesForHost(host)).not.toContain(dead);
      const saved = chip('vine').build(host).binding;
      saved.chain[0].roles = [...saved.chain[0].roles, dead]; // as stored pre-#154
      expect(modeForMotif(saved, host)).toBe('vine');
    }
  });

  it('a stored role the host CANNOT emit reads as the mode the canvas draws', () => {
    // Voronoi emits no `tip` (#154), so a stored `['tip']` renders through the
    // fallback as `['crossing']` — the same anchors an Alternate x‑o draws. The
    // mode column says so. This is the effective-chain contract taken to its
    // conclusion, not an accident: the alternative (a Custom label over a canvas
    // indistinguishable from the preset) is the lie this change removes.
    expect(rolesForHost('voronoi')).not.toContain('tip');
    const b = chip('alternate-xo').build('voronoi').binding;
    b.chain[0].roles = ['tip'];
    expect(modeForMotif(b, 'voronoi')).toBe('alternate-xo');
  });
});
