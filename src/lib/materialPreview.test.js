import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PREVIEW_MATERIALS,
  materialCategory,
  materialSheetHex,
  materialStrokeColor,
  resolveCanvasColor,
  sheetBackground,
  luminance,
} from './materialPreview.js';
import { resolveExportColor } from './fabrication.js';
import { seedOperations } from './operations.js';

const ops = seedOperations(); // op-cut (red), op-score (blue), op-engrave (black)
const layerWith = (operationId, color = '#123456') => ({ id: 'L', operationId, color });

// ── Default set ──────────────────────────────────────────────────────────────
describe('DEFAULT_PREVIEW_MATERIALS', () => {
  it('is 5 acrylic + 2 plywood, each with a hex and a category', () => {
    expect(DEFAULT_PREVIEW_MATERIALS).toHaveLength(7);
    expect(DEFAULT_PREVIEW_MATERIALS.filter((m) => m.type === 'acrylic')).toHaveLength(5);
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
  it('falls back to darken for unknown types', () => {
    expect(materialCategory({ type: 'mystery' })).toBe('darken');
    expect(materialCategory({})).toBe('darken');
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

describe('materialStrokeColor — pen + contrast floor', () => {
  it('pen keeps the operation ink color', () => {
    expect(materialStrokeColor('#E6E954', 'lighten', 'pen', '#FF00FF')).toBe('#FF00FF');
  });
  it('a near-white sheet falls back to a visible contour (frost would vanish)', () => {
    const sheet = '#FAFAFA';
    const mark = materialStrokeColor(sheet, 'lighten', 'score');
    expect(Math.abs(luminance(sheet) - luminance(mark))).toBeGreaterThanOrEqual(0.06 - 1e-9);
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
