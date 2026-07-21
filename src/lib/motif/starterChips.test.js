import { describe, it, expect } from 'vitest';
import { STARTER_CHIPS } from './starterChips.js';
import { runSelectionChain } from './chain.js';
import { resolvePlacements } from './placementEngine.js';
import { hasSequence, sequenceIndex } from './chainEditor.js';
import { getGlyph, MOTIF_GLYPHS } from './glyphs.js';
import { createMotifParams } from './motifLayer.js';

// --- anchor fixtures (mirror chain.test.js / compileSelectionToChain.test.js) --
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

// A semantic-host-flavored anchor set: crossing role, no meta.closed/pathIndex
// semantics that matter (mirrors grid/spiral crossing anchors).
function semanticAnchors(n = 12) {
  return Array.from({ length: n }, (_, i) => mkAnchor('crossing', i * 10, 0, `s${i}`));
}

// An edge-host-flavored anchor set across two OPEN paths (mirrors flowfield
// streamlines — meta.closed stays false), so 'open'/'all' scope keeps them but
// 'closed' scope would empty the selection (the trap border-march must avoid).
function edgeAnchors(perPath = 8) {
  const out = [];
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < perPath; i++) {
      out.push(
        mkAnchor('edge', i * 10, p * 50, `p${p}_a${i}`, {
          pathIndex: p,
          sampleIndex: i,
          closed: false,
        }),
      );
    }
  }
  return out;
}

describe('STARTER_CHIPS — curated set', () => {
  it('has 4-6 chips with unique ids', () => {
    expect(STARTER_CHIPS.length).toBeGreaterThanOrEqual(4);
    expect(STARTER_CHIPS.length).toBeLessThanOrEqual(6);
    const ids = STARTER_CHIPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the runbook-suggested set (by id)', () => {
    const ids = new Set(STARTER_CHIPS.map((c) => c.id));
    expect(ids.has('alternate-xo')).toBe(true);
    expect(ids.has('vine')).toBe(true);
    expect(ids.has('sparse-scatter')).toBe(true);
    expect(ids.has('border-march')).toBe(true);
  });

  it('labels are plain names — no emoji (Variant D: notation carries the meaning)', () => {
    // The mode-selector rows show the label as a plain name; the RhythmStrip
    // carries the glyph notation, and the naqsheh brief bans emoji in chrome.
    const byId = Object.fromEntries(STARTER_CHIPS.map((c) => [c.id, c.label]));
    expect(byId.vine).toBe('Vine');
    // Alternate keeps its notation-free name (the hyphenated x‑o is not emoji).
    expect(byId['alternate-xo']).toBe('Alternate x‑o');
    // No chip label carries a pictographic/emoji code point.
    const emoji = /\p{Extended_Pictographic}/u;
    for (const chip of STARTER_CHIPS) {
      expect(emoji.test(chip.label)).toBe(false);
    }
  });
});

// Representative hosts for the two branches, exercised via patternType (the
// build() input). 'grid' is a crossing-producing semantic host; 'flowfield' is
// an edge host. Spiral is covered separately below (its default role differs).
const SEMANTIC_HOST = 'grid';
const EDGE_HOST = 'flowfield';

describe.each(STARTER_CHIPS)('chip $id', (chip) => {
  it('is engine-valid on a SEMANTIC host: runSelectionChain does not throw', () => {
    const built = chip.build(SEMANTIC_HOST);
    expect(() => runSelectionChain(semanticAnchors(), built.binding.chain)).not.toThrow();
  });

  it('is engine-valid on an EDGE host: runSelectionChain does not throw', () => {
    const built = chip.build(EDGE_HOST);
    expect(() => runSelectionChain(edgeAnchors(), built.binding.chain)).not.toThrow();
  });

  it('any sequence block is terminal and at-most-one, on both host branches', () => {
    for (const patternType of [SEMANTIC_HOST, EDGE_HOST]) {
      const { binding } = chip.build(patternType);
      const { chain } = binding;
      // At most one sequence block total (chainEditor.hasSequence/sequenceIndex
      // model "at-most-one" by construction: sequenceIndex finds the FIRST; we
      // additionally verify no second one exists by filtering explicitly).
      const seqCount = chain.filter((b) => b.type === 'sequence').length;
      expect(seqCount).toBeLessThanOrEqual(1);
      if (hasSequence(chain)) {
        expect(sequenceIndex(chain)).toBe(chain.length - 1);
      }
    }
  });

  it('every glyphRef (base + slots) resolves to a BUILT-IN, no customGlyphs needed', () => {
    for (const patternType of [SEMANTIC_HOST, EDGE_HOST]) {
      const built = chip.build(patternType);
      expect(getGlyph(built.glyphRef)).toBeTruthy();
      expect(MOTIF_GLYPHS[built.glyphRef]).toBeTruthy();
      for (const block of built.binding.chain) {
        if (block.type === 'sequence') {
          for (const slot of block.slots) {
            if (slot.rest) continue;
            expect(getGlyph(slot.glyphRef)).toBeTruthy();
            expect(MOTIF_GLYPHS[slot.glyphRef]).toBeTruthy();
          }
        }
      }
    }
  });

  it('host-aware output: semantic branch never offers closed/picked route scope', () => {
    const built = chip.build(SEMANTIC_HOST);
    expect(built.anchorMode).toBe('semantic');
    const route = built.binding.chain.find((b) => b.type === 'route');
    expect(route).toBeTruthy();
    expect(route.roles).toEqual(['crossing']); // grid produces crossing
    expect(['all', 'open']).toContain(route.pathScope);
  });

  it('host-aware output: edge branch uses edge roles + anchorMode', () => {
    const built = chip.build(EDGE_HOST);
    expect(built.anchorMode).toBe('edge');
    const route = built.binding.chain.find((b) => b.type === 'route');
    expect(route).toBeTruthy();
    expect(route.roles).toEqual(['edge']);
    expect(['all', 'open', 'closed']).toContain(route.pathScope);
  });

  it('createMotifParams/normalizeBinding round-trip keeps .chain (C1 chain-form)', () => {
    for (const patternType of [SEMANTIC_HOST, EDGE_HOST]) {
      const built = chip.build(patternType);
      const params = createMotifParams(built);
      expect(Array.isArray(params.binding.chain)).toBe(true);
      expect(params.binding.chain).toEqual(built.binding.chain);
      expect(params.binding.selection).toBeUndefined();
      expect(params.glyphRef).toBe(built.glyphRef);
      expect(params.anchorMode).toBe(built.anchorMode);
    }
  });
});

// --- chip-specific chain content (the actual pattern each chip should produce) --

// Regression (issue: dead-default role on spiral): a chip landing on a DEFAULT
// spiral must route to a role the spiral actually produces. The spiral extractor
// emits no `crossing` hub under the app default innerRadius (5) — its only live
// semantic roles are `edge`/`tip` — so the blanket `crossing` default placed
// nothing. defaultRolesForHost('spiral') → ['edge'], so every chip now selects a
// live role on a spiral host. Mirrors the addMotif fix in Inspector.jsx.
describe('spiral host — chip route defaults to a LIVE role, not the dead crossing', () => {
  it.each(STARTER_CHIPS)('chip $id: spiral → edge roles, semantic anchorMode', (chip) => {
    const built = chip.build('spiral');
    expect(built.anchorMode).toBe('semantic'); // spiral is still a semantic host
    const route = built.binding.chain.find((b) => b.type === 'route');
    expect(route).toBeTruthy();
    expect(route.roles).toEqual(['edge']);
    expect(route.roles).not.toContain('crossing'); // the pre-fix dead default
  });

  it('every chip PLACES on a default-spiral-shaped anchor set (edge role, open arms)', () => {
    // edgeAnchors mirrors a default spiral's live anchors: `edge` role, open
    // paths (meta.closed:false) — exactly what a spiral's arc-length samples are.
    // A chip that still required `crossing` would place ZERO here.
    for (const chip of STARTER_CHIPS) {
      const built = chip.build('spiral');
      const { survivors } = runSelectionChain(edgeAnchors(), built.binding.chain);
      expect(survivors.length).toBeGreaterThan(0);
    }
  });
});

describe('alternate-xo chip', () => {
  it('is a cycle sequence [glyph, rest]', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'alternate-xo').build('grid');
    const seq = binding.chain.find((b) => b.type === 'sequence');
    expect(seq.mode).toBe('cycle');
    expect(seq.slots).toHaveLength(2);
    expect(seq.slots[0].rest).not.toBe(true);
    expect(seq.slots[0].glyphRef).toBeTruthy();
    expect(seq.slots[1].rest).toBe(true);
  });
});

describe('vine chip', () => {
  it('is a cycle sequence [rosette, leaf, leaf]', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'vine').build('grid');
    const seq = binding.chain.find((b) => b.type === 'sequence');
    expect(seq.mode).toBe('cycle');
    expect(seq.slots.map((s) => s.glyphRef)).toEqual(['rosette', 'leaf', 'leaf']);
  });

  // Vine alternation (design 2026-07): consecutive leaves alternate sides of the
  // host line — the SECOND leaf is turned 180° so the vine reads leaf-above,
  // leaf-below. `rotationOffset` is in DEGREES (placementEngine adds it to the
  // degree-valued rotation; see placementEngine.test.js "path policy uses normal
  // (rotation = deg(normal) + offset)"), so a half-turn is exactly 180.
  it('turns the SECOND leaf slot 180° (first leaf unrotated)', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'vine').build('grid');
    const seq = binding.chain.find((b) => b.type === 'sequence');
    // slots = [rosette, leaf, leaf-180]; the two leaves are slots[1] and slots[2].
    expect(seq.slots[1].glyphRef).toBe('leaf');
    expect(seq.slots[1].rotationOffset ?? 0).toBe(0); // first leaf: no turn
    expect(seq.slots[2].glyphRef).toBe('leaf');
    expect(seq.slots[2].rotationOffset).toBe(180); // second leaf: half-turn
  });

  it('integration: the two placed leaves rotate a half-turn (π) apart on a host line', () => {
    // Run the vine chain through the SELECT → RESOLVE seam (the real placement
    // path) and confirm the alternation survives to concrete placement rotations.
    // Three crossing anchors (grid route roles=['crossing']) on one path, spaced
    // wide so proportional sizing places all three: cycle deals rosette, leaf,
    // leaf-180 in order.
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'vine').build('grid');
    const anchors = [0, 100, 200].map((x, i) => mkAnchor('crossing', x, 0, `c${i}`));
    const { survivors, sequence } = runSelectionChain(anchors, binding.chain);
    const { placements } = resolvePlacements(survivors, { ...binding.placement, sequence });

    const leaves = placements.filter((p) => p.glyphRef === 'leaf');
    expect(leaves).toHaveLength(2);
    // Rotations differ by π (180°), mod 2π (360°): leaf-above vs leaf-below.
    const diff = (((leaves[1].rotation - leaves[0].rotation) % 360) + 360) % 360;
    expect(diff).toBeCloseTo(180, 9);
  });
});

describe('sparse-scatter chip', () => {
  it('has a density block <1 and a single (non-sequenced) glyph', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'sparse-scatter').build('grid');
    expect(hasSequence(binding.chain)).toBe(false);
    const density = binding.chain.find((b) => b.type === 'density');
    expect(density).toBeTruthy();
    expect(density.density).toBeLessThan(1);
    expect(density.density).toBeGreaterThan(0);
  });
});

describe('border-march chip', () => {
  it('has a route block + everyN and a single (non-sequenced) glyph', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'border-march').build('grid');
    expect(hasSequence(binding.chain)).toBe(false);
    const route = binding.chain.find((b) => b.type === 'route');
    const everyN = binding.chain.find((b) => b.type === 'everyN');
    expect(route).toBeTruthy();
    expect(everyN).toBeTruthy();
    expect(everyN.n).toBeGreaterThan(1);
  });

  it('places anchors on an OPEN edge host (flowfield-shaped streamlines)', () => {
    const built = STARTER_CHIPS.find((c) => c.id === 'border-march').build('flowfield');
    const { survivors } = runSelectionChain(edgeAnchors(), built.binding.chain);
    // Every fixture anchor has meta.closed:false (open streamlines); a chip
    // that silently required 'closed' scope would place ZERO anchors here.
    expect(survivors.length).toBeGreaterThan(0);
  });
});
