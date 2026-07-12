import { describe, it, expect } from 'vitest';
import {
  SEMANTIC_MOTIF_HOSTS,
  EDGE_MOTIF_HOSTS,
  MOTIF_HOSTS,
  isSemanticHost,
  isEdgeHost,
  isMotifHost,
} from './hostKinds.js';
import { PATTERN_CLASSES } from '../patterns/index.js';

describe('hostKinds', () => {
  it('keeps the four legacy semantic hosts exactly', () => {
    expect([...SEMANTIC_MOTIF_HOSTS].sort()).toEqual(
      ['grid', 'recursive', 'spiral', 'voronoi'].sort()
    );
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
});
