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
  PANELS_STORAGE_KEY,
  createPanel,
  canAddPanel,
  addPanel,
  deletePanel,
  assignLayerToPanel,
  layersForPanel,
  effectiveVisible,
  normalizePanels,
  loadPanels,
  savePanels,
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
