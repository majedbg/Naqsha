import { describe, it, expect } from 'vitest';
import {
  buildSheetSpecs,
  materialDescriptorForSubstrate,
  boundsForSheetSpecs,
  clampSpacing,
  DEFAULT_SUBSTRATE,
  SPACING_MIN,
  SPACING_MAX,
  SPACING_DEFAULT,
} from './sheetSpecs.js';

const BOUNDS = { width: 200, height: 150 };

function panel(order, overrides = {}) {
  return {
    id: `panel-${order}`,
    name: `Panel ${order + 1}`,
    visible: true,
    order,
    substrate: { kind: 'acrylic', thickness: 3, color: '#cccccc' },
    ...overrides,
  };
}

describe('materialDescriptorForSubstrate — identity only (ADR 0003)', () => {
  it('maps acrylic to a transmissive descriptor tinted by substrate color', () => {
    const d = materialDescriptorForSubstrate({ kind: 'acrylic', color: '#0082cd', thickness: 3 });
    expect(d.type).toBe('transmissive');
    expect(d.kind).toBe('acrylic');
    expect(d.color).toBe('#0082cd');
  });

  it('maps plywood to an opaque standard descriptor, tinted', () => {
    const d = materialDescriptorForSubstrate({ kind: 'plywood', color: '#6b4a2b' });
    expect(d.type).toBe('standard');
    expect(d.kind).toBe('plywood');
    expect(d.color).toBe('#6b4a2b');
  });

  it('carries NO optics — roughness/ior live on the archetypes, not the descriptor', () => {
    for (const kind of ['acrylic', 'plywood', 'mdf', 'cardstock', 'other']) {
      const d = materialDescriptorForSubstrate({ kind, color: '#abcdef' });
      expect(d, `${kind} leaked roughness`).not.toHaveProperty('roughness');
      expect(d, `${kind} leaked ior`).not.toHaveProperty('ior');
    }
  });

  it('maps "other" to an opaque neutral standard (NOT tinted by substrate color)', () => {
    const d = materialDescriptorForSubstrate({ kind: 'other', color: '#ff0000' });
    expect(d.type).toBe('standard');
    expect(d.kind).toBe('other');
    expect(d.color).not.toBe('#ff0000');
  });

  it('treats an unknown kind as neutral "other"', () => {
    const d = materialDescriptorForSubstrate({ kind: 'titanium', color: '#abcdef' });
    expect(d.type).toBe('standard');
    expect(d.kind).toBe('other');
    expect(d.color).not.toBe('#abcdef');
  });

  it('falls back to the default substrate color when none is given', () => {
    const d = materialDescriptorForSubstrate({ kind: 'acrylic' });
    expect(d.color).toBe(DEFAULT_SUBSTRATE.color);
  });
});

describe('buildSheetSpecs — ordering & stacking', () => {
  it('returns one sheet per visible panel, sorted by panel.order', () => {
    const panels = [panel(2), panel(0), panel(1)];
    const specs = buildSheetSpecs({ panels, layers: [], spacing: 0, bounds: BOUNDS });
    expect(specs.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('stacks zOffset cumulatively from thickness with NO gap before the first sheet', () => {
    const panels = [
      panel(0, { substrate: { kind: 'acrylic', thickness: 3, color: '#fff' } }),
      panel(1, { substrate: { kind: 'plywood', thickness: 5, color: '#fff' } }),
    ];
    const specs = buildSheetSpecs({ panels, layers: [], spacing: 12, bounds: BOUNDS });
    // sheet 0 center: 3/2 = 1.5 ; cursor -> 3
    expect(specs[0].zOffset).toBeCloseTo(1.5, 5);
    // sheet 1 center: 3 + 12(gap) + 5/2 = 17.5
    expect(specs[1].zOffset).toBeCloseTo(17.5, 5);
  });

  it('honors the spacing gap between every adjacent pair', () => {
    const panels = [panel(0), panel(1), panel(2)]; // all thickness 3
    const at = (g) => buildSheetSpecs({ panels, layers: [], spacing: g, bounds: BOUNDS }).map((s) => s.zOffset);
    const noGap = at(0); // 1.5, 4.5, 7.5
    const gap = at(10); // 1.5, 14.5, 27.5
    expect(noGap).toEqual([1.5, 4.5, 7.5]);
    expect(gap).toEqual([1.5, 14.5, 27.5]);
  });

  it('carries thickness and size (canvas mm-bounds) onto each spec', () => {
    const specs = buildSheetSpecs({ panels: [panel(0)], layers: [], spacing: 0, bounds: BOUNDS });
    expect(specs[0].thickness).toBe(3);
    expect(specs[0].size).toEqual([200, 150]);
  });

  it('selects the material descriptor per panel substrate kind', () => {
    const panels = [
      panel(0, { substrate: { kind: 'acrylic', thickness: 3, color: '#aaa' } }),
      panel(1, { substrate: { kind: 'mdf', thickness: 4, color: '#bbb' } }),
    ];
    const specs = buildSheetSpecs({ panels, layers: [], spacing: 0, bounds: BOUNDS });
    expect(specs[0].materialDescriptor.type).toBe('transmissive');
    expect(specs[1].materialDescriptor.type).toBe('standard');
    expect(specs[1].materialDescriptor.kind).toBe('mdf');
  });

  it('falls back to default thickness when a panel has no substrate', () => {
    const specs = buildSheetSpecs({ panels: [panel(0, { substrate: undefined })], layers: [], spacing: 0, bounds: BOUNDS });
    expect(specs[0].thickness).toBe(DEFAULT_SUBSTRATE.thickness);
  });
});

describe('buildSheetSpecs — visibility', () => {
  it('emits NO sheet for a hidden panel', () => {
    const panels = [panel(0), panel(1, { visible: false })];
    const specs = buildSheetSpecs({ panels, layers: [], spacing: 0, bounds: BOUNDS });
    expect(specs).toHaveLength(1);
    expect(specs[0].panelId).toBe('panel-0');
  });

  it('includes only effectively-visible layers in a sheet layerIds', () => {
    const panels = [panel(0)];
    const layers = [
      { id: 'l1', panelId: 'panel-0', visible: true },
      { id: 'l2', panelId: 'panel-0', visible: false },
      { id: 'l3', panelId: 'panel-9', visible: true }, // other panel
    ];
    const specs = buildSheetSpecs({ panels, layers, spacing: 0, bounds: BOUNDS });
    expect(specs[0].layerIds).toEqual(['l1']);
  });

  it('a visible panel with no visible layers still produces a blank sheet', () => {
    const panels = [panel(0)];
    const layers = [{ id: 'l1', panelId: 'panel-0', visible: false }];
    const specs = buildSheetSpecs({ panels, layers, spacing: 0, bounds: BOUNDS });
    expect(specs).toHaveLength(1);
    expect(specs[0].layerIds).toEqual([]);
  });
});

describe('buildSheetSpecs — degenerate & frozen inputs', () => {
  it('returns [] for null / empty / all-hidden inputs', () => {
    expect(buildSheetSpecs({ panels: null, layers: null, bounds: BOUNDS })).toEqual([]);
    expect(buildSheetSpecs({ panels: [], layers: [], bounds: BOUNDS })).toEqual([]);
    expect(buildSheetSpecs({ panels: [panel(0, { visible: false })], layers: [], bounds: BOUNDS })).toEqual([]);
  });

  it('does NOT mutate or throw on a deep-frozen panels array (snapshot is frozen)', () => {
    const panels = [panel(2), panel(0), panel(1)];
    panels.forEach((p) => Object.freeze(p));
    Object.freeze(panels);
    expect(() => buildSheetSpecs({ panels, layers: [], spacing: 5, bounds: BOUNDS })).not.toThrow();
    const specs = buildSheetSpecs({ panels, layers: [], spacing: 5, bounds: BOUNDS });
    expect(specs.map((s) => s.order)).toEqual([0, 1, 2]);
  });
});

describe('spacing slider contract (S6, PRD D11)', () => {
  it('exposes the 0–60mm range with a 12mm default', () => {
    expect(SPACING_MIN).toBe(0);
    expect(SPACING_MAX).toBe(60);
    expect(SPACING_DEFAULT).toBe(12);
  });

  it('clampSpacing keeps in-range values untouched', () => {
    expect(clampSpacing(0)).toBe(0);
    expect(clampSpacing(12)).toBe(12);
    expect(clampSpacing(60)).toBe(60);
  });

  it('clampSpacing clamps below 0 and above 60', () => {
    expect(clampSpacing(-5)).toBe(0);
    expect(clampSpacing(99)).toBe(60);
  });

  it('clampSpacing falls back to the 12mm default for non-finite input', () => {
    expect(clampSpacing(NaN)).toBe(SPACING_DEFAULT);
    expect(clampSpacing(undefined)).toBe(SPACING_DEFAULT);
  });

  it('the clamped spacing drives the z-layout: gap of 0 packs sheets flush, 60 spreads them', () => {
    const panels = [panel(0), panel(1)]; // both thickness 3
    const zAt = (g) =>
      buildSheetSpecs({ panels, layers: [], spacing: clampSpacing(g), bounds: BOUNDS }).map(
        (s) => s.zOffset,
      );
    // gap 0 → sheet1 center = 3 + 3/2 = 4.5
    expect(zAt(0)).toEqual([1.5, 4.5]);
    // clamped-from-over-max (99 → 60) → sheet1 center = 3 + 60 + 3/2 = 64.5
    expect(zAt(99)).toEqual([1.5, 64.5]);
    // default 12 → sheet1 center = 3 + 12 + 3/2 = 16.5
    expect(zAt(SPACING_DEFAULT)).toEqual([1.5, 16.5]);
  });
});

describe('boundsForSheetSpecs', () => {
  it('returns null for no specs (cameraFit guards null → default view)', () => {
    expect(boundsForSheetSpecs([])).toBeNull();
    expect(boundsForSheetSpecs(null)).toBeNull();
  });

  it('builds an xy-centered box spanning the full z stack', () => {
    const specs = buildSheetSpecs({
      panels: [panel(0), panel(1)],
      layers: [],
      spacing: 10,
      bounds: BOUNDS,
    });
    const box = boundsForSheetSpecs(specs);
    expect(box.min).toEqual([-100, -75, 0]); // -w/2, -h/2, near face of first sheet
    // far face of last sheet: cursor after sheet0=3, +10 gap, +3 = 16
    expect(box.max[2]).toBeCloseTo(16, 5);
    expect(box.max[0]).toBeCloseTo(100, 5);
    expect(box.max[1]).toBeCloseTo(75, 5);
  });
});
