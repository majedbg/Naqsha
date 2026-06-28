import { describe, it, expect } from 'vitest';
import { resolveAppearance } from './resolveAppearance.js';
import {
  ARCHETYPE_NAMES,
  ARCHETYPE_DEFAULTS,
  getArchetypeDefaults,
} from './materialArchetypes.js';
import { DEFAULT_PREVIEW_MATERIALS, materialSheetHex } from '../materialPreview.js';

// materialSheetHex normalises hex INPUTS to lowercase but returns its neutral /
// named-color fallbacks verbatim (some are uppercase) — so accept either case.
const HEX_RE = /^#[0-9a-f]{6}$/i;

// ── The real corpus (§3.3): 7 in-code DEFAULT_PREVIEW_MATERIALS + 46 seed rows ──
// from supabase/migrations/20250101000006_materials_catalog_seed.sql. ALL seed
// rows are type='acrylic'; every row's `name` is `<thickness>in <finish> Cast
// Acrylic` and its `color` is the finish text. We reconstruct them here from the
// authoritative finish × thickness grid so the fixture proves inference against
// the EXACT strings the DB ships.

// finish → expected archetype (the "it works" proof for every seed finish).
const SEED_FINISH_ARCHETYPE = {
  'Clear Colorless': 'clear-acrylic',
  'White Opaque': 'opaque-acrylic',
  'Black Opaque': 'opaque-acrylic',
  'White Translucent': 'translucent-acrylic',
  'Silver Mirror': 'mirror-acrylic',
  'Gold Mirror': 'mirror-acrylic',
  'Rose Gold Mirror': 'mirror-acrylic',
  'Frosted Satin Ice': 'translucent-acrylic',
  'Aura Iridescent': 'pearlescent-acrylic',
  'Fire Tortoise Shell Pearl': 'pearlescent-acrylic',
};

// 10 finishes × 4 thin gauges = 40, plus 3 popular finishes × 2 heavy = 6 → 46.
const THIN_GAUGES = ['1/16in', '1/8in', '3/16in', '1/4in'];
const HEAVY_GAUGES = ['3/8in', '1/2in'];
const HEAVY_FINISHES = ['Clear Colorless', 'White Opaque', 'Black Opaque'];

function buildSeedCorpus() {
  const rows = [];
  for (const finish of Object.keys(SEED_FINISH_ARCHETYPE)) {
    for (const g of THIN_GAUGES) {
      rows.push({
        name: `${g} ${finish} Cast Acrylic`,
        type: 'acrylic',
        color: finish,
        expected: SEED_FINISH_ARCHETYPE[finish],
      });
    }
  }
  for (const finish of HEAVY_FINISHES) {
    for (const g of HEAVY_GAUGES) {
      rows.push({
        name: `${g} ${finish} Cast Acrylic`,
        type: 'acrylic',
        color: finish,
        expected: SEED_FINISH_ARCHETYPE[finish],
      });
    }
  }
  return rows;
}

const SEED_CORPUS = buildSeedCorpus();

// The 7 in-code DEFAULT_PREVIEW_MATERIALS, with their expected archetypes.
const DEFAULT_EXPECTED = {
  'green-fluorescent': 'fluorescent-acrylic',
  clear: 'clear-acrylic',
  'turquoise-opaque': 'opaque-acrylic',
  'blue-translucent': 'translucent-acrylic',
  'gotham-black-pearl': 'pearlescent-acrylic',
  'birch-plywood': 'wood',
  'walnut-plywood': 'wood',
};

describe('resolveAppearance — corpus shape sanity', () => {
  it('the seed fixture is exactly 46 rows', () => {
    expect(SEED_CORPUS).toHaveLength(46);
  });
  it('DEFAULT_PREVIEW_MATERIALS is the 7 in-code rows', () => {
    expect(DEFAULT_PREVIEW_MATERIALS).toHaveLength(7);
  });
});

describe('resolveAppearance — 53-material corpus inference', () => {
  for (const row of SEED_CORPUS) {
    it(`seed "${row.name}" → ${row.expected}`, () => {
      const a = resolveAppearance(row);
      expect(a.archetype).toBe(row.expected);
    });
  }

  for (const m of DEFAULT_PREVIEW_MATERIALS) {
    it(`default "${m.name}" (${m.id}) → ${DEFAULT_EXPECTED[m.id]}`, () => {
      const a = resolveAppearance(m);
      expect(a.archetype).toBe(DEFAULT_EXPECTED[m.id]);
    });
  }

  it('ZERO known materials fall through to the opaque-tinted default', () => {
    const all = [...SEED_CORPUS, ...DEFAULT_PREVIEW_MATERIALS];
    const fellThrough = all.filter((m) => resolveAppearance(m).archetype === 'opaque-tinted');
    expect(fellThrough).toEqual([]);
  });

  it('every resolved appearance is a complete, valid AppearanceParams', () => {
    for (const m of [...SEED_CORPUS, ...DEFAULT_PREVIEW_MATERIALS]) {
      const a = resolveAppearance(m);
      expect(ARCHETYPE_NAMES).toContain(a.archetype);
      expect(a.tintHex).toMatch(HEX_RE);
      expect(typeof a.transmission).toBe('number');
      expect(typeof a.roughness).toBe('number');
      expect(typeof a.metalness).toBe('number');
      expect(typeof a.edgeGain).toBe('number');
    }
  });
});

describe('resolveAppearance — tint sourced from materialSheetHex', () => {
  it('uses the material sheet hex for tint (in-code green-fluorescent)', () => {
    const fluor = DEFAULT_PREVIEW_MATERIALS.find((m) => m.id === 'green-fluorescent');
    const a = resolveAppearance(fluor);
    expect(a.tintHex).toBe(materialSheetHex(fluor));
    expect(a.tintHex).toBe('#e6e954');
  });
  it('reflects an explicit hex on a material', () => {
    const a = resolveAppearance({ name: 'Blue Translucent', type: 'acrylic', hex: '#123456' });
    expect(a.tintHex).toBe('#123456');
    expect(a.archetype).toBe('translucent-acrylic');
  });
});

describe('resolveAppearance — inference ordering (specificity)', () => {
  it('"Black Opaque" hits opaque, not a color/default rule', () => {
    expect(resolveAppearance({ name: 'Black Opaque', type: 'acrylic' }).archetype).toBe('opaque-acrylic');
  });
  it('"Frosted Satin Ice" → translucent (not clear)', () => {
    expect(resolveAppearance({ name: 'Frosted Satin Ice', type: 'acrylic' }).archetype).toBe('translucent-acrylic');
  });
  it('"Fire Tortoise Shell Pearl" → pearlescent (tortoise/pearl before opaque/translucent)', () => {
    expect(resolveAppearance({ name: 'Fire Tortoise Shell Pearl', type: 'acrylic' }).archetype).toBe('pearlescent-acrylic');
  });
  it('"Aura Iridescent" → pearlescent', () => {
    expect(resolveAppearance({ name: 'Aura Iridescent', type: 'acrylic' }).archetype).toBe('pearlescent-acrylic');
  });
  it('case-insensitive name matching', () => {
    expect(resolveAppearance({ name: 'gold MIRROR plate', type: 'acrylic' }).archetype).toBe('mirror-acrylic');
  });
  it('fluorescent wins over everything', () => {
    expect(resolveAppearance({ name: 'Green Fluorescent', type: 'acrylic' }).archetype).toBe('fluorescent-acrylic');
  });
});

describe('resolveAppearance — type fallback (no finish keyword)', () => {
  it('a bare acrylic with no finish keyword → translucent-acrylic', () => {
    expect(resolveAppearance({ name: 'Mystery Sheet', type: 'acrylic' }).archetype).toBe('translucent-acrylic');
  });
  it('a plywood type with no wood keyword in the name → wood', () => {
    expect(resolveAppearance({ name: 'House Stock 4', type: 'plywood' }).archetype).toBe('wood');
  });
});

describe('resolveAppearance — explicit archetype path', () => {
  it('honors an explicit valid archetype over name inference', () => {
    const a = resolveAppearance({ name: 'Clear Colorless', type: 'acrylic', archetype: 'mirror-acrylic' });
    expect(a.archetype).toBe('mirror-acrylic');
    expect(a.metalness).toBe(getArchetypeDefaults('mirror-acrylic').metalness);
  });
  it('merges material.appearance overrides on top of registry defaults', () => {
    const a = resolveAppearance({
      name: 'Custom',
      type: 'acrylic',
      archetype: 'clear-acrylic',
      appearance: { transmission: 0.42, edgeGain: 2.5 },
    });
    expect(a.archetype).toBe('clear-acrylic');
    expect(a.transmission).toBe(0.42);
    expect(a.edgeGain).toBe(2.5);
    // untouched defaults survive the merge
    expect(a.roughness).toBe(getArchetypeDefaults('clear-acrylic').roughness);
  });
  it('an INVALID explicit archetype falls through to inference', () => {
    const a = resolveAppearance({ name: 'Silver Mirror', type: 'acrylic', archetype: 'not-a-real-archetype' });
    expect(a.archetype).toBe('mirror-acrylic');
  });
  it('appearance overrides do not mutate the frozen registry', () => {
    resolveAppearance({ name: 'x', type: 'acrylic', archetype: 'clear-acrylic', appearance: { transmission: 0.01 } });
    expect(ARCHETYPE_DEFAULTS['clear-acrylic'].transmission).toBe(0.95);
  });
});

describe('resolveAppearance — default / degenerate input', () => {
  it('null/undefined material → safe opaque-tinted default', () => {
    expect(resolveAppearance(null).archetype).toBe('opaque-tinted');
    expect(resolveAppearance(undefined).archetype).toBe('opaque-tinted');
    expect(resolveAppearance(null).tintHex).toMatch(HEX_RE);
  });
  it('a truly-unknown non-acrylic material → opaque-tinted', () => {
    expect(resolveAppearance({ name: 'Brushed Steel', type: 'metal' }).archetype).toBe('opaque-tinted');
  });
  it('returns a fresh object (no shared reference to registry)', () => {
    const a = resolveAppearance({ name: 'Clear', type: 'acrylic' });
    a.transmission = -999;
    expect(ARCHETYPE_DEFAULTS['clear-acrylic'].transmission).toBe(0.95);
  });
});
