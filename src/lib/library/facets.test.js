// facets (S10, issue #59) — pure Library filtering + facet derivation.
// OR-within/AND-across, empty-state = identity, drill-down counts, and the
// location bucketing edges (coords-only entry must not disappear).

import { describe, it, expect } from 'vitest';
import { makeExtractedPattern } from '../extraction/extractedPattern';
import {
  filterEntries,
  entryMatches,
  entityFacetValues,
  deriveFacets,
  emptyFacetState,
  isFacetStateEmpty,
  LOCATION_LOCATED,
  LOCATION_NONE,
} from './facets';

const TILE = {
  width: 10,
  height: 10,
  fills: [{ d: 'M1 1 L9 1 L9 9 L1 9 Z', role: 'engrave' }],
  strokes: [],
};

// Build a store entry ({ entity, … }) with chosen facet fields.
function entry(id, fields = {}) {
  return {
    entity: makeExtractedPattern({ patternId: id, title: id, tile: TILE, ...fields }),
    photoURL: null,
    createdAt: 0,
  };
}

const sym = (group, extra = {}) => ({ symmetry: { group, confidence: 0.9, source: 'auto', ...extra } });
const pal = (...hexes) => ({ palette: hexes.map((hex) => ({ hex, coverage: 0.3 })) });

// A representative seeded set spanning every facet.
function seed() {
  return [
    entry('a', { ...sym('p4m'), tradition: 'Islamic', material: 'stone', tags: ['star', 'blue'], ...pal('#1e5fbf'), location: { placeName: 'Uppsala', lat: 59.8, lng: 17.6 } }),
    entry('b', { ...sym('p6m'), tradition: 'Gothic', material: 'glass', tags: ['rose'], ...pal('#d13438'), location: { placeName: 'Uppsala', lat: 59.8, lng: 17.6 } }),
    entry('c', { ...sym('p4m'), tradition: 'Islamic', material: 'wood', tags: ['star'], ...pal('#1e5fbf', '#d13438'), location: { lat: 10, lng: 10 } }),
    entry('d', {}), // bare: no facets at all
  ];
}

describe('entityFacetValues', () => {
  it('reads each facet off the entity', () => {
    const [a] = seed();
    expect(entityFacetValues(a.entity, 'symmetry')).toEqual(['p4m']);
    expect(entityFacetValues(a.entity, 'tradition')).toEqual(['Islamic']);
    expect(entityFacetValues(a.entity, 'material')).toEqual(['stone']);
    expect(entityFacetValues(a.entity, 'tags')).toEqual(['star', 'blue']);
    expect(entityFacetValues(a.entity, 'color')).toEqual(['blue']);
  });
  it('location: place name, then the located bucket, then none', () => {
    const [a, , c, d] = seed();
    expect(entityFacetValues(a.entity, 'location')).toEqual(['Uppsala']);
    expect(entityFacetValues(c.entity, 'location')).toEqual([LOCATION_LOCATED]); // coords-only
    expect(entityFacetValues(d.entity, 'location')).toEqual([LOCATION_NONE]);
  });
});

describe('filterEntries — empty state', () => {
  it('an empty facetState is the identity', () => {
    const entries = seed();
    expect(filterEntries(entries, emptyFacetState())).toBe(entries);
    expect(isFacetStateEmpty(emptyFacetState())).toBe(true);
  });
});

describe('filterEntries — single facet', () => {
  const entries = seed();
  it('symmetry', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), symmetry: ['p4m'] }).map((e) => e.entity.patternId)).toEqual(['a', 'c']);
  });
  it('material', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), material: ['glass'] }).map((e) => e.entity.patternId)).toEqual(['b']);
  });
  it('tags', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), tags: ['star'] }).map((e) => e.entity.patternId)).toEqual(['a', 'c']);
  });
  it('color (binned)', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), color: ['blue'] }).map((e) => e.entity.patternId)).toEqual(['a', 'c']);
  });
  it('tradition', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), tradition: ['Gothic'] }).map((e) => e.entity.patternId)).toEqual(['b']);
  });
  it('location place name', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), location: ['Uppsala'] }).map((e) => e.entity.patternId)).toEqual(['a', 'b']);
  });
  it('location "located" bucket catches the coords-only entry', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), location: [LOCATION_LOCATED] }).map((e) => e.entity.patternId)).toEqual(['c']);
  });
  it('location "none" bucket', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), location: [LOCATION_NONE] }).map((e) => e.entity.patternId)).toEqual(['d']);
  });
});

describe('filterEntries — OR within, AND across', () => {
  const entries = seed();
  it('OR within a facet (two symmetry groups)', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), symmetry: ['p4m', 'p6m'] }).map((e) => e.entity.patternId)).toEqual(['a', 'b', 'c']);
  });
  it('AND across facets (p4m AND wood → only c)', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), symmetry: ['p4m'], material: ['wood'] }).map((e) => e.entity.patternId)).toEqual(['c']);
  });
  it('AND across facets with an OR leg (blue AND (Islamic OR Gothic))', () => {
    expect(
      filterEntries(entries, { ...emptyFacetState(), color: ['blue'], tradition: ['Islamic', 'Gothic'] }).map((e) => e.entity.patternId)
    ).toEqual(['a', 'c']);
  });
  it('zero-result combination', () => {
    expect(filterEntries(entries, { ...emptyFacetState(), material: ['glass'], tags: ['star'] })).toEqual([]);
  });
});

describe('entryMatches', () => {
  it('missing facetState → matches', () => {
    expect(entryMatches(seed()[0].entity, null)).toBe(true);
  });
});

describe('deriveFacets — values, counts, hidden empties', () => {
  it('derives every non-empty facet with full-store counts (no selection)', () => {
    const facets = deriveFacets(seed());
    const byKey = Object.fromEntries(facets.map((f) => [f.key, f]));
    expect(byKey.symmetry.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'p4m', count: 2 }),
        expect.objectContaining({ value: 'p6m', count: 1 }),
      ])
    );
    expect(byKey.material.values.map((v) => v.value).sort()).toEqual(['glass', 'stone', 'wood']);
    // color chips carry a swatch; blue appears on a + c.
    const blue = byKey.color.values.find((v) => v.value === 'blue');
    expect(blue).toMatchObject({ count: 2, label: 'Blue' });
    expect(blue.swatch).toMatch(/^#/);
    // material label is humanised from the slug.
    expect(byKey.material.values.find((v) => v.value === 'stone').label).toBe('Stone');
  });

  it('hides a facet with no values (no entry carries it)', () => {
    // None of these entries has a symmetry group.
    const entries = [entry('x', { material: 'stone' }), entry('y', { material: 'wood' })];
    const keys = deriveFacets(entries).map((f) => f.key);
    expect(keys).toContain('material');
    expect(keys).not.toContain('symmetry');
    expect(keys).not.toContain('color');
  });

  it('hides the location facet when nothing has a location', () => {
    const entries = [entry('x', { material: 'stone' })];
    expect(deriveFacets(entries).map((f) => f.key)).not.toContain('location');
  });

  it('shows the location facet (incl. "No location") once ≥1 entry is located', () => {
    const loc = deriveFacets(seed()).find((f) => f.key === 'location');
    const vals = Object.fromEntries(loc.values.map((v) => [v.value, v]));
    expect(vals['Uppsala'].count).toBe(2);
    expect(vals[LOCATION_LOCATED].label).toBe('Located');
    expect(vals[LOCATION_NONE].label).toBe('No location');
    // "No location" sorts last.
    expect(loc.values[loc.values.length - 1].value).toBe(LOCATION_NONE);
  });

  it('flags a soft (hiddenRotation) symmetry value', () => {
    const entries = [
      entry('s1', sym('p4m', { hiddenRotation: true })),
      entry('s2', sym('p6m')),
    ];
    const symFacet = deriveFacets(entries).find((f) => f.key === 'symmetry');
    expect(symFacet.values.find((v) => v.value === 'p4m').soft).toBe(true);
    expect(symFacet.values.find((v) => v.value === 'p6m').soft).toBeUndefined();
  });
});

describe('deriveFacets — drill-down counts', () => {
  it("a facet's counts reflect OTHER active facets", () => {
    const entries = seed();
    // Filter to Islamic. Material counts should now reflect only a + c.
    const state = { ...emptyFacetState(), tradition: ['Islamic'] };
    const facets = deriveFacets(entries, state);
    const material = facets.find((f) => f.key === 'material');
    const mvals = Object.fromEntries(material.values.map((v) => [v.value, v.count]));
    expect(mvals).toEqual({ stone: 1, wood: 1 }); // glass (b, Gothic) is gone
  });

  it("a facet's OWN selection does NOT shrink its OWN value list", () => {
    const entries = seed();
    // Select material=glass. The material facet must still offer stone + wood
    // (so you can OR them back in), not collapse to just glass.
    const state = { ...emptyFacetState(), material: ['glass'] };
    const material = deriveFacets(entries, state).find((f) => f.key === 'material');
    expect(material.values.map((v) => v.value).sort()).toEqual(['glass', 'stone', 'wood']);
    expect(material.values.find((v) => v.value === 'glass').selected).toBe(true);
  });

  it('keeps a selected value visible even when other facets zero it out', () => {
    const entries = seed();
    // tradition=Gothic (only b) AND material selection of wood (b is glass) →
    // wood is now count 0 but must remain, marked selected, to be de-selectable.
    const state = { ...emptyFacetState(), tradition: ['Gothic'], material: ['wood'] };
    const material = deriveFacets(entries, state).find((f) => f.key === 'material');
    const wood = material.values.find((v) => v.value === 'wood');
    expect(wood).toMatchObject({ count: 0, selected: true });
  });
});
