import { describe, it, expect } from 'vitest';
import {
  materialById,
  appearanceForPanelMaterial,
  panelMaterialIds,
} from './panelAppearance.js';
import { resolveAppearance } from './resolveAppearance.js';
import { DEFAULT_PREVIEW_MATERIALS } from '../materialPreview.js';

const GREEN = DEFAULT_PREVIEW_MATERIALS.find((m) => m.id === 'green-fluorescent');

describe('materialById — catalog lookup', () => {
  it('resolves a known id against the default catalog', () => {
    expect(materialById('green-fluorescent')).toBe(GREEN);
  });

  it('returns null for unknown, null, and undefined ids', () => {
    expect(materialById('no-such-material')).toBeNull();
    expect(materialById(null)).toBeNull();
    expect(materialById(undefined)).toBeNull();
  });

  it('honors an injected catalog over the default', () => {
    const custom = [{ id: 'org-red', name: 'Org Red', type: 'acrylic', hex: '#ff0000' }];
    expect(materialById('org-red', custom)).toBe(custom[0]);
    expect(materialById('green-fluorescent', custom)).toBeNull();
  });
});

describe('appearanceForPanelMaterial — per-panel precedence (§3.5, per panel)', () => {
  it("an explicit panel material resolves to that material's appearance", () => {
    const app = appearanceForPanelMaterial('green-fluorescent', null);
    expect(app).toEqual(resolveAppearance(GREEN));
    expect(app.archetype).toBe('fluorescent-acrylic');
    expect(app.tintHex).toBe('#e6e954');
  });

  it('an explicit panel material WINS over the document-level fallback appearance', () => {
    const fallback = resolveAppearance(
      DEFAULT_PREVIEW_MATERIALS.find((m) => m.id === 'walnut-plywood'),
    );
    const app = appearanceForPanelMaterial('green-fluorescent', fallback);
    expect(app.archetype).toBe('fluorescent-acrylic');
  });

  it('no materialId → the fallback appearance passes through (including null)', () => {
    const fallback = resolveAppearance(GREEN);
    expect(appearanceForPanelMaterial(null, fallback)).toBe(fallback);
    expect(appearanceForPanelMaterial(undefined, null)).toBeNull();
  });

  it('a stale/unknown materialId degrades to the fallback, never throws', () => {
    const fallback = resolveAppearance(GREEN);
    expect(appearanceForPanelMaterial('deleted-org-material', fallback)).toBe(fallback);
    expect(appearanceForPanelMaterial('deleted-org-material', null)).toBeNull();
  });
});

describe('panelMaterialIds — the live panelId → materialId map', () => {
  it('collects only panels that carry a materialId', () => {
    const panels = [
      { id: 'p1', materialId: 'green-fluorescent' },
      { id: 'p2', materialId: null },
      { id: 'p3' },
      { id: 'p4', materialId: 'walnut-plywood' },
    ];
    expect(panelMaterialIds(panels)).toEqual({
      p1: 'green-fluorescent',
      p4: 'walnut-plywood',
    });
  });

  it('degrades to an empty map on non-array / empty input', () => {
    expect(panelMaterialIds(undefined)).toEqual({});
    expect(panelMaterialIds([])).toEqual({});
    expect(panelMaterialIds([null])).toEqual({});
  });
});
