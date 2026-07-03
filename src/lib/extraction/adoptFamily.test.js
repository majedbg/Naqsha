import { describe, it, expect, afterEach, vi } from 'vitest';
import { adoptFittedFamily, resolveParameterizeGate } from './adoptFamily';
import { kaplanStarFamily } from './families/kaplanStar';
import {
  getDynamicParamDefs,
  getDynamicDefaults,
  getDynamicPatternClass,
  getDynamicTypes,
  unregisterPattern,
} from '../patternRegistry';
import { clearLibraryEntries } from '../libraryStore';
import { RecordingContext } from '../patterns/drawingContext.js';

const cell = { width: 100, height: 100 };
const squareLat = { cell, type: 'square', t1: [100, 0], t2: [0, 100], confidence: 0.9 };
const p4m = { group: 'p4m', confidence: 0.95, source: 'auto' };

const registeredIds = [];
function trackNewIds(before) {
  for (const t of getDynamicTypes()) if (!before.has(t.id)) registeredIds.push(t.id);
}
afterEach(() => {
  registeredIds.splice(0).forEach(unregisterPattern);
  clearLibraryEntries();
  vi.unstubAllGlobals();
});

describe('resolveParameterizeGate', () => {
  it('default-open: free tier is offered WITH live knobs', () => {
    const g = resolveParameterizeGate('free');
    expect(g.offer).toBe(true);
    expect(g.liveKnobs).toBe(true);
  });

  it('flag off (per-browser kill switch) → never offered', () => {
    const store = { 'naqsha:flag:parameterize': 'off' };
    vi.stubGlobal('localStorage', { getItem: (k) => store[k] ?? null });
    const g = resolveParameterizeGate('free');
    expect(g.offer).toBe(false);
    expect(g.liveKnobs).toBe(false);
  });
});

describe('adoptFittedFamily — PAID (liveKnobs) branch', () => {
  it('registers a parametric pattern WITH paramDefs (live structural knobs)', () => {
    const before = new Set(getDynamicTypes().map((t) => t.id));
    const params = { n: 8, contactAngle: 45, scale: 0.9 };
    const { entity, kind, PatternClass } = adoptFittedFamily({
      family: kaplanStarFamily,
      params,
      lattice: squareLat,
      symmetry: p4m,
      title: 'My star',
      liveKnobs: true,
    });
    trackNewIds(before);
    expect(kind).toBe('parametric');
    expect(entity.family).toBe('kaplan-star');

    const defs = getDynamicParamDefs(entity.patternId);
    expect(defs.map((d) => d.key)).toEqual(expect.arrayContaining(['n', 'contactAngle']));
    expect(getDynamicDefaults(entity.patternId)).toMatchObject({ n: 8, contactAngle: 45 });
    expect(getDynamicPatternClass(entity.patternId)).toBe(PatternClass);
    // The picker type is flagged origin:'extracted' (badge + sign-out hygiene).
    expect(getDynamicTypes().find((t) => t.id === entity.patternId).origin).toBe('extracted');
  });

  it('the live generator REGENERATES from params — changing n changes the geometry', () => {
    const before = new Set(getDynamicTypes().map((t) => t.id));
    const { PatternClass } = adoptFittedFamily({
      family: kaplanStarFamily,
      params: { n: 8, contactAngle: 45, scale: 0.9 },
      lattice: squareLat,
      symmetry: p4m,
      title: 'Star',
      liveKnobs: true,
    });
    trackNewIds(before);
    const vertsFor = (n) => {
      const ctx = new RecordingContext();
      new PatternClass().generateWithContext(ctx, 1, { n, contactAngle: 45, scale: 0.9 }, 100, 100, '#000', 100);
      return ctx.calls.filter((c) => c.op === 'vertex').length;
    };
    // An 8-fold star has more vertices per tile than a 4-fold star.
    expect(vertsFor(8)).toBeGreaterThan(vertsFor(4));
  });
});

describe('adoptFittedFamily — FREE (fixed tile) branch', () => {
  it('registers a fixed extracted tile with NO param knobs', () => {
    const before = new Set(getDynamicTypes().map((t) => t.id));
    const { entity, kind } = adoptFittedFamily({
      family: kaplanStarFamily,
      params: { n: 8, contactAngle: 45, scale: 0.9 },
      lattice: squareLat,
      symmetry: p4m,
      title: 'Fixed star',
      liveKnobs: false,
    });
    trackNewIds(before);
    expect(kind).toBe('fixed');
    // Fixed tile: the entity carries geometry but no parameterization payload.
    expect(entity.family).toBeNull();
    const defs = getDynamicParamDefs(entity.patternId);
    expect(defs == null || defs.length === 0).toBe(true);
    // Still a real, renderable pattern (the star geometry frozen at fit params).
    expect(entity.tile.strokes.length).toBeGreaterThan(0);
  });
});
