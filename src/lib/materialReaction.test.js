import { describe, it, expect } from 'vitest';
import {
  materialCategory, materialSheetHex, brighten, luminance,
} from './materialReaction.js';

// Channel readers for hue assertions.
const R = (hex) => parseInt(hex.replace(/^#/, '').slice(0, 2), 16);
const G = (hex) => parseInt(hex.replace(/^#/, '').slice(2, 4), 16);
const B = (hex) => parseInt(hex.replace(/^#/, '').slice(4, 6), 16);

// ── Behavior 1: materialCategory — classify a loose material-like object ───────
// 2D passes { type|category, hex|color }; 3D passes panel.substrate { kind, color }.
describe('materialCategory', () => {
  it('honors an explicit category (lighten/burn/other)', () => {
    expect(materialCategory({ category: 'burn', type: 'acrylic' })).toBe('burn');
    expect(materialCategory({ category: 'lighten' })).toBe('lighten');
    expect(materialCategory({ category: 'other' })).toBe('other');
  });
  it('derives lighten from plastic-ish type', () => {
    expect(materialCategory({ type: 'acrylic' })).toBe('lighten');
    expect(materialCategory({ type: 'Cast PETG' })).toBe('lighten');
  });
  it('derives lighten from an acrylic SUBSTRATE kind (3D path)', () => {
    expect(materialCategory({ kind: 'acrylic', color: '#E6E954' })).toBe('lighten');
  });
  it('derives burn from wood-ish type/kind', () => {
    expect(materialCategory({ type: 'plywood' })).toBe('burn');
    expect(materialCategory({ type: '3mm MDF' })).toBe('burn');
    expect(materialCategory({ kind: 'plywood', color: '#6B4A2B' })).toBe('burn');
  });
  it('falls back to other for unknown / empty', () => {
    expect(materialCategory({ type: 'mystery' })).toBe('other');
    expect(materialCategory({ kind: 'cardstock' })).toBe('other');
    expect(materialCategory({})).toBe('other');
  });
});

// ── Behavior 2: materialSheetHex — the hex to paint the stock ──────────────────
describe('materialSheetHex', () => {
  it('prefers explicit hex / swatchHex / catalog color hex', () => {
    expect(materialSheetHex({ hex: '#E6E954' })).toBe('#e6e954');
    expect(materialSheetHex({ swatchHex: '#ABCDEF' })).toBe('#abcdef');
    expect(materialSheetHex({ color: '#10130E' })).toBe('#10130e');
  });
  it('reads a 3D substrate color (kind/color shape)', () => {
    expect(materialSheetHex({ kind: 'plywood', color: '#6B4A2B' })).toBe('#6b4a2b');
  });
  it('maps free-text color names', () => {
    expect(materialSheetHex({ color: 'walnut' })).toBe('#6B4A2B');
    expect(materialSheetHex({ color: 'clear' })).toBe('#E7E7E7');
  });
  it('falls back to a neutral sheet for unknown materials', () => {
    expect(materialSheetHex({ color: 'ineffable' })).toBe('#C9C2B5');
    expect(materialSheetHex({})).toBe('#C9C2B5');
  });
});

// ── Behavior 3: brighten — HUE-PRESERVING lift (L3) ───────────────────────────
// The bug this kills: mixing a saturated sheet toward #ffffff washes the hue out.
// brighten must raise luminance while KEEPING the hue family (yellow stays yellow).
describe('brighten — hue-preserving', () => {
  it('raises luminance', () => {
    expect(luminance(brighten('#E6E954', 0.8))).toBeGreaterThan(luminance('#E6E954'));
  });
  it('keeps a fluorescent yellow YELLOW (blue stays well below red & green)', () => {
    const out = brighten('#E6E954', 1);
    // never washes to white: blue channel stays clearly the smallest.
    expect(B(out)).toBeLessThan(R(out) - 30);
    expect(B(out)).toBeLessThan(G(out) - 30);
  });
  it('is idempotent at amount 0', () => {
    expect(brighten('#E6E954', 0)).toBe('#e6e954');
    expect(brighten('#61DBC2', 0)).toBe('#61dbc2');
  });
});

// ── Behaviors 4–7: reactionStrokeColor — 2D flat stroke (mark ON a lit sheet) ──
import { reactionStrokeColor } from './materialReaction.js';

describe('reactionStrokeColor — lighten (frost) keeps the sheet HUE (L3)', () => {
  const sheet = '#E6E954'; // fluorescent yellow
  it('frosts every process LIGHTER than the sheet', () => {
    for (const p of ['score', 'engrave', 'cut']) {
      expect(luminance(reactionStrokeColor(sheet, 'lighten', p))).toBeGreaterThan(luminance(sheet));
    }
  });
  it('keeps the frost YELLOW, not pure white (blue stays the smallest channel)', () => {
    for (const p of ['score', 'engrave', 'cut']) {
      const out = reactionStrokeColor(sheet, 'lighten', p);
      expect(B(out)).toBeLessThan(R(out));
      expect(B(out)).toBeLessThan(G(out));
    }
  });
  it('orders strength score < engrave < cut (monotonic, never crosses)', () => {
    const s = luminance(reactionStrokeColor(sheet, 'lighten', 'score'));
    const e = luminance(reactionStrokeColor(sheet, 'lighten', 'engrave'));
    const c = luminance(reactionStrokeColor(sheet, 'lighten', 'cut'));
    expect(e).toBeGreaterThan(s);
    expect(c).toBeGreaterThan(e);
  });
});

describe('reactionStrokeColor — burn / shadow / pen (ported behaviors)', () => {
  it('burn chars every process DARKER than the sheet, ordered score<engrave<cut', () => {
    const sheet = '#D8B988';
    const s = luminance(reactionStrokeColor(sheet, 'burn', 'score'));
    const e = luminance(reactionStrokeColor(sheet, 'burn', 'engrave'));
    const c = luminance(reactionStrokeColor(sheet, 'burn', 'cut'));
    for (const m of [s, e, c]) expect(m).toBeLessThan(luminance(sheet));
    expect(e).toBeLessThan(s);
    expect(c).toBeLessThan(e);
  });
  it('treats other like burn for contrast (darkens)', () => {
    const sheet = '#C9C2B5';
    expect(luminance(reactionStrokeColor(sheet, 'other', 'cut'))).toBeLessThan(luminance(sheet));
  });
  it('a near-white acrylic falls back to an ordered shadow etch (DARKER, cut most)', () => {
    const sheet = '#E7E7E7'; // Clear — at the frost ceiling
    const c = luminance(reactionStrokeColor(sheet, 'lighten', 'cut'));
    const e = luminance(reactionStrokeColor(sheet, 'lighten', 'engrave'));
    const s = luminance(reactionStrokeColor(sheet, 'lighten', 'score'));
    for (const m of [c, e, s]) expect(luminance(sheet) - m).toBeGreaterThanOrEqual(0.06 - 1e-9);
    expect(c).toBeLessThan(e);
    expect(e).toBeLessThan(s);
  });
  it('pen keeps the operation ink color', () => {
    expect(reactionStrokeColor('#E6E954', 'lighten', 'pen', '#FF00FF')).toBe('#FF00FF');
  });
});

// ── Behavior 8: reactionEmissive — 3D emissive tint + glow scale ───────────────
import { reactionEmissive, BURN_GLOW_SCALE } from './materialReaction.js';

describe('reactionEmissive — 3D emissive treatment', () => {
  it('lighten → brightened hue-preserving tint, full intensity', () => {
    const r = reactionEmissive('#E6E954', 'lighten', 'score');
    expect(r.tint).not.toBeNull();
    expect(luminance(r.tint)).toBeGreaterThan(luminance('#E6E954'));
    expect(B(r.tint)).toBeLessThan(R(r.tint)); // still yellow, not white
    expect(r.intensityScale).toBe(1);
  });
  it('burn → dark char tint, DAMPED intensity so it reads matte (L4)', () => {
    const lit = reactionEmissive('#E6E954', 'lighten', 'cut');
    const burn = reactionEmissive('#6B4A2B', 'burn', 'cut');
    expect(burn.tint).not.toBeNull();
    expect(luminance(burn.tint)).toBeLessThan(luminance(lit.tint));
    expect(burn.intensityScale).toBe(BURN_GLOW_SCALE);
    expect(BURN_GLOW_SCALE).toBeLessThan(1);
  });
  it('other → null tint (caller uses the laser convention), full intensity', () => {
    const r = reactionEmissive('#C9C2B5', 'other', 'cut');
    expect(r.tint).toBeNull();
    expect(r.intensityScale).toBe(1);
  });
});
