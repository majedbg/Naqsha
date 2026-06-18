// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers';
import { autoLayerName } from './autoLayerName';
import { migrateLayer } from './migration';
import { DEFAULT_PARAMS, PATTERN_SYMBOLS } from '../constants';

// WI-1 — Layer model: auto-naming + nameIsCustom + locked + migration + duplicate.
// Desktop-only. No undo exists anywhere in this app.

function setup({ maxLayers } = {}) {
  return renderHook(() => useLayers({ persistToLocal: false, maxLayers }));
}

// A non-moiré switch patch, like usePatternCache would produce.
function switchPatch(patternType) {
  return {
    patternType,
    params: { ...(DEFAULT_PARAMS[patternType] || {}) },
    randomizeKeys: [],
    paramsCache: {},
  };
}

describe('autoLayerName helper', () => {
  it('returns Pattern (<symbol>) for a type that has a PATTERN_SYMBOLS symbol', () => {
    expect(autoLayerName('spirograph')).toBe('Pattern (Sg)');
    expect(autoLayerName('lissajous')).toBe('Pattern (Ls)');
    // symbol present → index is ignored
    expect(autoLayerName('spirograph', 5)).toBe('Pattern (Sg)');
  });

  it('falls back to Layer N (index+1) for a symbol-less type', () => {
    // 'import' and 'ai-foo' have NO symbol in PATTERN_SYMBOLS.
    expect(PATTERN_SYMBOLS.import).toBeUndefined();
    expect(autoLayerName('import', 0)).toBe('Layer 1');
    expect(autoLayerName('ai-foo', 2)).toBe('Layer 3');
  });

  it('falls back gracefully when index is omitted for a symbol-less type', () => {
    // No symbol, no index → still a stable Layer N (not "Layer undefined").
    expect(autoLayerName('ai-foo')).toBe('Layer 1');
  });
});

describe('createLayer auto-naming + new fields', () => {
  it('new pattern layers default to Pattern (<symbol>) and carry nameIsCustom:false, locked:false', () => {
    const { result } = setup();
    const layer = result.current.layers[0];
    // persistToLocal:false → first layer is index 0 → spirograph (Sg).
    expect(layer.patternType).toBe('spirograph');
    expect(layer.name).toBe('Pattern (Sg)');
    expect(layer.nameIsCustom).toBe(false);
    expect(layer.locked).toBe(false);
  });

  it('addLayer of a requested type gets the matching auto-name + fields', () => {
    const { result } = setup({ maxLayers: 6 });
    act(() => result.current.addLayer('lissajous'));
    const added = result.current.layers[result.current.layers.length - 1];
    expect(added.patternType).toBe('lissajous');
    expect(added.name).toBe('Pattern (Ls)');
    expect(added.nameIsCustom).toBe(false);
    expect(added.locked).toBe(false);
  });

  it('allows two Pattern (Sg) layers to coexist (NO auto-indexing)', () => {
    const { result } = setup({ maxLayers: 6 });
    act(() => result.current.addLayer('spirograph'));
    const names = result.current.layers
      .filter((l) => l.patternType === 'spirograph')
      .map((l) => l.name);
    expect(names.filter((n) => n === 'Pattern (Sg)').length).toBeGreaterThanOrEqual(2);
  });
});

describe('moiré spawn path — new fields', () => {
  it('Moiré A and B keep their deliberate names but get nameIsCustom:false, locked:false', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, switchPatch('moire')));
    const [a, b] = result.current.layers;
    expect(a.name).toBe('Moiré A');
    expect(b.name).toBe('Moiré B');
    expect(a.nameIsCustom).toBe(false);
    expect(b.nameIsCustom).toBe(false);
    expect(a.locked).toBe(false);
    expect(b.locked).toBe(false);
  });

  it('Moiré A gets nameIsCustom:false EXPLICITLY even when source was custom-renamed', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    // Simulate a manual rename (the rename handler itself is a later WI; here we
    // set the field directly as a generic setter to construct the state).
    act(() => result.current.updateLayer(id, { name: 'My Spiro', nameIsCustom: true }));
    expect(result.current.layers[0].nameIsCustom).toBe(true);
    act(() => result.current.changeLayerPattern(id, switchPatch('moire')));
    const a = result.current.layers.find((l) => l.moireRole === 'A');
    expect(a.name).toBe('Moiré A');
    expect(a.nameIsCustom).toBe(false);
    expect(a.locked).toBe(false);
  });
});

describe('addImportedLayer — new fields, name stays Imported N', () => {
  // Minimal valid SVG with one path so parseSVGImport succeeds.
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10"/></svg>';

  it('imported layer keeps Imported N name and carries nameIsCustom:false, locked:false', () => {
    const { result } = setup({ maxLayers: 6 });
    let res;
    act(() => { res = result.current.addImportedLayer(SVG); });
    expect(res.ok).toBe(true);
    const imported = result.current.layers.find((l) => l.patternType === 'import');
    expect(imported).toBeTruthy();
    expect(imported.name).toMatch(/^Imported \d+$/);
    expect(imported.nameIsCustom).toBe(false);
    expect(imported.locked).toBe(false);
  });
});

describe('pattern-switch router recompute', () => {
  it('switching patternType when nameIsCustom:false recomputes the auto-name', () => {
    const { result } = setup();
    const id = result.current.layers[0].id;
    expect(result.current.layers[0].name).toBe('Pattern (Sg)');
    act(() => result.current.changeLayerPattern(id, switchPatch('lissajous')));
    expect(result.current.layers[0].patternType).toBe('lissajous');
    expect(result.current.layers[0].name).toBe('Pattern (Ls)');
    expect(result.current.layers[0].nameIsCustom).toBe(false);
  });

  it('switching patternType when nameIsCustom:true leaves the name frozen', () => {
    const { result } = setup();
    const id = result.current.layers[0].id;
    act(() => result.current.updateLayer(id, { name: 'Keep Me', nameIsCustom: true }));
    act(() => result.current.changeLayerPattern(id, switchPatch('lissajous')));
    expect(result.current.layers[0].patternType).toBe('lissajous');
    expect(result.current.layers[0].name).toBe('Keep Me');
    expect(result.current.layers[0].nameIsCustom).toBe(true);
  });

  it('dissolving a moiré pair (Case 3) recomputes the name when nameIsCustom:false', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, switchPatch('moire')));
    const aId = result.current.layers.find((l) => l.moireRole === 'A').id;
    // A has name 'Moiré A', nameIsCustom:false → switching away recomputes.
    act(() => result.current.changeLayerPattern(aId, switchPatch('grid')));
    const ls = result.current.layers;
    expect(ls.length).toBe(1);
    expect(ls[0].patternType).toBe('grid');
    expect(ls[0].name).toBe('Pattern (Gr)');
    expect(ls[0].moireRole).toBeUndefined();
  });
});

describe('duplicateLayer naming rule', () => {
  it('auto-named source → copy keeps recomputed auto-name, nameIsCustom:false, NO "copy" suffix', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id; // Pattern (Sg), nameIsCustom:false
    act(() => result.current.duplicateLayer(id));
    const copy = result.current.layers[1];
    expect(copy.name).toBe('Pattern (Sg)');
    expect(copy.name).not.toMatch(/copy/);
    expect(copy.nameIsCustom).toBe(false);
  });

  it('custom source → copy is "<name> copy", nameIsCustom:true', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    act(() => result.current.updateLayer(id, { name: 'Hero', nameIsCustom: true }));
    act(() => result.current.duplicateLayer(id));
    const copy = result.current.layers[1];
    expect(copy.name).toBe('Hero copy');
    expect(copy.nameIsCustom).toBe(true);
  });

  it('duplicating an imported (symbol-less) layer keeps Imported N — never "Layer 1", never "copy"', () => {
    const { result } = setup({ maxLayers: 6 });
    const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10"/></svg>';
    act(() => { result.current.addImportedLayer(SVG); });
    const imported = result.current.layers.find((l) => l.patternType === 'import');
    act(() => result.current.duplicateLayer(imported.id));
    const copies = result.current.layers.filter((l) => l.patternType === 'import');
    expect(copies.length).toBe(2);
    for (const c of copies) {
      expect(c.name).toMatch(/^Imported \d+$/);
      expect(c.name).not.toMatch(/^Layer /);
      expect(c.name).not.toMatch(/copy/);
      expect(c.nameIsCustom).toBe(false);
    }
  });

  it('moiré pair duplication preserves the rule for both members (auto → recomputed, no copy)', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, switchPatch('moire')));
    const origGroup = result.current.layers[0].moireGroupId;
    const aId = result.current.layers[0].id;
    act(() => result.current.duplicateLayer(aId));
    const newPair = result.current.layers.filter((l) => l.moireGroupId && l.moireGroupId !== origGroup);
    expect(newPair.length).toBe(2);
    // moiré has symbol 'Mo' → non-custom members recompute to 'Pattern (Mo)'.
    for (const m of newPair) {
      expect(m.name).toBe('Pattern (Mo)');
      expect(m.name).not.toMatch(/copy/);
      expect(m.nameIsCustom).toBe(false);
    }
  });
});

describe('migration defaults (migrateLayer)', () => {
  it('a persisted layer missing nameIsCustom → true; missing locked → false', () => {
    const out = migrateLayer({ id: 'layer-9-abc', name: 'Layer 1', role: 'cut', patternType: 'grid' });
    expect(out.nameIsCustom).toBe(true);
    expect(out.locked).toBe(false);
  });

  it('does NOT rewrite an existing Layer 1 name', () => {
    const out = migrateLayer({ id: 'layer-1-x', name: 'Layer 1', role: 'cut', patternType: 'grid' });
    expect(out.name).toBe('Layer 1');
  });

  it('applies defaults even on the operationId early-return path (valid operationId)', () => {
    // A layer that already has a resolvable operationId hits migrateLayer's early
    // return; the new fields must still land.
    const out = migrateLayer({ id: 'layer-2-y', name: 'Saved', operationId: 'op-cut', patternType: 'grid' });
    expect(out.nameIsCustom).toBe(true);
    expect(out.locked).toBe(false);
  });

  it('is idempotent / does not clobber an explicit nameIsCustom:false or locked:true', () => {
    const out = migrateLayer({ id: 'layer-3-z', name: 'X', nameIsCustom: false, locked: true, role: 'cut' });
    expect(out.nameIsCustom).toBe(false);
    expect(out.locked).toBe(true);
  });

  it('is safe on null', () => {
    expect(migrateLayer(null)).toBe(null);
  });
});
