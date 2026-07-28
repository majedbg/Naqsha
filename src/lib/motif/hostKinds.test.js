import { describe, it, expect } from 'vitest';
// Side-effect: registers the built-in extras (Hilbert / Lissajous / Chladni /
// Truchet) into the DYNAMIC pattern registry, exactly as main.jsx does at app
// boot. Those patterns are NOT in the static PATTERN_CLASSES map, so a host-set
// test that resolved through the static map alone would report a real, working
// host as "unknown". Resolve through getPatternClass — the same static-then-
// dynamic seam useCanvas's probe uses (useCanvas.js ~L259).
import '../registerBuiltinExtras.js';
import {
  SEMANTIC_MOTIF_HOSTS,
  EDGE_MOTIF_HOSTS,
  MOTIF_HOSTS,
  STASH_MOTIF_HOSTS,
  isSemanticHost,
  isEdgeHost,
  isMotifHost,
  isStashHost,
  defaultRolesForHost,
} from './hostKinds.js';
import { getPatternClass } from '../patterns/index.js';
import { rolesForHost } from './hostRoles.js';

describe('hostKinds', () => {
  it('keeps the four legacy semantic hosts, plus circlepacking (#146) and modulegrid (#151)', () => {
    expect([...SEMANTIC_MOTIF_HOSTS].sort()).toEqual(
      ['grid', 'recursive', 'spiral', 'voronoi', 'circlepacking', 'modulegrid'].sort()
    );
  });

  it('names the STASH hosts — the ones whose geometry is captured at generate()', () => {
    // A stash host is seed-driven and not reconstructible from params, so
    // resolveMotifHost must forward its harvested geometry. The probe is a single
    // boolean, so a stash host must NOT also be an edge host.
    expect([...STASH_MOTIF_HOSTS].sort()).toEqual(
      ['circlepacking', 'voronoi', 'modulegrid'].sort()
    );
    for (const t of STASH_MOTIF_HOSTS) {
      expect(SEMANTIC_MOTIF_HOSTS.has(t)).toBe(true);
      expect(EDGE_MOTIF_HOSTS.has(t)).toBe(false);
      expect(isStashHost(t)).toBe(true);
    }
    expect(isStashHost('grid')).toBe(false);
    expect(isStashHost('flowfield')).toBe(false);
  });

  it('circlepacking defaults to the cell role', () => {
    expect(defaultRolesForHost('circlepacking')).toEqual(['cell']);
  });

  it('modulegrid defaults to the cell role (#151)', () => {
    // A CELL-ONLY host with no DEFAULT_SEMANTIC_ROLE entry falls back to 'edge',
    // which defaultMotifAddOpts writes into binding.selection.roles — the first
    // motif then renders no glyphs and no dots while every other test passes.
    expect(defaultRolesForHost('modulegrid')).toEqual(['cell']);
  });

  it('every STASH host declares a DEFAULT role it actually emits', () => {
    // The silent-failure guard, stated once for the whole set rather than per
    // host: no stash host may fall through to the blanket 'edge' default.
    for (const t of STASH_MOTIF_HOSTS) {
      const roles = defaultRolesForHost(t);
      expect([t, roles.length]).toEqual([t, 1]);
      expect([t, rolesForHost(t).includes(roles[0])]).toEqual([t, true]);
    }
  });

  it('every edge-host key resolves to a real registered PatternClass', () => {
    // getPatternClass, not PATTERN_CLASSES[type]: static built-ins live in the
    // map, self-registering extras (chladni, …) in the dynamic registry.
    for (const type of EDGE_MOTIF_HOSTS) {
      expect(getPatternClass(type), `unknown patternType "${type}"`).toBeTruthy();
    }
  });

  it('semantic and edge sets are disjoint', () => {
    for (const t of EDGE_MOTIF_HOSTS) expect(SEMANTIC_MOTIF_HOSTS.has(t)).toBe(false);
  });

  it('MOTIF_HOSTS is the union of both sets', () => {
    expect(MOTIF_HOSTS.size).toBe(SEMANTIC_MOTIF_HOSTS.size + EDGE_MOTIF_HOSTS.size);
    for (const t of SEMANTIC_MOTIF_HOSTS) expect(MOTIF_HOSTS.has(t)).toBe(true);
    for (const t of EDGE_MOTIF_HOSTS) expect(MOTIF_HOSTS.has(t)).toBe(true);
  });

  it('classifier predicates agree with the sets', () => {
    expect(isSemanticHost('grid')).toBe(true);
    expect(isSemanticHost('flowfield')).toBe(false);
    expect(isEdgeHost('flowfield')).toBe(true);
    expect(isEdgeHost('grid')).toBe(false);
    expect(isMotifHost('voronoi')).toBe(true);
    expect(isMotifHost('flowfield')).toBe(true);
    expect(isMotifHost('text')).toBe(false);
    expect(isMotifHost('import')).toBe(false);
  });

  // #144 — Radial Etch, Hilbert and Lissajous become EDGE hosts. All three draw
  // with the operations capturePolylines folds (radialetch: ctx.line rays;
  // hilbert/lissajous: one beginShape+vertex run) and all three reseed
  // randomSeed+noiseSeed at the top of generate(), which are the two conditions
  // the module header states for membership.
  describe('#144 — the three new record-mode capture hosts', () => {
    for (const type of ['radialetch', 'hilbert', 'lissajous']) {
      it(`${type} is an EDGE host, a motif host, and NOT semantic`, () => {
        expect(EDGE_MOTIF_HOSTS.has(type)).toBe(true);
        expect(isEdgeHost(type)).toBe(true);
        expect(isEdgeHost(type, {})).toBe(true);
        expect(isSemanticHost(type)).toBe(false);
        expect(isSemanticHost(type, {})).toBe(false);
        expect(isMotifHost(type)).toBe(true);
        expect(SEMANTIC_MOTIF_HOSTS.has(type)).toBe(false);
      });

      it(`${type} defaults a fresh motif to the edge role only`, () => {
        expect(defaultRolesForHost(type)).toEqual(['edge']);
      });
    }

    // PRD #143: Truchet emits CELLS as well as edges and must come through the
    // geometry stash. The probe is a single boolean (record OR stash, never
    // both), so putting Truchet in the edge set would silently cost it the cell
    // role. This guard is here so a later ticket cannot add it by reflex.
    it('does NOT add Truchet — its edge role comes from the stash, not capture', () => {
      expect(EDGE_MOTIF_HOSTS.has('truchet')).toBe(false);
      expect(isEdgeHost('truchet')).toBe(false);
      expect(isMotifHost('truchet')).toBe(false);
    });

    // Chladni arrived in #145, immediately after this slice. Membership here is
    // by-type and unconditional — the mechanism is edge capture whatever the
    // params. Its blank-plate EMPTINESS is a separate question, answered by
    // hostAvailability (hostCapability.js) and surfaced through rolesForHost.
    it('Chladni IS an edge host (#145), and by-type membership is unconditional', () => {
      expect(EDGE_MOTIF_HOSTS.has('chladni')).toBe(true);
      expect(isEdgeHost('chladni')).toBe(true);
      // Even at the blank-plate params: the CLASSIFIER does not gate.
      expect(isEdgeHost('chladni', { m: 4, n: 4 })).toBe(true);
      expect(isMotifHost('chladni')).toBe(true);
      expect(SEMANTIC_MOTIF_HOSTS.has('chladni')).toBe(false);
    });

    it('leaves the seven pre-existing edge hosts untouched', () => {
      for (const type of [
        'flowfield', 'wave', 'spirograph', 'topographic',
        'phyllodash', 'diffgrowth', 'dendrite',
      ]) {
        expect(EDGE_MOTIF_HOSTS.has(type), `lost edge host "${type}"`).toBe(true);
      }
      // …and adds nothing beyond the three of #144 plus chladni (#145).
      expect(EDGE_MOTIF_HOSTS.size).toBe(11);
    });
  });

  describe('params-aware isEdgeHost — single-axis grid', () => {
    it('a two-axis grid (default / both drawn) is NOT an edge host', () => {
      expect(isEdgeHost('grid', {})).toBe(false); // defaults: both axes drawn
      expect(isEdgeHost('grid', { drawVertical: 1, drawHorizontal: 1 })).toBe(false);
    });

    it('a columns-only grid (drawHorizontal 0) IS an edge host', () => {
      expect(isEdgeHost('grid', { drawHorizontal: 0 })).toBe(true);
    });

    it('a rows-only grid (drawVertical 0) IS an edge host', () => {
      expect(isEdgeHost('grid', { drawVertical: 0 })).toBe(true);
    });

    it('a grid with NEITHER axis drawn is NOT an edge host (nothing to sample)', () => {
      expect(isEdgeHost('grid', { drawVertical: 0, drawHorizontal: 0 })).toBe(false);
    });

    it('uses the >=0.5 draw gate, matching Grid.js', () => {
      expect(isEdgeHost('grid', { drawVertical: 1, drawHorizontal: 0.4 })).toBe(true); // h off
      expect(isEdgeHost('grid', { drawVertical: 0.6, drawHorizontal: 0.6 })).toBe(false); // both on
    });

    it('omitting params keeps pure by-type behaviour (byte-identical single-arg)', () => {
      expect(isEdgeHost('grid')).toBe(false);
      expect(isEdgeHost('flowfield')).toBe(true);
    });

    it('single-axis logic applies ONLY to grid, not other semantic hosts', () => {
      expect(isEdgeHost('recursive', { drawHorizontal: 0 })).toBe(false);
      expect(isEdgeHost('voronoi', { drawVertical: 0 })).toBe(false);
    });
  });

  describe('params-aware isSemanticHost — the complement for grid', () => {
    it('a single-axis grid is NOT semantic (routes through edge capture)', () => {
      expect(isSemanticHost('grid', { drawHorizontal: 0 })).toBe(false);
      expect(isSemanticHost('grid', { drawVertical: 0 })).toBe(false);
    });

    it('a two-axis grid IS semantic', () => {
      expect(isSemanticHost('grid', {})).toBe(true);
      expect(isSemanticHost('grid', { drawVertical: 1, drawHorizontal: 1 })).toBe(true);
    });

    it('single-arg stays semantic for grid (back-compat for by-type callers)', () => {
      // defaultBinding/starterChips call by type alone; the render-time edge
      // override + coerceEdgeRoles fix a grid that later goes single-axis, so the
      // by-type answer is intentionally the two-axis default.
      expect(isSemanticHost('grid')).toBe(true);
    });

    it('is the exact complement of isEdgeHost for a grid (never both, never neither for one axis)', () => {
      for (const params of [{}, { drawHorizontal: 0 }, { drawVertical: 0 }]) {
        // Exactly one of the two is true (except the both-off degenerate case).
        expect(isSemanticHost('grid', params)).toBe(!isEdgeHost('grid', params));
      }
    });

    it('non-grid semantic hosts are unaffected by params', () => {
      expect(isSemanticHost('spiral', { drawHorizontal: 0 })).toBe(true);
      expect(isSemanticHost('voronoi', { drawVertical: 0 })).toBe(true);
      expect(isSemanticHost('flowfield', {})).toBe(false);
    });
  });
});
