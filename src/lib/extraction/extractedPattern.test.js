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

  it('round-trips a lattice when present (S1 forward-compat)', () => {
    const lattice = { t1: [30, 0], t2: [0, 30], type: 'square' };
    const e = makeExtractedPattern({ title: 'l', tile: TILE, lattice });
    const back = deserializeExtractedPattern(serializeExtractedPattern(e));
    expect(back.lattice).toEqual(lattice);
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
