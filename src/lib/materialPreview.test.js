import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PREVIEW_MATERIALS,
  materialCategory,
  materialSheetHex,
  materialStrokeColor,
  resolveCanvasColor,
  applyMarkVisibility,
  sheetBackground,
  offSheetDimFactor,
  OFF_SHEET_DIM,
  luminance,
} from './materialPreview.js';
import { resolveExportColor } from './fabrication.js';
import { seedOperations } from './operations.js';

const ops = seedOperations(); // op-cut (red), op-score (blue), op-engrave (black)
const layerWith = (operationId, color = '#123456') => ({ id: 'L', operationId, color });

// ── Default set ──────────────────────────────────────────────────────────────
describe('DEFAULT_PREVIEW_MATERIALS', () => {
  it('is 7 acrylic + 2 plywood, each with a hex and a category', () => {
    expect(DEFAULT_PREVIEW_MATERIALS).toHaveLength(9);
    expect(DEFAULT_PREVIEW_MATERIALS.filter((m) => m.type === 'acrylic')).toHaveLength(7);
    expect(DEFAULT_PREVIEW_MATERIALS.filter((m) => m.type === 'plywood')).toHaveLength(2);
    for (const m of DEFAULT_PREVIEW_MATERIALS) {
      expect(m.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(['lighten', 'burn']).toContain(m.category);
    }
  });
  it('includes the fluorescent green acrylic', () => {
    const g = DEFAULT_PREVIEW_MATERIALS.find((m) => m.id === 'green-fluorescent');
    expect(g).toMatchObject({ hex: '#E6E954', category: 'lighten' });
  });
});

// ── Category ─────────────────────────────────────────────────────────────────
describe('materialCategory', () => {
  it('honors an explicit category', () => {
    expect(materialCategory({ category: 'burn', type: 'acrylic' })).toBe('burn');
  });
  it('derives lighten from plastic-ish types', () => {
    expect(materialCategory({ type: 'acrylic' })).toBe('lighten');
    expect(materialCategory({ type: 'Cast PETG' })).toBe('lighten');
  });
  it('derives burn from wood-ish types', () => {
    expect(materialCategory({ type: 'plywood' })).toBe('burn');
    expect(materialCategory({ type: '3mm MDF' })).toBe('burn');
    expect(materialCategory({ type: 'walnut veneer' })).toBe('burn');
  });
  it('falls back to other for unknown types', () => {
    expect(materialCategory({ type: 'mystery' })).toBe('other');
    expect(materialCategory({})).toBe('other');
  });
});

// ── Sheet hex ────────────────────────────────────────────────────────────────
describe('materialSheetHex', () => {
  it('prefers explicit hex / swatchHex', () => {
    expect(materialSheetHex({ hex: '#E6E954' })).toBe('#e6e954');
    expect(materialSheetHex({ swatchHex: '#ABCDEF' })).toBe('#abcdef');
  });
  it('uses catalog color when it is a hex', () => {
    expect(materialSheetHex({ color: '#10130E' })).toBe('#10130e');
  });
  it('maps free-text color names (clear, natural, walnut)', () => {
    expect(materialSheetHex({ color: 'clear' })).toBe('#E7E7E7');
    expect(materialSheetHex({ color: 'natural' })).toBe('#D8B988');
    expect(materialSheetHex({ color: 'Walnut' })).toBe('#6B4A2B');
  });
  it('falls back to a neutral sheet for unknown materials', () => {
    expect(materialSheetHex({ color: 'ineffable' })).toBe('#C9C2B5');
    expect(materialSheetHex({})).toBe('#C9C2B5');
  });
});

// ── Stroke colors ────────────────────────────────────────────────────────────
describe('materialStrokeColor — every mark tints in the material reaction direction', () => {
  it('acrylic frosts marks LIGHTER than the sheet (cut included)', () => {
    const sheet = '#E6E954'; // bright fluorescent green
    for (const p of ['score', 'engrave', 'cut']) {
      expect(luminance(materialStrokeColor(sheet, 'lighten', p))).toBeGreaterThan(luminance(sheet));
    }
  });
  it('wood burns marks DARKER than the sheet (cut included)', () => {
    const sheet = '#6B4A2B'; // walnut plywood
    for (const p of ['score', 'engrave', 'cut']) {
      expect(luminance(materialStrokeColor(sheet, 'burn', p))).toBeLessThan(luminance(sheet));
    }
  });
  it('strength grows score < engrave < cut (frost: brighter)', () => {
    const sheet = '#61DBC2';
    const score = luminance(materialStrokeColor(sheet, 'lighten', 'score'));
    const engrave = luminance(materialStrokeColor(sheet, 'lighten', 'engrave'));
    const cut = luminance(materialStrokeColor(sheet, 'lighten', 'cut'));
    expect(engrave).toBeGreaterThan(score);
    expect(cut).toBeGreaterThan(engrave);
  });
  it('strength grows score < engrave < cut (burn: darker)', () => {
    const sheet = '#D8B988';
    const score = luminance(materialStrokeColor(sheet, 'burn', 'score'));
    const engrave = luminance(materialStrokeColor(sheet, 'burn', 'engrave'));
    const cut = luminance(materialStrokeColor(sheet, 'burn', 'cut'));
    expect(engrave).toBeLessThan(score);
    expect(cut).toBeLessThan(engrave);
  });
});

describe('materialStrokeColor — hue-preserving frost (L3)', () => {
  // A fluorescent yellow acrylic must frost toward a SATURATED yellowish-white,
  // never plain/near white: the blue channel stays clearly the smallest so the
  // yellow hue survives. (Old lens mixed toward #ffffff, washing the hue out.)
  const channels = (hex) => {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  };
  it('keeps a yellow hue across score/engrave/cut (B clearly the smallest)', () => {
    const sheet = '#E6E954';
    for (const p of ['score', 'engrave', 'cut']) {
      const { r, g, b } = channels(materialStrokeColor(sheet, 'lighten', p));
      expect(b).toBeLessThan(g);
      expect(b).toBeLessThan(r - 20); // not pure/near white
    }
  });
});

describe('materialStrokeColor — pen + contrast floor', () => {
  it('pen keeps the operation ink color', () => {
    expect(materialStrokeColor('#E6E954', 'lighten', 'pen', '#FF00FF')).toBe('#FF00FF');
  });
  it('a near-white sheet falls back to a visible contour (frost would vanish)', () => {
    const sheet = '#FAFAFA';
    const mark = materialStrokeColor(sheet, 'lighten', 'score');
    expect(Math.abs(luminance(sheet) - luminance(mark))).toBeGreaterThanOrEqual(0.06 - 1e-9);
  });

  // The Clear-acrylic case that motivated the per-sheet (not per-process) fallback:
  // at the frost ceiling every mark must be visible AND ordered cut<engrave<score
  // in luminance (cut most prominent) — never one stray grey between two whites.
  it('a near-white acrylic etches a consistent, ordered shadow across processes', () => {
    const sheet = '#E7E7E7'; // Clear
    const cut = luminance(materialStrokeColor(sheet, 'lighten', 'cut'));
    const engrave = luminance(materialStrokeColor(sheet, 'lighten', 'engrave'));
    const score = luminance(materialStrokeColor(sheet, 'lighten', 'score'));
    // all darker than the sheet (a legible shadow etch)...
    for (const m of [cut, engrave, score]) {
      expect(luminance(sheet) - m).toBeGreaterThanOrEqual(0.06 - 1e-9);
    }
    // ...and ordered: cut most prominent (darkest) → score least.
    expect(cut).toBeLessThan(engrave);
    expect(engrave).toBeLessThan(score);
  });
});

// ── resolveCanvasColor: the byte-identical guarantee ─────────────────────────
describe('resolveCanvasColor — operation mode === resolveExportColor (no regression)', () => {
  const cases = [
    layerWith('op-cut'),
    layerWith('op-score'),
    layerWith('op-engrave'),
    layerWith(undefined, '#abcdef'), // unresolved → fallback path
  ];
  for (const outputMode of ['laser', 'plotter', null]) {
    for (const layer of cases) {
      it(`matches export color (outputMode=${outputMode}, op=${layer.operationId})`, () => {
        const expected = resolveExportColor(layer, { operations: ops, outputMode });
        // null colorView, and explicitly-operation colorView, both delegate.
        expect(resolveCanvasColor(layer, { operations: ops, outputMode })).toBe(expected);
        expect(
          resolveCanvasColor(layer, { operations: ops, outputMode, colorView: { mode: 'operation' } }),
        ).toBe(expected);
      });
    }
  }
});

describe('resolveCanvasColor — material mode applies the lens', () => {
  const material = { id: 'g', name: 'Green', type: 'acrylic', hex: '#E6E954', category: 'lighten' };
  const colorView = { mode: 'material', material };
  it('cut → a near-white frost on the bright green sheet (not charcoal)', () => {
    const c = resolveCanvasColor(layerWith('op-cut'), { operations: ops, outputMode: 'laser', colorView });
    expect(luminance(c)).toBeGreaterThan(luminance('#E6E954'));
  });
  it('score → a lightened green (not the locked blue)', () => {
    const c = resolveCanvasColor(layerWith('op-score'), { operations: ops, outputMode: 'laser', colorView });
    expect(c).not.toBe('#0000FF');
    expect(luminance(c)).toBeGreaterThan(luminance('#E6E954'));
  });
  it('material mode falls back to the sheet hex when the material is missing', () => {
    const c = resolveCanvasColor(layerWith('op-cut'), { operations: ops, colorView: { mode: 'material' } });
    // No material → not material mode → delegates to export color.
    expect(c).toBe(resolveExportColor(layerWith('op-cut'), { operations: ops }));
  });
});

// ── sheetBackground ──────────────────────────────────────────────────────────
describe('sheetBackground', () => {
  it('returns the sheet hex in material mode', () => {
    expect(sheetBackground({ mode: 'material', material: { hex: '#10130E' } }, '#ffffff')).toBe('#10130e');
  });
  it('returns the document bg otherwise', () => {
    expect(sheetBackground({ mode: 'operation' }, '#ffffff')).toBe('#ffffff');
    expect(sheetBackground(null, '#eeeeee')).toBe('#eeeeee');
  });
});

describe('resolveCanvasColor — PER-PANEL material (panel.materialId)', () => {
  const operations = [
    { id: 'op-cut', name: 'Cut', color: '#FF0000', process: 'cut' },
    { id: 'op-engrave', name: 'Engrave', color: '#000000', process: 'engrave' },
  ];
  const green = DEFAULT_PREVIEW_MATERIALS.find((m) => m.id === 'green-fluorescent');
  const pink = DEFAULT_PREVIEW_MATERIALS.find((m) => m.id === 'pink-fluorescent');
  const panels = [
    { id: 'p-pink', visible: true, order: 0, materialId: 'pink-fluorescent' },
    { id: 'p-auto', visible: true, order: 1, materialId: null },
  ];
  const layerOn = (panelId) => ({ id: 'L', operationId: 'op-engrave', color: '#123456', panelId });

  it("a layer on a panel WITH a material shades against THAT panel's sheet", () => {
    const got = resolveCanvasColor(layerOn('p-pink'), {
      operations, colorView: { mode: 'material', material: green }, panels,
    });
    expect(got).toBe(materialStrokeColor(materialSheetHex(pink), 'lighten', 'engrave', '#000000'));
  });

  it('a layer on an Auto panel keeps the document-level lens material', () => {
    const got = resolveCanvasColor(layerOn('p-auto'), {
      operations, colorView: { mode: 'material', material: green }, panels,
    });
    expect(got).toBe(materialStrokeColor(materialSheetHex(green), 'lighten', 'engrave', '#000000'));
  });

  it('material mode + NO lens material still shades a panel-material layer (Auto layers stay operation-colored)', () => {
    const shaded = resolveCanvasColor(layerOn('p-pink'), {
      operations, colorView: { mode: 'material', material: null }, panels,
    });
    expect(shaded).toBe(materialStrokeColor(materialSheetHex(pink), 'lighten', 'engrave', '#000000'));
    const plain = resolveCanvasColor(layerOn('p-auto'), {
      operations, colorView: { mode: 'material', material: null }, panels,
    });
    expect(plain).toBe(resolveExportColor(layerOn('p-auto'), { operations })); // operation path
  });

  it('a dangling/unknown panelId or stale materialId degrades to the lens material', () => {
    const stale = [{ id: 'p-stale', visible: true, order: 0, materialId: 'deleted-org-material' }];
    expect(
      resolveCanvasColor(layerOn('p-stale'), {
        operations, colorView: { mode: 'material', material: green }, panels: stale,
      }),
    ).toBe(materialStrokeColor(materialSheetHex(green), 'lighten', 'engrave', '#000000'));
    expect(
      resolveCanvasColor(layerOn('p-gone'), {
        operations, colorView: { mode: 'material', material: green }, panels,
      }),
    ).toBe(materialStrokeColor(materialSheetHex(green), 'lighten', 'engrave', '#000000'));
  });
});

describe('applyMarkVisibility + markContrast — cut/score bias (preview-only)', () => {
  const operations = [
    { id: 'op-cut', name: 'Cut', color: '#FF0000', process: 'cut' },
    { id: 'op-score', name: 'Score', color: '#0000FF', process: 'score' },
    { id: 'op-engrave', name: 'Engrave', color: '#000000', process: 'engrave' },
  ];
  const green = DEFAULT_PREVIEW_MATERIALS.find((m) => m.id === 'green-fluorescent');
  const layer = (op) => ({ id: 'L', operationId: op, color: '#123456' });
  const view = (markContrast) => ({ mode: 'material', material: green, markContrast });

  it('bias 0 (and non-finite) returns the accurate color unchanged', () => {
    expect(applyMarkVisibility('#808080', 0)).toBe('#808080');
    expect(applyMarkVisibility('#808080', NaN)).toBe('#808080');
    expect(resolveCanvasColor(layer('op-cut'), { operations, colorView: view(0) }))
      .toBe(resolveCanvasColor(layer('op-cut'), { operations, colorView: view(undefined) }));
  });

  it('negative bias darkens, positive lightens, clamped at ±1', () => {
    expect(luminance(applyMarkVisibility('#808080', -0.5))).toBeLessThan(luminance('#808080'));
    expect(luminance(applyMarkVisibility('#808080', 0.5))).toBeGreaterThan(luminance('#808080'));
    expect(applyMarkVisibility('#808080', 5)).toBe(applyMarkVisibility('#808080', 1));
    // capped below a full mix — never collapses to pure white/black
    expect(applyMarkVisibility('#808080', 1)).not.toBe('#ffffff');
    expect(applyMarkVisibility('#808080', -1)).not.toBe('#000000');
  });

  it('biases CUT and SCORE strokes only — engrave stays accurate', () => {
    for (const op of ['op-cut', 'op-score']) {
      const accurate = resolveCanvasColor(layer(op), { operations, colorView: view(0) });
      const biased = resolveCanvasColor(layer(op), { operations, colorView: view(-0.6) });
      expect(biased).toBe(applyMarkVisibility(accurate, -0.6));
      expect(biased).not.toBe(accurate);
    }
    const engraveAccurate = resolveCanvasColor(layer('op-engrave'), { operations, colorView: view(0) });
    expect(resolveCanvasColor(layer('op-engrave'), { operations, colorView: view(-0.6) })).toBe(engraveAccurate);
  });

  it('never touches operation mode', () => {
    const got = resolveCanvasColor(layer('op-cut'), {
      operations, colorView: { mode: 'operation', material: green, markContrast: -1 },
    });
    expect(got).toBe(resolveExportColor(layer('op-cut'), { operations }));
  });
});

// ── Off-sheet dimming — Material lens + per-panel materials ──────────────────
// The 2D canvas superimposes every panel's layers over ONE background (the
// document-lens sheet). A layer whose OWN panel material differs from that
// background draws another sheet's reaction colors (e.g. orange-fluorescent
// #FF4500 score lines over a yellow Green-Fluorescent background) — dim those
// to OFF_SHEET_DIM so full-strength marks always belong to the sheet on screen.
describe('offSheetDimFactor — dims marks from panels on a DIFFERENT sheet', () => {
  const green = DEFAULT_PREVIEW_MATERIALS.find((m) => m.id === 'green-fluorescent');
  const orange = DEFAULT_PREVIEW_MATERIALS.find((m) => m.id === 'orange-fluorescent');
  const panels = [
    { id: 'p-orange', materialId: 'orange-fluorescent', visible: true, order: 0 },
    { id: 'p-green', materialId: 'green-fluorescent', visible: true, order: 1 },
    { id: 'p-auto', materialId: null, visible: true, order: 2 },
  ];
  const layerOn = (panelId) => ({ id: 'L', operationId: 'op-score', panelId });
  const lens = (material) => ({ mode: 'material', material });

  it('dims a layer whose panel material differs from the lens material', () => {
    expect(
      offSheetDimFactor(layerOn('p-orange'), { colorView: lens(green), panels }),
    ).toBe(OFF_SHEET_DIM);
    expect(OFF_SHEET_DIM).toBeLessThan(1);
  });

  it('keeps full strength when the panel material MATCHES the lens material', () => {
    expect(
      offSheetDimFactor(layerOn('p-green'), { colorView: lens(green), panels }),
    ).toBe(1);
  });

  it('keeps full strength for panels without their own material (they render on the lens sheet)', () => {
    expect(
      offSheetDimFactor(layerOn('p-auto'), { colorView: lens(green), panels }),
    ).toBe(1);
  });

  it('is 1 outside the Material lens and when no lens material is picked (byte-identical baseline)', () => {
    expect(
      offSheetDimFactor(layerOn('p-orange'), { colorView: { mode: 'operation', material: green }, panels }),
    ).toBe(1);
    expect(
      offSheetDimFactor(layerOn('p-orange'), { colorView: lens(null), panels }),
    ).toBe(1);
    expect(offSheetDimFactor(layerOn('p-orange'), { colorView: null, panels })).toBe(1);
    expect(offSheetDimFactor(layerOn('p-orange'), {})).toBe(1);
  });

  it('is 1 when the layer has no panel / panels are absent', () => {
    expect(offSheetDimFactor(layerOn('nope'), { colorView: lens(orange), panels })).toBe(1);
    expect(offSheetDimFactor(layerOn('p-orange'), { colorView: lens(orange), panels: [] })).toBe(1);
  });
});
