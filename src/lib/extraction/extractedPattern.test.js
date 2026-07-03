// ExtractedPattern domain entity + serializer (S0, issue #49).
//
// The entity is the single shape every surface shares: the stepper produces
// it, LibraryRepository persists it (serialize → unified user_patterns row),
// and ExtractedPatternGenerator renders it. Tests cover external behavior:
// construction defaults, serialize → record shape, and a full round-trip that
// must preserve geometry, fabrication role tags, dimensions, and lattice.

import { describe, it, expect } from 'vitest';
import {
  makeExtractedPattern,
  serializeExtractedPattern,
  deserializeExtractedPattern,
} from './extractedPattern';

const TILE = {
  width: 60,
  height: 40,
  fills: [
    { d: 'M20 20 l20 0 0 20 -20 0Z', role: 'engrave' },
    { d: 'M5 5 l4 0 0 4 -4 0Z', role: 'cut' },
  ],
  strokes: [],
};

// S7 (issue #56): a valid square lattice, for symmetry-bearing entries.
const LATTICE_S = {
  t1: [30, 0],
  t2: [0, 30],
  cell: { width: 30, height: 30 },
  type: 'square',
  confidence: 0.82,
};

// S6 (issue #55): tile carrying centerline strokes alongside fills.
const MIXED_TILE = {
  width: 80,
  height: 60,
  fills: [{ d: 'M20 20 l20 0 0 20 -20 0Z', role: 'engrave' }],
  strokes: [
    { d: 'M10.5 30.5 L69.5 30.5', role: 'score' },
    { d: 'M40 10 L40 50 Z', role: 'cut' },
  ],
};

describe('makeExtractedPattern', () => {
  it('creates an entity with extracted-source defaults', () => {
    const e = makeExtractedPattern({ title: 'Uppsala vault', tile: TILE });
    expect(e.source).toBe('extracted');
    expect(e.visibility).toBe('private'); // locked decision: private scaffold
    expect(e.lattice).toBeNull(); // S1 seam — single-motif floor for now
    expect(e.photoPath).toBeNull();
    expect(e.title).toBe('Uppsala vault');
    expect(e.patternId).toMatch(/^extracted-/);
    expect(e.tile).toEqual(TILE);
  });

  it('keeps an explicit patternId when given (reload path)', () => {
    const e = makeExtractedPattern({ patternId: 'extracted-abc', title: 't', tile: TILE });
    expect(e.patternId).toBe('extracted-abc');
  });

  it('rejects a tile with no geometry (guaranteed-floor guard)', () => {
    expect(() =>
      makeExtractedPattern({ title: 'empty', tile: { width: 10, height: 10, fills: [], strokes: [] } })
    ).toThrow(/geometry/i);
  });
});

describe('serializeExtractedPattern', () => {
  it('produces a unified user-pattern record', () => {
    const e = makeExtractedPattern({ title: 'Door panel', tile: TILE });
    const rec = serializeExtractedPattern(e);
    expect(rec.pattern_id).toBe(e.patternId);
    expect(rec.name).toBe('Door panel');
    expect(rec.source).toBe('extracted');
    expect(rec.visibility).toBe('private');
    expect(rec.tile_svg).toContain('viewBox="0 0 60 40"');
    expect(rec.tile_svg).toContain('M20 20 l20 0 0 20 -20 0Z');
    expect(rec.tile_svg).toContain('data-role="engrave"');
    expect(rec.tile_svg).toContain('data-role="cut"');
    // Role tags carried structurally too (locked decision 9), not only in markup.
    expect(rec.fabrication_tags).toEqual({ fills: ['engrave', 'cut'], strokes: [] });
    expect(rec.lattice).toBeNull();
  });
});

describe('round-trip', () => {
  it('deserialize(serialize(e)) preserves geometry, roles, dims, lattice', () => {
    const e = makeExtractedPattern({
      patternId: 'extracted-rt1',
      title: 'Round trip',
      tile: TILE,
      photoPath: 'user-1/extracted-rt1.png',
    });
    const back = deserializeExtractedPattern(serializeExtractedPattern(e));
    expect(back.patternId).toBe('extracted-rt1');
    expect(back.title).toBe('Round trip');
    expect(back.source).toBe('extracted');
    expect(back.visibility).toBe('private');
    expect(back.lattice).toBeNull();
    expect(back.photoPath).toBe('user-1/extracted-rt1.png');
    expect(back.tile).toEqual(TILE);
  });

  it('round-trips a lattice when present (S5, issue #54)', () => {
    const lattice = {
      t1: [30, 0],
      t2: [0, 30],
      cell: { width: 30, height: 30 },
      type: 'square',
      confidence: 0.82,
    };
    const e = makeExtractedPattern({ title: 'l', tile: TILE, lattice });
    const back = deserializeExtractedPattern(serializeExtractedPattern(e));
    expect(back.lattice).toEqual(lattice);
  });

  // S7 (issue #56): the wallpaper-group facet round-trips as a small jsonb
  // object, and — unlike lattice — a bad value is validate-and-nulled (dropped),
  // never thrown, so an entry is never lost to a bad facet.
  it('round-trips an auto symmetry classification (S7, issue #56)', () => {
    const symmetry = { group: 'p4m', confidence: 0.91, source: 'auto' };
    const e = makeExtractedPattern({ title: 's', tile: TILE, lattice: LATTICE_S, symmetry });
    const rec = serializeExtractedPattern(e);
    expect(rec.symmetry).toEqual(symmetry);
    expect(deserializeExtractedPattern(rec).symmetry).toEqual(symmetry);
  });

  it('round-trips a manual symmetry override (S7)', () => {
    const symmetry = { group: 'p6', confidence: 1, source: 'manual' };
    const e = makeExtractedPattern({ title: 's', tile: TILE, lattice: LATTICE_S, symmetry });
    expect(deserializeExtractedPattern(serializeExtractedPattern(e)).symmetry).toEqual(symmetry);
  });

  it('defaults symmetry to null (single-motif floor / no lattice)', () => {
    const e = makeExtractedPattern({ title: 's', tile: TILE });
    expect(e.symmetry).toBeNull();
    expect(serializeExtractedPattern(e).symmetry).toBeNull();
  });

  it.each([
    ['non-whitelisted name', { group: 'p7', confidence: 0.9, source: 'auto' }],
    ['markup-crafted name', { group: '<script>', confidence: 1, source: 'auto' }],
    ['wrong case', { group: 'P4M', confidence: 1, source: 'auto' }],
    ['missing group', { confidence: 0.5, source: 'auto' }],
  ])('drops a bad symmetry (%s) to null on construction AND deserialize', (_l, symmetry) => {
    const e = makeExtractedPattern({ title: 'x', tile: TILE, lattice: LATTICE_S, symmetry });
    expect(e.symmetry).toBeNull();
    const goodRow = serializeExtractedPattern(makeExtractedPattern({ title: 'x', tile: TILE }));
    expect(deserializeExtractedPattern({ ...goodRow, symmetry }).symmetry).toBeNull();
  });

  it('round-trips an oblique lattice with fractional vectors (S5)', () => {
    const lattice = {
      t1: [26.5, 2],
      t2: [9, 24.25],
      cell: { width: 35.5, height: 26.25 },
      type: 'oblique',
      confidence: 0.5,
    };
    const e = makeExtractedPattern({ title: 'o', tile: TILE, lattice });
    const back = deserializeExtractedPattern(serializeExtractedPattern(e));
    expect(back.lattice).toEqual(lattice);
  });

  // Stored rows are attacker-writable: a malformed lattice must throw at BOTH
  // choke points — construction and deserialize — with the same corrupt-row
  // discipline as path data. These numbers drive tiling loops and transform
  // attributes, so NaN/injection/collinear shapes are rejected outright.
  it.each([
    ['NaN vector', { t1: [NaN, 0], t2: [0, 30], cell: { width: 30, height: 30 }, type: 'square', confidence: 1 }],
    ['injection string', { t1: ['"/><script>', 0], t2: [0, 30], cell: { width: 30, height: 30 }, type: 'square', confidence: 1 }],
    ['collinear basis', { t1: [30, 0], t2: [60, 0], cell: { width: 30, height: 30 }, type: 'square', confidence: 1 }],
    ['legacy partial shape (no cell/confidence)', { t1: [30, 0], t2: [0, 30], type: 'square' }],
  ])('rejects a malformed lattice (%s) on construction and deserialize', (_label, lattice) => {
    expect(() => makeExtractedPattern({ title: 'x', tile: TILE, lattice })).toThrow(/lattice/i);
    const goodRow = serializeExtractedPattern(makeExtractedPattern({ title: 'x', tile: TILE }));
    expect(() => deserializeExtractedPattern({ ...goodRow, lattice })).toThrow(/lattice/i);
  });

  // S6 (issue #55): centerline strokes must survive the row round-trip with
  // their role tags, emitted as stroked (never filled) paths.
  it('round-trips centerline strokes with role tags (S6)', () => {
    const e = makeExtractedPattern({ title: 'Tracery', tile: MIXED_TILE });
    const rec = serializeExtractedPattern(e);
    expect(rec.fabrication_tags).toEqual({
      fills: ['engrave'],
      strokes: ['score', 'cut'],
    });
    // Canonical markup: strokes are single stroked paths, not filled outlines.
    const strokePaths = rec.tile_svg
      .split('\n')
      .filter((l) => l.includes('data-kind="stroke"'));
    expect(strokePaths).toHaveLength(2);
    for (const p of strokePaths) {
      expect(p).toContain('fill="none"');
      expect(p).toContain('stroke="#000"');
    }
    expect(rec.tile_svg).toContain('data-role="score"');

    const back = deserializeExtractedPattern(rec);
    expect(back.tile).toEqual(MIXED_TILE);
  });

  it('accepts a strokes-only tile (pure line-work motif)', () => {
    const tile = { width: 10, height: 10, fills: [], strokes: [{ d: 'M1 1 L9 9', role: 'score' }] };
    const e = makeExtractedPattern({ title: 'line', tile });
    const back = deserializeExtractedPattern(serializeExtractedPattern(e));
    expect(back.tile).toEqual(tile);
  });

  it('deserializes a raw DB row (id/name columns, jsonb already parsed)', () => {
    const rec = serializeExtractedPattern(
      makeExtractedPattern({ patternId: 'extracted-db', title: 'DB row', tile: TILE })
    );
    // Simulate the extra columns a select returns.
    const row = { ...rec, id: 'uuid-1', user_id: 'user-9', created_at: '2026-07-01' };
    const back = deserializeExtractedPattern(row);
    expect(back.patternId).toBe('extracted-db');
    expect(back.tile.fills).toHaveLength(2);
  });
});

// S8 (issue #57): optional capture metadata rides the entity and round-trips
// through the row. Unlike tile/lattice (which THROW → row skipped), a bad
// location/date/camera is validate-and-nulled so a good pattern never dies.
describe('capture metadata (S8)', () => {
  const LOCATION = {
    lat: 59.8586,
    lng: 17.6389,
    placeName: 'Uppsala, Sweden',
    address: 'Uppsala Cathedral, Sweden',
    source: 'exif',
  };

  it('defaults metadata to null when absent', () => {
    const e = makeExtractedPattern({ title: 't', tile: TILE });
    expect(e.location).toBeNull();
    expect(e.captureDate).toBeNull();
    expect(e.exif).toBeNull();
  });

  it('round-trips location + capture date + camera through the row', () => {
    const e = makeExtractedPattern({
      title: 'Uppsala vault',
      tile: TILE,
      location: LOCATION,
      captureDate: '2026-06-28T12:32:10.000Z',
      exif: { camera: 'Apple iPhone 15 Pro' },
    });
    const rec = serializeExtractedPattern(e);
    expect(rec.location).toEqual(LOCATION);
    expect(rec.capture_date).toBe('2026-06-28T12:32:10.000Z');
    expect(rec.exif).toEqual({ camera: 'Apple iPhone 15 Pro' });

    const back = deserializeExtractedPattern(rec);
    expect(back.location).toEqual(LOCATION);
    expect(back.captureDate).toBe('2026-06-28T12:32:10.000Z');
    expect(back.exif).toEqual({ camera: 'Apple iPhone 15 Pro' });
  });

  it('round-trips a place-only manual location (no coordinates)', () => {
    const e = makeExtractedPattern({
      title: 't',
      tile: TILE,
      location: { placeName: 'A carved door', source: 'manual' },
    });
    const back = deserializeExtractedPattern(serializeExtractedPattern(e));
    expect(back.location).toEqual({
      lat: null,
      lng: null,
      placeName: 'A carved door',
      address: null,
      source: 'manual',
    });
  });

  it('validate-and-nulls a corrupt location WITHOUT throwing (keeps the entry)', () => {
    const goodRow = serializeExtractedPattern(makeExtractedPattern({ title: 't', tile: TILE }));
    const back = deserializeExtractedPattern({
      ...goodRow,
      location: { lat: 999, lng: 999, placeName: '\x00\x1b', source: 'laser' },
    });
    // Nothing meaningful survived → location null, but the pattern is intact.
    expect(back.location).toBeNull();
    expect(back.tile.fills).toHaveLength(2);
  });

  it('nulls a bad capture date on a row without discarding the pattern', () => {
    const goodRow = serializeExtractedPattern(makeExtractedPattern({ title: 't', tile: TILE }));
    const back = deserializeExtractedPattern({ ...goodRow, capture_date: 'garbage' });
    expect(back.captureDate).toBeNull();
    expect(back.tile.fills).toHaveLength(2);
  });
});

// Adversarial-review finding 1 (stored-markup injection): a crafted
// user_patterns row must never round-trip active markup back into the app.
// Deserialization REJECTS rows whose pattern_id / path data / roles fall
// outside their strict shapes — loadAndRegisterExtractedPatterns treats the
// throw as a corrupt row and skips it.
describe('deserializeExtractedPattern — crafted-row hardening', () => {
  const baseRow = () =>
    serializeExtractedPattern(
      makeExtractedPattern({ patternId: 'extracted-safe', title: 'ok', tile: TILE })
    );

  it('rejects a row whose path data smuggles markup through entity unescaping', () => {
    // Stored (escaped) payload that unescapeAttr would turn back into raw
    // `"><script>` inside the d string.
    const row = {
      ...baseRow(),
      tile_svg:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">\n' +
        '  <path d="M0 0Z&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;" data-kind="fill" data-role="engrave" fill="#000"/>\n' +
        '</svg>',
    };
    expect(() => deserializeExtractedPattern(row)).toThrow(/path data/i);
  });

  it('rejects a row whose d contains raw event-handler characters', () => {
    const row = {
      ...baseRow(),
      tile_svg:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">\n' +
        '  <path d="M0 0Z onload=alert(1)" data-kind="fill" data-role="engrave" fill="#000"/>\n' +
        '</svg>',
    };
    expect(() => deserializeExtractedPattern(row)).toThrow(/path data/i);
  });

  it('rejects an unknown data-role (attribute injection vector)', () => {
    const row = {
      ...baseRow(),
      tile_svg:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">\n' +
        '  <path d="M0 0Z" data-kind="fill" data-role="engrave&quot; onload=&quot;alert(1)" fill="#000"/>\n' +
        '</svg>',
      fabrication_tags: null,
    };
    expect(() => deserializeExtractedPattern(row)).toThrow(/role/i);
  });

  it('rejects a malicious role smuggled through fabrication_tags (authoritative source)', () => {
    const row = {
      ...baseRow(),
      fabrication_tags: { fills: ['engrave" onload="alert(1)', 'cut'], strokes: [] },
    };
    expect(() => deserializeExtractedPattern(row)).toThrow(/role/i);
  });

  // S6: the same path-charset + role-whitelist discipline covers STROKES —
  // adding centerlines must not open a second injection surface.
  it('rejects a stroke whose path data smuggles markup', () => {
    const row = {
      ...baseRow(),
      tile_svg:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">\n' +
        '  <path d="M0 0 L5 5&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;" data-kind="stroke" data-role="score" fill="none" stroke="#000"/>\n' +
        '</svg>',
      fabrication_tags: { fills: [], strokes: ['score'] },
    };
    expect(() => deserializeExtractedPattern(row)).toThrow(/path data/i);
  });

  it('rejects a malicious STROKE role smuggled through fabrication_tags', () => {
    const rec = serializeExtractedPattern(
      makeExtractedPattern({ patternId: 'extracted-s6', title: 's', tile: MIXED_TILE })
    );
    const row = {
      ...rec,
      fabrication_tags: {
        fills: ['engrave'],
        strokes: ['score', 'cut" onload="alert(1)'],
      },
    };
    expect(() => deserializeExtractedPattern(row)).toThrow(/role/i);
  });

  it('rejects an unknown stroke data-role when fabrication_tags is absent', () => {
    const row = {
      ...baseRow(),
      tile_svg:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">\n' +
        '  <path d="M0 0 L5 5" data-kind="stroke" data-role="laser-pew" fill="none" stroke="#000"/>\n' +
        '</svg>',
      fabrication_tags: null,
    };
    expect(() => deserializeExtractedPattern(row)).toThrow(/role/i);
  });

  it('rejects a pattern_id outside the strict id shape', () => {
    const row = { ...baseRow(), pattern_id: 'x"><img src=x onerror=alert(1)>' };
    expect(() => deserializeExtractedPattern(row)).toThrow(/pattern_id/i);
  });

  it('ignores non-path markup (e.g. <script>) embedded in tile_svg', () => {
    const row = {
      ...baseRow(),
      tile_svg:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">\n' +
        '  <script>alert(1)</script>\n' +
        '  <path d="M0 0 L5 5Z" data-kind="fill" data-role="engrave" fill="#000"/>\n' +
        '</svg>',
    };
    const back = deserializeExtractedPattern(row);
    expect(back.tile.fills).toEqual([{ d: 'M0 0 L5 5Z', role: 'engrave' }]);
    expect(JSON.stringify(back.tile)).not.toContain('<');
  });
});

// S9 (issue #58): organization + provenance metadata + palette facet round-trip
// and validate-and-null hardening on the entity.
describe('ExtractedPattern — S9 provenance + palette metadata', () => {
  const META = {
    note: 'Vault rib crossing',
    favorite: true,
    tags: ['gothic', 'tracery'],
    collectionId: '123e4567-e89b-42d3-a456-426614174000',
    sourceType: 'in_person',
    material: 'stone',
    tradition: 'Gothic tracery',
    palette: [
      { hex: '#a08040', coverage: 0.6 },
      { hex: '#101010', coverage: 0.4 },
    ],
  };

  it('carries all metadata onto the entity, normalized', () => {
    const e = makeExtractedPattern({ title: 't', tile: TILE, ...META });
    expect(e.note).toBe('Vault rib crossing');
    expect(e.favorite).toBe(true);
    expect(e.tags).toEqual(['gothic', 'tracery']);
    expect(e.collectionId).toBe(META.collectionId);
    expect(e.sourceType).toBe('in_person');
    expect(e.material).toBe('stone');
    expect(e.tradition).toBe('Gothic tracery');
    expect(e.palette).toEqual(META.palette);
  });

  it('defaults metadata to empty/null when omitted', () => {
    const e = makeExtractedPattern({ title: 't', tile: TILE });
    expect(e.note).toBeNull();
    expect(e.favorite).toBe(false);
    expect(e.tags).toEqual([]);
    expect(e.collectionId).toBeNull();
    expect(e.sourceType).toBeNull();
    expect(e.material).toBeNull();
    expect(e.tradition).toBeNull();
    expect(e.palette).toEqual([]);
  });

  it('serializes metadata to the migration-011 column names', () => {
    const row = serializeExtractedPattern(makeExtractedPattern({ title: 't', tile: TILE, ...META }));
    expect(row.note).toBe('Vault rib crossing');
    expect(row.favorite).toBe(true);
    expect(row.tags).toEqual(['gothic', 'tracery']);
    expect(row.collection_id).toBe(META.collectionId);
    expect(row.source_type).toBe('in_person');
    expect(row.material).toBe('stone');
    expect(row.tradition).toBe('Gothic tracery');
    expect(row.palette).toEqual(META.palette);
  });

  it('round-trips all metadata through serialize → deserialize', () => {
    const row = serializeExtractedPattern(makeExtractedPattern({ patternId: 'extracted-rt', title: 't', tile: TILE, ...META }));
    const back = deserializeExtractedPattern(row);
    expect(back.note).toBe(META.note);
    expect(back.favorite).toBe(true);
    expect(back.tags).toEqual(META.tags);
    expect(back.collectionId).toBe(META.collectionId);
    expect(back.sourceType).toBe(META.sourceType);
    expect(back.material).toBe(META.material);
    expect(back.tradition).toBe(META.tradition);
    expect(back.palette).toEqual(META.palette);
  });

  it('drops malformed palette / tags from an attacker-writable row without throwing', () => {
    const row = {
      ...serializeExtractedPattern(makeExtractedPattern({ patternId: 'extracted-bad', title: 't', tile: TILE })),
      palette: [{ hex: '#000"><script>', coverage: 1 }, { hex: '#00ff00', coverage: 0.5 }],
      tags: ['ok', 123, '<b>x</b>'],
      material: 'has spaces',
      favorite: 'yes',
    };
    const back = deserializeExtractedPattern(row);
    expect(back.palette).toEqual([{ hex: '#00ff00', coverage: 0.5 }]); // bad hex dropped
    expect(back.tags).toEqual(['ok', '<b>x</b>']); // non-string dropped, markup kept inert as text
    expect(back.material).toBeNull(); // invalid slug → null
    expect(back.favorite).toBe(false); // non-boolean → false
  });

  it('still deserializes a pre-S9 row (missing metadata columns)', () => {
    const row = serializeExtractedPattern(makeExtractedPattern({ patternId: 'extracted-old', title: 't', tile: TILE }));
    delete row.note;
    delete row.favorite;
    delete row.tags;
    delete row.palette;
    const back = deserializeExtractedPattern(row);
    expect(back.tags).toEqual([]);
    expect(back.palette).toEqual([]);
    expect(back.favorite).toBe(false);
  });
});
