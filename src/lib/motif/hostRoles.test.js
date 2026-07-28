// The single host→roles capability seam (#146 creates it; #154 owns the rest of
// module E). Every "the Route block offers X and no other role on <host>"
// criterion in PRD #143 resolves through this one function.

import { describe, it, expect } from 'vitest';
import { rolesForHost, ALL_ROLES } from './hostRoles.js';

describe('rolesForHost', () => {
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

  it('offers Edges alone on a native edge host', () => {
    for (const t of ['flowfield', 'wave', 'spirograph', 'topographic', 'dendrite']) {
      expect(rolesForHost(t)).toEqual(['edge']);
    }
  });

  it('offers nothing on a pattern that is not a motif host', () => {
    expect(rolesForHost('moire')).toEqual([]);
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
