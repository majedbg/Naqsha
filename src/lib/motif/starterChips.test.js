import { describe, it, expect } from 'vitest';
import { STARTER_CHIPS } from './starterChips.js';
import { runSelectionChain } from './chain.js';
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
});

describe.each(STARTER_CHIPS)('chip $id', (chip) => {
  it('is engine-valid on a SEMANTIC host: runSelectionChain does not throw', () => {
    const built = chip.build(true);
    expect(() => runSelectionChain(semanticAnchors(), built.binding.chain)).not.toThrow();
  });

  it('is engine-valid on an EDGE host: runSelectionChain does not throw', () => {
    const built = chip.build(false);
    expect(() => runSelectionChain(edgeAnchors(), built.binding.chain)).not.toThrow();
  });

  it('any sequence block is terminal and at-most-one, on both host branches', () => {
    for (const hostIsSemantic of [true, false]) {
      const { binding } = chip.build(hostIsSemantic);
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
    for (const hostIsSemantic of [true, false]) {
      const built = chip.build(hostIsSemantic);
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
    const built = chip.build(true);
    expect(built.anchorMode).toBe('semantic');
    const route = built.binding.chain.find((b) => b.type === 'route');
    expect(route).toBeTruthy();
    expect(route.roles).toEqual(['crossing']);
    expect(['all', 'open']).toContain(route.pathScope);
  });

  it('host-aware output: edge branch uses edge roles + anchorMode', () => {
    const built = chip.build(false);
    expect(built.anchorMode).toBe('edge');
    const route = built.binding.chain.find((b) => b.type === 'route');
    expect(route).toBeTruthy();
    expect(route.roles).toEqual(['edge']);
    expect(['all', 'open', 'closed']).toContain(route.pathScope);
  });

  it('createMotifParams/normalizeBinding round-trip keeps .chain (C1 chain-form)', () => {
    for (const hostIsSemantic of [true, false]) {
      const built = chip.build(hostIsSemantic);
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

describe('alternate-xo chip', () => {
  it('is a cycle sequence [glyph, rest]', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'alternate-xo').build(true);
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
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'vine').build(true);
    const seq = binding.chain.find((b) => b.type === 'sequence');
    expect(seq.mode).toBe('cycle');
    expect(seq.slots.map((s) => s.glyphRef)).toEqual(['rosette', 'leaf', 'leaf']);
  });
});

describe('sparse-scatter chip', () => {
  it('has a density block <1 and a single (non-sequenced) glyph', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'sparse-scatter').build(true);
    expect(hasSequence(binding.chain)).toBe(false);
    const density = binding.chain.find((b) => b.type === 'density');
    expect(density).toBeTruthy();
    expect(density.density).toBeLessThan(1);
    expect(density.density).toBeGreaterThan(0);
  });
});

describe('border-march chip', () => {
  it('has a route block + everyN and a single (non-sequenced) glyph', () => {
    const { binding } = STARTER_CHIPS.find((c) => c.id === 'border-march').build(true);
    expect(hasSequence(binding.chain)).toBe(false);
    const route = binding.chain.find((b) => b.type === 'route');
    const everyN = binding.chain.find((b) => b.type === 'everyN');
    expect(route).toBeTruthy();
    expect(everyN).toBeTruthy();
    expect(everyN.n).toBeGreaterThan(1);
  });

  it('places anchors on an OPEN edge host (flowfield-shaped streamlines)', () => {
    const built = STARTER_CHIPS.find((c) => c.id === 'border-march').build(false);
    const { survivors } = runSelectionChain(edgeAnchors(), built.binding.chain);
    // Every fixture anchor has meta.closed:false (open streamlines); a chip
    // that silently required 'closed' scope would place ZERO anchors here.
    expect(survivors.length).toBeGreaterThan(0);
  });
});
