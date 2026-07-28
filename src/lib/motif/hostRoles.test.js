// The single host→roles capability seam (#146 creates it, #144 makes the Route
// UI consume it, #154 owns the rest of module E). Every "the Route block offers
// X and no other role on <host>" criterion in PRD #143 resolves through this one
// function, and no consumer may re-derive the answer with its own conditional —
// two surfaces that disagree about what a host emits is a silent bug: the maker
// picks a role, the placement set comes back empty, and nothing explains why.

import { describe, it, expect } from 'vitest';
import { rolesForHost, ALL_ROLES } from './hostRoles.js';

describe('rolesForHost', () => {
  it('exposes the four anchor roles in a stable canonical order', () => {
    expect(ALL_ROLES).toEqual(['crossing', 'edge', 'tip', 'cell']);
  });

  it('offers Cells and NO OTHER ROLE on Circle Packing', () => {
    expect(rolesForHost('circlepacking')).toEqual(['cell']);
    expect(rolesForHost('circlepacking', { render: 'nested' })).toEqual(['cell']);
  });

  it('leaves the existing semantic hosts exactly as they are today (#154 narrows them)', () => {
    // Narrowing voronoi (dead Tips) and spiral (dead Cells) is #154's criteria,
    // not this ticket's. Asserting the CURRENT set here is what makes that a
    // deliberate later change rather than an accidental one now.
    expect(rolesForHost('grid')).toEqual([...ALL_ROLES]);
    expect(rolesForHost('recursive')).toEqual([...ALL_ROLES]);
    expect(rolesForHost('voronoi')).toEqual([...ALL_ROLES]);
    expect(rolesForHost('spiral')).toEqual([...ALL_ROLES]);
  });

  it('is params-aware — a single-axis grid offers Edges alone', () => {
    expect(rolesForHost('grid', { drawVertical: 1, drawHorizontal: 0 })).toEqual(['edge']);
    expect(rolesForHost('grid', { drawVertical: 0, drawHorizontal: 1 })).toEqual(['edge']);
    expect(rolesForHost('grid', { drawVertical: 1, drawHorizontal: 1 })).toEqual([...ALL_ROLES]);
  });

  it('a single-axis grid collapses to edges on PARTIAL params too (the other axis defaults on)', () => {
    expect(rolesForHost('grid', { drawHorizontal: 0 })).toEqual(['edge']);
    expect(rolesForHost('grid', { drawVertical: 0 })).toEqual(['edge']);
  });

  it('omitting params keeps the by-type answer (single-arg back-compat)', () => {
    expect(rolesForHost('grid')).toEqual([...ALL_ROLES]);
  });

  it('offers Edges alone on every pre-existing native edge host', () => {
    for (const t of [
      'flowfield', 'wave', 'spirograph', 'topographic',
      'phyllodash', 'diffgrowth', 'dendrite',
    ]) {
      expect(rolesForHost(t)).toEqual(['edge']);
    }
  });

  // #144 — Radial Etch, Hilbert and Lissajous emit ONLY captured polylines, so
  // `edge` is the only anchor role that exists on them.
  describe('#144 — the three new record-mode capture hosts offer Edges and nothing else', () => {
    for (const type of ['radialetch', 'hilbert', 'lissajous']) {
      it(`${type} → ['edge']`, () => {
        expect(rolesForHost(type)).toEqual(['edge']);
        expect(rolesForHost(type, {})).toEqual(['edge']);
        // Params can't widen it: these hosts emit captured polylines only.
        expect(rolesForHost(type, { symmetry: 5, startAngle: 90 })).toEqual(['edge']);
      });
    }
  });

  it('offers nothing on a pattern that is not a motif host', () => {
    // NOTE: the answer for a non-host is `[]`, NOT the `['edge']` universal
    // fallback #144 originally shipped. A Route offering Edges on a type that
    // hosts no motif at all is a plausible-looking wrong answer, and #154's
    // per-host tables must OVERRIDE this rather than assume they are extending a
    // non-empty one.
    expect(rolesForHost('moire')).toEqual([]);
    expect(rolesForHost('text')).toEqual([]);
    expect(rolesForHost(undefined)).toEqual([]);
  });

  it('returns a FRESH array — a caller mutating the result cannot corrupt the table', () => {
    const a = rolesForHost('circlepacking');
    a.push('tip');
    expect(rolesForHost('circlepacking')).toEqual(['cell']);
    const b = rolesForHost('grid');
    b.length = 0;
    expect(rolesForHost('grid')).toEqual([...ALL_ROLES]);
  });
});
