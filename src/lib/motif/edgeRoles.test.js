// coerceRoles — RENDER-TIME ROLE AVAILABILITY (#154, module E of PRD #143).
//
// The generalisation of `coerceEdgeRoles` from its single case (a grid that went
// single-axis) to every host: at RENDER, a Route block's stored roles are
// intersected with what the host actually emits. Nothing is ever written to the
// document — availability is derived, never migrated.
//
// ORDERING IS LOAD-BEARING and is asserted here rather than left to the
// implementation's shape, because `rolesForHost` returns `[]` for two DIFFERENT
// reasons (a host that is currently unavailable, e.g. a blank Chladni; and a type
// that is not a host at all) and the edge branch has to survive on its own gate:
//
//   1. edge branch FIRST, verbatim — `anchorMode === 'edge' || isEdgeHost(...)`
//   2. then `[]` from rolesForHost ⇒ leave the stored binding ALONE
//   3. then intersect; an empty intersection ⇒ defaultRolesForHost(type)

import { describe, it, expect } from 'vitest';
import { coerceEdgeRoles, coerceRoles } from './edgeRoles.js';

const route = (roles, extra = {}) => ({ type: 'route', roles, pathScope: 'all', ...extra });
const chainOf = (...blocks) => ({ chain: blocks });
const rolesOfChain = (b) => b.chain.filter((x) => x.type === 'route').map((x) => x.roles);

describe('coerceEdgeRoles is untouched by #154', () => {
  it('still un-bakes a stale semantic role to ["edge"] and leaves edge-safe roles alone', () => {
    expect(rolesOfChain(coerceEdgeRoles(chainOf(route(['crossing']))))).toEqual([['edge']]);
    const safe = chainOf(route(null));
    expect(coerceEdgeRoles(safe)).toBe(safe); // same reference — byte-identical no-op
    const edgeOnly = chainOf(route(['edge']));
    expect(coerceEdgeRoles(edgeOnly)).toBe(edgeOnly);
  });
});

describe('coerceRoles — the EDGE branch comes first, and verbatim', () => {
  it('anchorMode "edge" with NO host type still coerces (MotifPattern.test.js:449/:473)', () => {
    // The two long-standing pins drive edge mode with no hostPatternType at all.
    // If the edge branch were reached only through `isEdgeHost` — which is false
    // for `undefined` — those bindings would keep ['crossing'] against anchors
    // that are all role:'edge' and place NOTHING.
    const out = coerceRoles(chainOf(route(['crossing'])), { anchorMode: 'edge' });
    expect(rolesOfChain(out)).toEqual([['edge']]);
    const legacy = coerceRoles({ selection: { roles: ['crossing'] } }, { anchorMode: 'edge' });
    expect(legacy.selection.roles).toEqual(['edge']);
  });

  it('a SINGLE-AXIS grid takes the edge branch even in semantic anchorMode', () => {
    // The D1 case. The stored binding says ['crossing'] because the grid was
    // two-axis when the motif was made; the render routes it through edge
    // capture, where every anchor is role:'edge'.
    const out = coerceRoles(chainOf(route(['crossing'])), {
      type: 'grid',
      params: { drawHorizontal: 0 },
      anchorMode: 'semantic',
    });
    expect(rolesOfChain(out)).toEqual([['edge']]);
  });

  it('a native edge host takes the edge branch whatever the stored anchorMode says', () => {
    const out = coerceRoles(chainOf(route(['crossing', 'cell'])), {
      type: 'flowfield',
      anchorMode: 'semantic',
    });
    expect(rolesOfChain(out)).toEqual([['edge']]);
  });

  it('a MISSING anchorMode defaults to "edge" — the same `?? "edge"` MotifPattern applies', () => {
    // MotifPattern.js:86 reads `p.anchorMode ?? 'edge'`, so a motif whose params
    // carry no anchorMode renders in EDGE mode. Both call sites must agree, or
    // the overlay's dots and the drawn glyphs diverge on exactly those bindings.
    expect(rolesOfChain(coerceRoles(chainOf(route(['crossing'])), {}))).toEqual([['edge']]);
  });
});

describe('coerceRoles — an EMPTY availability answer never rewrites the stored roles', () => {
  it('a type that is not a motif host at all is left alone', () => {
    const stored = chainOf(route(['crossing']));
    expect(coerceRoles(stored, { type: 'moire', anchorMode: 'semantic' })).toBe(stored);
    expect(coerceRoles(stored, { type: undefined, anchorMode: 'semantic' })).toBe(stored);
  });

  it('the guard fires for the NOT-A-HOST meaning of [] — the only one reachable today', () => {
    // `rolesForHost` answers `[]` for two different reasons: the host is
    // currently UNAVAILABLE, and the type is not a host at all. The only
    // availability gate in the studio is Chladni's, and Chladni is an EDGE host —
    // so it is diverted by branch (1) before this guard is reached, and a blank
    // plate reads as ['edge'] against zero captured polylines, i.e. nothing.
    // Documented so the assertion above is not read as covering both meanings.
    expect(
      rolesOfChain(
        coerceRoles(chainOf(route(['crossing'])), {
          type: 'chladni',
          params: { m: 4, n: 4 },
          anchorMode: 'semantic',
        })
      )
    ).toEqual([['edge']]);
    // The guard's own job — a SEMANTIC-mode motif on a type that is not a host —
    // is the case asserted above, and it is what stops the render rewriting a
    // stored ['crossing'] to ['edge'] on an absent or unknown hostPatternType.
  });
});

describe('coerceRoles — a semantic host intersects, and falls back when nothing survives', () => {
  it('keeps the roles the host DOES emit and drops only the dead ones', () => {
    // Voronoi emits crossings, edges and cells; `tip` is dead at every seed.
    const out = coerceRoles(chainOf(route(['crossing', 'tip'])), {
      type: 'voronoi',
      anchorMode: 'semantic',
    });
    expect(rolesOfChain(out)).toEqual([['crossing']]);
  });

  it('an EMPTY intersection falls back to the host default role', () => {
    // The four reachable classes of PRD #143's accepted cost. Each renders BLANK
    // today and renders glyphs after this change.
    expect(
      rolesOfChain(coerceRoles(chainOf(route(['tip'])), { type: 'voronoi', anchorMode: 'semantic' }))
    ).toEqual([['crossing']]);
    expect(
      rolesOfChain(coerceRoles(chainOf(route(['cell'])), { type: 'spiral', anchorMode: 'semantic' }))
    ).toEqual([['edge']]);
    expect(
      rolesOfChain(
        coerceRoles(chainOf(route(['crossing', 'edge', 'tip'])), {
          type: 'circlepacking',
          anchorMode: 'semantic',
        })
      )
    ).toEqual([['cell']]);
    expect(
      rolesOfChain(
        coerceRoles(chainOf(route(['crossing', 'edge', 'tip'])), {
          type: 'modulegrid',
          anchorMode: 'semantic',
        })
      )
    ).toEqual([['cell']]);
  });

  it('roles:null stays null — all-pass is never narrowed into a filter', () => {
    const stored = chainOf(route(null));
    const out = coerceRoles(stored, { type: 'voronoi', anchorMode: 'semantic' });
    expect(out).toBe(stored);
    expect(rolesOfChain(out)).toEqual([null]);
  });

  it('a fully-live Route is returned by REFERENCE — byte-identical no-op', () => {
    const stored = chainOf(route(['crossing', 'edge']));
    expect(coerceRoles(stored, { type: 'voronoi', anchorMode: 'semantic' })).toBe(stored);
    const grid = chainOf(route(['crossing', 'edge', 'tip', 'cell']));
    expect(coerceRoles(grid, { type: 'grid', anchorMode: 'semantic' })).toBe(grid);
  });

  it('coerces EVERY route block in a chain, and touches no other block type', () => {
    const stored = chainOf(
      route(['tip']),
      { type: 'everyN', n: 2, offset: 0 },
      route(['crossing', 'tip'])
    );
    const out = coerceRoles(stored, { type: 'voronoi', anchorMode: 'semantic' });
    expect(rolesOfChain(out)).toEqual([['crossing'], ['crossing']]);
    expect(out.chain[1]).toBe(stored.chain[1]);
  });

  it('coerces a LEGACY selection binding the same way', () => {
    const out = coerceRoles(
      { selection: { roles: ['tip'] } },
      { type: 'voronoi', anchorMode: 'semantic' }
    );
    expect(out.selection.roles).toEqual(['crossing']);
  });
});

describe('coerceRoles — DERIVED AT RENDER, NEVER STORED (criterion 11)', () => {
  it('never mutates the binding it was given', () => {
    const stored = chainOf(route(['tip']));
    const snapshot = JSON.parse(JSON.stringify(stored));
    coerceRoles(stored, { type: 'voronoi', anchorMode: 'semantic' });
    expect(stored).toEqual(snapshot);
    expect(stored.chain[0].roles).toEqual(['tip']);
  });

  it('carries every other field of the binding through untouched', () => {
    const stored = {
      chain: [route(['tip'], { pickedPaths: [2, 5], bypass: true })],
      placement: { sizing: { mode: 'proportional', size: 12 } },
      overrides: { records: [{ ref: 'cell:0', hidden: true }] },
    };
    const out = coerceRoles(stored, { type: 'voronoi', anchorMode: 'semantic' });
    expect(out.placement).toBe(stored.placement);
    expect(out.overrides).toBe(stored.overrides);
    expect(out.chain[0].pickedPaths).toEqual([2, 5]);
    expect(out.chain[0].bypass).toBe(true);
  });

  it('tolerates a null / non-object binding', () => {
    expect(coerceRoles(null, { type: 'voronoi' })).toBe(null);
    expect(coerceRoles(undefined, { type: 'voronoi' })).toBe(undefined);
    expect(coerceRoles({}, { type: 'voronoi', anchorMode: 'semantic' })).toEqual({});
  });
});
