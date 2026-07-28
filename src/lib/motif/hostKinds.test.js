import { describe, it, expect } from 'vitest';
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
import { PATTERN_CLASSES } from '../patterns/index.js';

describe('hostKinds', () => {
  it('keeps the four legacy semantic hosts, plus circlepacking (#146)', () => {
    expect([...SEMANTIC_MOTIF_HOSTS].sort()).toEqual(
      ['grid', 'recursive', 'spiral', 'voronoi', 'circlepacking'].sort()
    );
  });

  it('names the STASH hosts — the ones whose geometry is captured at generate()', () => {
    // A stash host is seed-driven and not reconstructible from params, so
    // resolveMotifHost must forward its harvested geometry. The probe is a single
    // boolean, so a stash host must NOT also be an edge host.
    expect([...STASH_MOTIF_HOSTS].sort()).toEqual(['circlepacking', 'voronoi'].sort());
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

  it('every edge-host key resolves to a real registered PatternClass', () => {
    for (const type of EDGE_MOTIF_HOSTS) {
      expect(PATTERN_CLASSES[type], `unknown patternType "${type}"`).toBeTruthy();
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
