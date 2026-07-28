// The WARP-CAPTURE CONTRACT as a declared pattern capability (#148, PRD #143).
//
// Before this ticket the contract was a private Set literal inside useCanvas
// (`WARP_CAPTURE_HOSTS = new Set(['grid','flowfield','topographic'])`). Chladni
// applies warp to its final contour vertices and was not in it, so a warped
// Chladni painted warped contours and captured unwarped ones. Moving the
// contract onto the pattern (a `static warpsDrawnGeometry` declaration) is what
// stops the next warp-applying host repeating the bug — but a refactor from a
// literal list to a declaration is exactly the change that can silently DROP a
// member, so the set is pinned here as an explicit truth table.
//
// The authority for the expected set is the source: a pattern warps its drawn
// geometry iff its generate() branches on `params.modulation.channel === 'warp'`.
// Grepping that predicate across src/lib/patterns finds exactly five —
// Grid.js:63, FlowField.js:70, TopographicContours.js:209, RecursiveGeometry.js:125
// (via recursiveSides) and extras/Chladni.js:185 — plus gridAnchors.js:102, which
// is Grid's anchor extractor reading the same flag, not a sixth pattern.

import { describe, it, expect } from 'vitest';
import '../registerBuiltinExtras.js'; // self-registers the extras (chladni, …)
import { patternWarpsDrawnGeometry } from './warpCapture.js';
import { EDGE_MOTIF_HOSTS, SEMANTIC_MOTIF_HOSTS } from './hostKinds.js';
import { getPatternClass } from '../patterns/index.js';

/**
 * Every pattern whose DRAWN geometry changes when it is handed a resolved warp
 * modulation. Written out literally — this is the truth table, not a derivation.
 */
const WARPS = new Set(['grid', 'flowfield', 'topographic', 'recursive', 'chladni']);

/** Every type this contract is ever asked about: both host families, plus guides. */
const ASKED = [
  ...EDGE_MOTIF_HOSTS,
  ...SEMANTIC_MOTIF_HOSTS,
  'grainfield', // a density consumer — modulated, but not in the warp channel
  'truchet',
  'girih',
];

describe('the warp-capture contract is a capability the pattern declares', () => {
  for (const type of new Set(ASKED)) {
    it(`${type}: declares warpsDrawnGeometry === ${WARPS.has(type)}`, () => {
      const PatternClass = getPatternClass(type);
      expect(PatternClass, `no PatternClass for "${type}"`).toBeTruthy();
      expect(patternWarpsDrawnGeometry(PatternClass)).toBe(WARPS.has(type));
    });
  }

  // The three the private list held. Named individually so a refactor that drops
  // one fails on a test whose NAME says which host regressed.
  for (const type of ['grid', 'flowfield', 'topographic']) {
    it(`${type} (an original WARP_CAPTURE_HOSTS member) still declares the capability`, () => {
      expect(patternWarpsDrawnGeometry(getPatternClass(type))).toBe(true);
    });
  }

  it('chladni declares it — the whole point of #148', () => {
    expect(patternWarpsDrawnGeometry(getPatternClass('chladni'))).toBe(true);
  });

  it('a missing / undeclared class is false, never a throw', () => {
    expect(patternWarpsDrawnGeometry(null)).toBe(false);
    expect(patternWarpsDrawnGeometry(undefined)).toBe(false);
    expect(patternWarpsDrawnGeometry(class Plain {})).toBe(false);
    // A truthy-but-not-true declaration must not count: the flag is a contract,
    // and a pattern that half-declares it is a bug, not an opt-in.
    expect(patternWarpsDrawnGeometry(class Half { static warpsDrawnGeometry = 1; })).toBe(false);
  });
});
