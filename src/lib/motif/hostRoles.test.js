// The single host→roles capability seam (#146 creates it, #144 makes the Route
// UI consume it, #154 owns the rest of module E). Every "the Route block offers
// X and no other role on <host>" criterion in PRD #143 resolves through this one
// function, and no consumer may re-derive the answer with its own conditional —
// two surfaces that disagree about what a host emits is a silent bug: the maker
// picks a role, the placement set comes back empty, and nothing explains why.

import { describe, it, expect } from 'vitest';
import { rolesForHost, ALL_ROLES } from './hostRoles.js';
import { hostAvailability } from './hostCapability.js';
import { MOTIF_HOSTS } from './hostKinds.js';

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

  // ── the roles ↔ availability composition (#145 reconciled into #144) ───────
  // rolesForHost CONSULTS hostAvailability: an unavailable host emits no
  // geometry, so it emits no roles. hostCapability keeps the human-readable
  // `reason`; this function is the single entry point for the option set.
  describe('an UNAVAILABLE host emits no roles at all', () => {
    it('chladni at non-blank params is a normal edge host', () => {
      expect(rolesForHost('chladni')).toEqual(['edge']); // registry defaults m=4 n=3
      expect(rolesForHost('chladni', { m: 4, n: 3, blend: 0 })).toEqual(['edge']);
      expect(rolesForHost('chladni', { m: 11, n: 12 })).toEqual(['edge']);
    });

    it('chladni on a blank plate offers NOTHING — equal first pair', () => {
      expect(rolesForHost('chladni', { m: 4, n: 4 })).toEqual([]);
      expect(rolesForHost('chladni', { m: 4, n: 4, blend: 0.5, m2: 5, n2: 5 })).toEqual([]);
    });

    it('chladni on a blank plate offers NOTHING — full blend, equal second pair', () => {
      expect(rolesForHost('chladni', { m: 4, n: 3, blend: 1, m2: 5, n2: 5 })).toEqual([]);
    });

    it('does NOT implement #145 criterion 2 literally: an equal FIRST pair at full blend still paints', () => {
      // At blend 1 the first pair's coefficient (1-w) is exactly 0, so m === n
      // is irrelevant — the plate is good (32 captured contours, measured on the
      // real pattern in hostCapability.test.js). A literal reading of the ticket
      // would black this out.
      expect(rolesForHost('chladni', { m: 4, n: 4, blend: 1, m2: 5, n2: 2 })).toEqual(['edge']);
      // …and one slider step below full blend the first pair is live again.
      expect(rolesForHost('chladni', { m: 4, n: 3, blend: 0.99, m2: 5, n2: 5 })).toEqual(['edge']);
    });

    it('agrees with hostAvailability on every case, and leaves the REASON to it', () => {
      const cases = [
        { m: 4, n: 3, blend: 0 },
        { m: 4, n: 4, blend: 0 },
        { m: 4, n: 4, blend: 1, m2: 5, n2: 2 },
        { m: 4, n: 3, blend: 1, m2: 5, n2: 5 },
        { m: 1, n: 2 },
      ];
      for (const params of cases) {
        const { available, reason } = hostAvailability('chladni', params);
        expect(rolesForHost('chladni', params), JSON.stringify(params))
          .toEqual(available ? ['edge'] : []);
        // The copy lives in ONE place and stays reachable when roles are empty.
        if (!available) expect(typeof reason).toBe('string');
      }
    });

    it('the availability consult changes NOTHING for any ungated host', () => {
      // Every motif host but chladni is ungated, so folding availability into
      // this function must be invisible to all of them — including at params
      // that would blank a Chladni.
      for (const type of MOTIF_HOSTS) {
        if (type === 'chladni') continue;
        expect(rolesForHost(type, { m: 4, n: 4, blend: 1, m2: 5, n2: 5 }), type)
          .toEqual(rolesForHost(type, {}));
      }
    });
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
