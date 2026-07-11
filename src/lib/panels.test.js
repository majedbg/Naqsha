// @vitest-environment jsdom
// WI-1 Naqsha Panels: pure helpers + constants + persistence + normalizer.
// These are the load-bearing contract later WIs (cloud, export, visibility, UI,
// Studio) consume, so each invariant in the spec gets an explicit test. Several
// tests deliberately use out-of-order `order` values so they discriminate a
// correct "smallest order" impl from a coincidental `array[0]`.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_PANELS,
  SUBSTRATE_KINDS,
  SUBSTRATE_PRESETS,
  PANELS_STORAGE_KEY,
  createPanel,
  canAddPanel,
  addPanel,
  presetLabel,
  duplicatePanel,
  canDuplicatePanel,
  clearPanelLayers,
  canClearPanelLayers,
  deletePanel,
  assignLayerToPanel,
  layersForPanel,
  effectiveVisible,
  effectiveVisibleLayers,
  normalizePanels,
  loadPanels,
  savePanels,
  INCH_THICKNESS_PRESETS,
  inchLabelForMm,
  thicknessChipLabel,
} from './panels.js';

// A minimal layer stand-in — only id/panelId/visible matter to these helpers.
const layer = (id, panelId, visible = true) => ({ id, panelId, visible });

describe('panels — constants', () => {
  it('exposes the locked constants', () => {
    expect(MAX_PANELS).toBe(3);
    expect(SUBSTRATE_KINDS).toEqual(['acrylic', 'plywood', 'mdf', 'cardstock', 'other']);
    expect(PANELS_STORAGE_KEY).toBe('sonoform-panels');
  });
});

describe('panels — SUBSTRATE_PRESETS', () => {
  it('exposes the 5 confirmed substrate presets in order', () => {
    expect(SUBSTRATE_PRESETS).toEqual([
      { kind: 'acrylic', thickness: 3 },
      { kind: 'acrylic', thickness: 5 },
      { kind: 'plywood', thickness: 4 },
      { kind: 'mdf', thickness: 3 },
      { kind: 'cardstock', thickness: 1 },
    ]);
  });
});

describe('panels — presetLabel', () => {
  it('formats a preset as "<kind> · <thickness>mm"', () => {
    expect(presetLabel({ kind: 'acrylic', thickness: 3 })).toBe('acrylic · 3mm');
    expect(presetLabel({ kind: 'plywood', thickness: 4 })).toBe('plywood · 4mm');
  });
  it('labels every SUBSTRATE_PRESETS entry with the `·` separator', () => {
    expect(SUBSTRATE_PRESETS.map(presetLabel)).toEqual([
      'acrylic · 3mm',
      'acrylic · 5mm',
      'plywood · 4mm',
      'mdf · 3mm',
      'cardstock · 1mm',
    ]);
  });
});

describe('panels — createPanel', () => {
  it('builds a default acrylic panel at the given order', () => {
    const p = createPanel(0);
    expect(p.name).toBe('Panel 1');
    expect(p.order).toBe(0);
    expect(p.visible).toBe(true);
    expect(p.substrate.kind).toBe('acrylic');
    expect(p.substrate.thickness).toBe(3);
    expect(typeof p.substrate.color).toBe('string');
    expect(p.id).toMatch(/^panel-1-[a-z0-9]{1,6}$/);
  });

  it('numbers name and id off order+1', () => {
    const p = createPanel(2);
    expect(p.name).toBe('Panel 3');
    expect(p.order).toBe(2);
    expect(p.id).toMatch(/^panel-3-/);
  });

  it('shallow-merges overrides last', () => {
    const p = createPanel(0, { name: 'Top', visible: false });
    expect(p.name).toBe('Top');
    expect(p.visible).toBe(false);
    expect(p.order).toBe(0); // untouched
  });

  it('generates distinct ids for the same order', () => {
    expect(createPanel(0).id).not.toBe(createPanel(0).id);
  });
});

describe('panels — canAddPanel', () => {
  it('true below cap, false at cap', () => {
    expect(canAddPanel([])).toBe(true);
    expect(canAddPanel([createPanel(0), createPanel(1)])).toBe(true);
    expect(canAddPanel([createPanel(0), createPanel(1), createPanel(2)])).toBe(false);
  });
  it('false for non-array', () => {
    expect(canAddPanel(null)).toBe(false);
    expect(canAddPanel(undefined)).toBe(false);
  });
});

describe('panels — addPanel', () => {
  it('appends a panel with the next order below cap', () => {
    const a = [createPanel(0)];
    const b = addPanel(a);
    expect(b.length).toBe(2);
    expect(b[1].order).toBe(1);
    expect(b[1].name).toBe('Panel 2');
    expect(b).not.toBe(a); // new array
  });

  it('returns the SAME reference (unchanged) at cap', () => {
    const full = [createPanel(0), createPanel(1), createPanel(2)];
    const out = addPanel(full);
    expect(out).toBe(full); // reference equality — no-op at cap
  });

  it('with a substrate preset, merges it over the default substrate', () => {
    const a = [createPanel(0)];
    const b = addPanel(a, { kind: 'plywood', thickness: 4 });
    expect(b.length).toBe(2);
    expect(b[1].substrate.kind).toBe('plywood');
    expect(b[1].substrate.thickness).toBe(4);
    // color falls back to the default substrate color (partial preset merge).
    expect(typeof b[1].substrate.color).toBe('string');
    expect(b[1].order).toBe(1);
  });

  it('returns the SAME reference at cap even when a substrate is given', () => {
    const full = [createPanel(0), createPanel(1), createPanel(2)];
    expect(addPanel(full, { kind: 'mdf', thickness: 3 })).toBe(full);
  });
});

describe('panels — duplicatePanel', () => {
  // A fuller layer stand-in carrying the fields cloneLayer touches.
  const fullLayer = (id, panelId, over = {}) => ({
    id,
    panelId,
    name: 'L',
    nameIsCustom: false,
    patternType: 'spirograph',
    visible: true,
    params: { a: 1, nested: { x: 1 } },
    randomizeKeys: ['a'],
    paramsCache: { k: { v: 2 } },
    ...over,
  });

  it('appends a panel: substrate deep-copied, order next, name "<name> copy", fresh id', () => {
    const src = createPanel(0, { name: 'Top', substrate: { kind: 'plywood', thickness: 4, color: '#abc' } });
    const panels = [src];
    const layers = [];
    const out = duplicatePanel(panels, layers, src.id);
    expect(out.panels.length).toBe(2);
    const np = out.panels[1];
    expect(np.name).toBe('Top copy');
    expect(np.order).toBe(1);
    expect(np.id).not.toBe(src.id);
    expect(np.substrate).toEqual(src.substrate);
    expect(np.substrate).not.toBe(src.substrate); // deep copy, fresh ref
  });

  it('deep-copies the source panel layers with fresh ids + new panelId', () => {
    const src = createPanel(0);
    const other = createPanel(1);
    const panels = [src, other];
    const layers = [
      fullLayer('a', src.id),
      fullLayer('b', other.id),
      fullLayer('c', src.id),
    ];
    const out = duplicatePanel(panels, layers, src.id);
    const np = out.panels[out.panels.length - 1];
    // original 3 layers preserved + 2 clones (a, c) appended.
    expect(out.layers.length).toBe(5);
    const clones = out.layers.slice(3);
    expect(clones.every((l) => l.panelId === np.id)).toBe(true);
    const cloneIds = clones.map((l) => l.id);
    // fresh, unique, and distinct from source ids
    expect(new Set(cloneIds).size).toBe(2);
    expect(cloneIds).not.toContain('a');
    expect(cloneIds).not.toContain('c');
    // deep-copied params / paramsCache (fresh refs)
    expect(clones[0].params).not.toBe(layers[0].params);
    expect(clones[0].paramsCache).not.toBe(layers[0].paramsCache);
    expect(clones[0].randomizeKeys).not.toBe(layers[0].randomizeKeys);
    expect(clones[0].params).toEqual(layers[0].params);
  });

  it('layer naming: custom → "<name> copy" (stays custom); auto → recomputed auto-name', () => {
    const src = createPanel(0);
    const panels = [src];
    const layers = [
      fullLayer('cust', src.id, { name: 'My Layer', nameIsCustom: true, patternType: 'spirograph' }),
      fullLayer('auto', src.id, { name: 'Pattern (Sg)', nameIsCustom: false, patternType: 'spirograph' }),
      fullLayer('imp', src.id, { name: 'Imported 1', nameIsCustom: false, patternType: 'import' }),
    ];
    const out = duplicatePanel(panels, layers, src.id);
    const clones = out.layers.slice(3);
    const byOriginalOrder = clones; // appended in source order
    expect(byOriginalOrder[0].name).toBe('My Layer copy');
    expect(byOriginalOrder[0].nameIsCustom).toBe(true);
    expect(byOriginalOrder[1].name).toBe('Pattern (Sg)'); // recomputed auto, no "copy"
    expect(byOriginalOrder[1].nameIsCustom).toBe(false);
    // symbol-less auto type keeps its deliberate name (no degrade to "Layer N")
    expect(byOriginalOrder[2].name).toBe('Imported 1');
    expect(byOriginalOrder[2].nameIsCustom).toBe(false);
  });

  it('unknown id → no-op, inputs returned unchanged (same refs)', () => {
    const src = createPanel(0);
    const panels = [src];
    const layers = [fullLayer('a', src.id)];
    const out = duplicatePanel(panels, layers, 'ghost');
    expect(out.panels).toBe(panels);
    expect(out.layers).toBe(layers);
  });

  it('at MAX_PANELS cap → no-op (same refs)', () => {
    const a = createPanel(0);
    const panels = [a, createPanel(1), createPanel(2)];
    const layers = [fullLayer('x', a.id)];
    const out = duplicatePanel(panels, layers, a.id);
    expect(out.panels).toBe(panels);
    expect(out.layers).toBe(layers);
  });

  it('does not mutate the inputs', () => {
    const src = createPanel(0);
    const panels = [src];
    const layers = [fullLayer('a', src.id)];
    const panelsSnap = JSON.parse(JSON.stringify(panels));
    const layersSnap = JSON.parse(JSON.stringify(layers));
    duplicatePanel(panels, layers, src.id);
    expect(panels).toEqual(panelsSnap);
    expect(layers).toEqual(layersSnap);
  });
});

describe('panels — canDuplicatePanel', () => {
  it('false at the panel cap (cannot add another panel)', () => {
    const a = createPanel(0);
    const full = [a, createPanel(1), createPanel(2)];
    const layers = [layer('x', a.id)];
    expect(canDuplicatePanel(full, layers, a.id, 50)).toBe(false);
  });

  it('false when copying the panel layers would exceed the layer cap', () => {
    const a = createPanel(0);
    const panels = [a];
    const layers = [layer('x', a.id), layer('y', a.id)];
    // 2 existing + 2 copied = 4 > cap 3 → false
    expect(canDuplicatePanel(panels, layers, a.id, 3)).toBe(false);
  });

  it('true when under both caps', () => {
    const a = createPanel(0);
    const panels = [a];
    const layers = [layer('x', a.id), layer('y', a.id)];
    // 2 existing + 2 copied = 4 <= cap 4 → true
    expect(canDuplicatePanel(panels, layers, a.id, 4)).toBe(true);
  });
});

describe('panels — clearPanelLayers', () => {
  it('removes every layer on the given panel, returns a new array', () => {
    const layers = [layer('a', 'p1'), layer('b', 'p2'), layer('c', 'p1')];
    const out = clearPanelLayers(layers, 'p1');
    expect(out.map((l) => l.id)).toEqual(['b']);
    expect(out).not.toBe(layers);
  });

  it('does not mutate the input', () => {
    const layers = [layer('a', 'p1'), layer('b', 'p2')];
    const snap = JSON.parse(JSON.stringify(layers));
    clearPanelLayers(layers, 'p1');
    expect(layers).toEqual(snap);
  });
});

describe('panels — canClearPanelLayers', () => {
  it('false when the panel has no layers', () => {
    const layers = [layer('a', 'p1')];
    expect(canClearPanelLayers(layers, 'p2')).toBe(false);
  });

  it('false when clearing would leave the document with 0 layers', () => {
    const layers = [layer('a', 'p1'), layer('b', 'p1')];
    expect(canClearPanelLayers(layers, 'p1')).toBe(false);
  });

  it('true when the panel has layers and others remain afterward', () => {
    const layers = [layer('a', 'p1'), layer('b', 'p2')];
    expect(canClearPanelLayers(layers, 'p1')).toBe(true);
  });
});

describe('panels — deletePanel', () => {
  it('deleting the ONLY panel is a no-op (always >= 1 panel)', () => {
    const panels = [createPanel(0)];
    const layers = [layer('l1', panels[0].id)];
    const out = deletePanel(panels, layers, panels[0].id);
    expect(out.panels).toBe(panels);
    expect(out.layers).toBe(layers);
  });

  it('deleteLayers:false removes panel and reassigns its layers to the smallest-order remaining panel', () => {
    // Out-of-order `order` so the test discriminates min-by-order from array[0].
    const keep = createPanel(0, { order: 5 });
    const min = createPanel(1, { order: 1 });
    const doomed = createPanel(2, { order: 9 });
    const panels = [keep, min, doomed];
    const layers = [layer('a', doomed.id), layer('b', keep.id)];

    const out = deletePanel(panels, layers, doomed.id);
    expect(out.panels.map((p) => p.id)).toEqual([keep.id, min.id]);
    // 'a' reassigned to the smallest-order remaining panel (min, order 1) — NOT keep[0].
    expect(out.layers.find((l) => l.id === 'a').panelId).toBe(min.id);
    expect(out.layers.find((l) => l.id === 'b').panelId).toBe(keep.id); // untouched
  });

  it('deleteLayers:true removes the panel AND its layers', () => {
    const p0 = createPanel(0);
    const p1 = createPanel(1);
    const panels = [p0, p1];
    const layers = [layer('a', p0.id), layer('b', p1.id), layer('c', p0.id)];
    const out = deletePanel(panels, layers, p0.id, { deleteLayers: true });
    expect(out.panels.map((p) => p.id)).toEqual([p1.id]);
    expect(out.layers.map((l) => l.id)).toEqual(['b']);
  });

  it('does not mutate the inputs', () => {
    const p0 = createPanel(0);
    const p1 = createPanel(1);
    const panels = [p0, p1];
    const layers = [layer('a', p0.id)];
    const panelsCopy = JSON.parse(JSON.stringify(panels));
    deletePanel(panels, layers, p0.id);
    expect(panels).toEqual(panelsCopy);
    expect(layers[0].panelId).toBe(p0.id); // original layer untouched
  });
});

describe('panels — assignLayerToPanel', () => {
  it('sets only the target layer panelId, returns a new array', () => {
    const layers = [layer('a', 'p1'), layer('b', 'p1')];
    const out = assignLayerToPanel(layers, 'a', 'p2');
    expect(out).not.toBe(layers);
    expect(out.find((l) => l.id === 'a').panelId).toBe('p2');
    expect(out.find((l) => l.id === 'b').panelId).toBe('p1'); // untouched
  });
});

describe('panels — layersForPanel', () => {
  it('filters layers by panelId', () => {
    const layers = [layer('a', 'p1'), layer('b', 'p2'), layer('c', 'p1')];
    expect(layersForPanel(layers, 'p1').map((l) => l.id)).toEqual(['a', 'c']);
    expect(layersForPanel(layers, 'pX')).toEqual([]);
  });
});

describe('panels — effectiveVisible', () => {
  it('ANDs panel.visible and layer.visible', () => {
    expect(effectiveVisible({ visible: true }, { visible: true })).toBe(true);
    expect(effectiveVisible({ visible: true }, { visible: false })).toBe(false);
    expect(effectiveVisible({ visible: false }, { visible: true })).toBe(false);
  });
  it('undefined panel falls back to layer.visible', () => {
    expect(effectiveVisible({ visible: true }, undefined)).toBe(true);
    expect(effectiveVisible({ visible: false }, undefined)).toBe(false);
  });
});

describe('panels — effectiveVisibleLayers (shared export/canvas filter)', () => {
  it('excludes layers whose panel is hidden', () => {
    const panels = [{ id: 'p1', visible: false }];
    const layers = [layer('a', 'p1', true), layer('b', 'p1', true)];
    expect(effectiveVisibleLayers(layers, panels)).toEqual([]);
  });

  it('includes a visible layer on a visible panel', () => {
    const panels = [{ id: 'p1', visible: true }];
    const layers = [layer('a', 'p1', true)];
    expect(effectiveVisibleLayers(layers, panels).map((l) => l.id)).toEqual(['a']);
  });

  it('excludes a visible:false layer even on a visible panel', () => {
    const panels = [{ id: 'p1', visible: true }];
    const layers = [layer('a', 'p1', true), layer('b', 'p1', false)];
    expect(effectiveVisibleLayers(layers, panels).map((l) => l.id)).toEqual(['a']);
  });

  it('mixes panels: only layers whose own AND panel visibility hold are kept', () => {
    const panels = [{ id: 'p1', visible: true }, { id: 'p2', visible: false }];
    const layers = [
      layer('a', 'p1', true),  // kept
      layer('b', 'p1', false), // dropped (layer hidden)
      layer('c', 'p2', true),  // dropped (panel hidden)
      layer('d', 'p2', false), // dropped (both hidden)
    ];
    expect(effectiveVisibleLayers(layers, panels).map((l) => l.id)).toEqual(['a']);
  });

  it('empty/undefined panels degrade to layer.visible regardless of panelId', () => {
    const layers = [layer('a', 'p1', true), layer('b', 'p2', false)];
    expect(effectiveVisibleLayers(layers, []).map((l) => l.id)).toEqual(['a']);
    expect(effectiveVisibleLayers(layers, undefined).map((l) => l.id)).toEqual(['a']);
  });

  it('dangling panelId with empty panels is treated as layer.visible', () => {
    const layers = [layer('a', 'ghost', true), layer('b', 'ghost', false)];
    expect(effectiveVisibleLayers(layers, []).map((l) => l.id)).toEqual(['a']);
  });

  it('returns a new array and does not mutate inputs', () => {
    const panels = [{ id: 'p1', visible: true }];
    const layers = [layer('a', 'p1', true), layer('b', 'p1', false)];
    const snapshot = JSON.parse(JSON.stringify(layers));
    const out = effectiveVisibleLayers(layers, panels);
    expect(out).not.toBe(layers);
    expect(layers).toEqual(snapshot);
  });
});

describe('panels — normalizePanels', () => {
  it('absent panels: seeds Panel 1 (acrylic) and assigns EVERY layer to it', () => {
    const layers = [layer('a', null), layer('b', undefined)];
    const out = normalizePanels(null, layers);
    expect(out.panels.length).toBe(1);
    expect(out.panels[0].name).toBe('Panel 1');
    expect(out.panels[0].substrate.kind).toBe('acrylic');
    const seedId = out.panels[0].id;
    expect(out.layers.every((l) => l.panelId === seedId)).toBe(true);
  });

  it('empty-array / non-array panels seed too', () => {
    expect(normalizePanels([], [layer('a', null)]).panels.length).toBe(1);
    expect(normalizePanels('nope', [layer('a', null)]).panels.length).toBe(1);
  });

  it('empty layers array with seed still works', () => {
    const out = normalizePanels(null, []);
    expect(out.panels.length).toBe(1);
    expect(out.layers).toEqual([]);
  });

  it('valid panels + dangling layer panelId: reassigns dangling to smallest-order panel, leaves valid untouched', () => {
    // Out-of-order `order` to discriminate min-by-order from array[0].
    const high = createPanel(0, { order: 7 });
    const low = createPanel(1, { order: 0 });
    const panels = [high, low];
    const layers = [
      layer('valid', high.id),
      layer('dangling', 'ghost-id'),
      layer('nullish', null),
    ];
    const out = normalizePanels(panels, layers);
    expect(out.panels).toBe(panels); // valid panels pass through
    expect(out.layers.find((l) => l.id === 'valid').panelId).toBe(high.id); // untouched
    expect(out.layers.find((l) => l.id === 'dangling').panelId).toBe(low.id); // → smallest order
    expect(out.layers.find((l) => l.id === 'nullish').panelId).toBe(low.id);
  });

  it('fully valid: passes panels through and returns layers equal to input', () => {
    const p0 = createPanel(0);
    const panels = [p0];
    const layers = [layer('a', p0.id), layer('b', p0.id)];
    const out = normalizePanels(panels, layers);
    expect(out.panels).toBe(panels);
    expect(out.layers).toEqual(layers);
  });

  it('does not mutate inputs', () => {
    const layers = [layer('a', null)];
    const snapshot = JSON.parse(JSON.stringify(layers));
    normalizePanels(null, layers);
    expect(layers).toEqual(snapshot);
  });
});

describe('panels — loadPanels / savePanels', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a saved panel array', () => {
    const panels = [createPanel(0), createPanel(1)];
    savePanels(panels);
    expect(loadPanels()).toEqual(panels);
  });

  it('returns null when key is missing', () => {
    expect(loadPanels()).toBe(null);
  });

  it('returns null for corrupt JSON', () => {
    localStorage.setItem(PANELS_STORAGE_KEY, '{not json');
    expect(loadPanels()).toBe(null);
  });

  it('returns null for an empty array', () => {
    localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify([]));
    expect(loadPanels()).toBe(null);
  });

  it('returns null for a non-array JSON value', () => {
    localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify({ foo: 1 }));
    expect(loadPanels()).toBe(null);
  });
});

describe('panel.materialId — per-panel material choice', () => {
  it('createPanel defaults materialId to null (Auto) and overrides win', () => {
    expect(createPanel(0).materialId).toBe(null);
    expect(createPanel(0, { materialId: 'green-fluorescent' }).materialId).toBe('green-fluorescent');
  });

  it('duplicatePanel copies the source materialId onto the clone', () => {
    const src = createPanel(0, { materialId: 'green-fluorescent' });
    const { panels } = duplicatePanel([src], [], src.id);
    expect(panels).toHaveLength(2);
    expect(panels[1].materialId).toBe('green-fluorescent');
  });

  it('normalizePanels passes materialId through untouched (and tolerates its absence)', () => {
    const withMat = createPanel(0, { materialId: 'walnut-plywood' });
    const legacy = { ...createPanel(1) };
    delete legacy.materialId; // a pre-feature persisted panel
    const { panels } = normalizePanels([withMat, legacy], []);
    expect(panels[0].materialId).toBe('walnut-plywood');
    expect(panels[1].materialId).toBeUndefined();
  });
});

describe('thickness — nominal inch ↔ metric pairs', () => {
  it('INCH_THICKNESS_PRESETS covers the common acrylic increments, ascending, 1/8 → 3mm', () => {
    const labels = INCH_THICKNESS_PRESETS.map((p) => p.label);
    for (const l of ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2']) expect(labels).toContain(l);
    const mms = INCH_THICKNESS_PRESETS.map((p) => p.mm);
    expect([...mms].sort((a, b) => a - b)).toEqual(mms);
    expect(INCH_THICKNESS_PRESETS.find((p) => p.label === '1/8').mm).toBe(3);
  });

  it('inchLabelForMm matches within tolerance, null outside it or for garbage', () => {
    expect(inchLabelForMm(3)).toBe('1/8');
    expect(inchLabelForMm(3.1)).toBe('1/8'); // nominal wiggle
    expect(inchLabelForMm(6)).toBe('1/4');
    expect(inchLabelForMm(4)).toBe(null); // between 1/8 (3) and 3/16 (4.5)
    expect(inchLabelForMm(NaN)).toBe(null);
  });

  it("thicknessChipLabel: default panel reads '1/8 in'; mm unit reads metric; custom inch is decimal", () => {
    expect(thicknessChipLabel(createPanel(0).substrate)).toBe('1/8 in');
    expect(thicknessChipLabel({ thickness: 5.5, thicknessUnit: 'mm' })).toBe('5.5 mm');
    // no explicit unit + no nominal match → auto falls back to mm (metric presets)
    expect(thicknessChipLabel({ thickness: 4 })).toBe('4 mm');
    // explicit inch unit with a custom metric value → decimal inches
    expect(thicknessChipLabel({ thickness: 4, thicknessUnit: 'in' })).toBe('0.157 in');
    expect(thicknessChipLabel(undefined)).toBe('1/8 in'); // degenerate → default 3mm, inch naming
  });
});
