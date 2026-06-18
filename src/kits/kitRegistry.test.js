// Unit tests for the kit registry (issue #18, Lane C / C9).
//
// The registry is config-driven: a future kit = a registration, not a new code
// path. ITP Camp is the only kit registered today. These tests pin the shape of
// a kit config and the ITP Camp palette tokens + bed presets.

import { describe, it, expect } from 'vitest';
import {
  KIT_IDS,
  getKit,
  listKits,
  ITP_CAMP_KIT_ID,
} from './kitRegistry.js';

describe('kit registry', () => {
  it('registers ITP Camp as the only kit', () => {
    expect(KIT_IDS).toEqual([ITP_CAMP_KIT_ID]);
    expect(listKits()).toHaveLength(1);
    expect(listKits()[0].id).toBe(ITP_CAMP_KIT_ID);
  });

  it('returns the ITP Camp config with the required shape', () => {
    const kit = getKit(ITP_CAMP_KIT_ID);
    expect(kit).toBeTruthy();
    expect(kit.id).toBe(ITP_CAMP_KIT_ID);
    expect(typeof kit.name).toBe('string');
    expect(kit.name.length).toBeGreaterThan(0);
    // Config-driven shape: themeSkin, assetManifest, bedPresets.
    expect(kit.themeSkin).toBeTruthy();
    expect(Array.isArray(kit.assetManifest)).toBe(true);
    expect(Array.isArray(kit.bedPresets)).toBe(true);
  });

  it('themeSkin resolves to the ITP Camp palette tokens', () => {
    const kit = getKit(ITP_CAMP_KIT_ID);
    const { theme, tokens } = kit.themeSkin;
    // The named third theme — the data-theme value the mode applies.
    expect(theme).toBe('itp-camp');
    // The plan-extracted palette (flagged for review): lime accent, deep teal,
    // black, soft sage, white cards. jsdom won't compute oklch(from #hex …), so
    // we assert the token MAP (plain JS), not getComputedStyle.
    expect(tokens['--itp-lime']).toBe('#B5E33C');
    expect(tokens['--itp-teal']).toBe('#2E5C6E');
    expect(tokens['--itp-black']).toBe('#000000');
    expect(tokens['--itp-sage']).toBe('#D9E2DD');
    expect(tokens['--itp-white']).toBe('#FFFFFF');
  });

  it('exposes exactly the two ITP Camp bed presets in mm with distinct labels', () => {
    const kit = getKit(ITP_CAMP_KIT_ID);
    expect(kit.bedPresets).toHaveLength(2);
    const [small, large] = kit.bedPresets;
    // Small ITP Camp bed: 12 × 24 inches = 304.8 × 609.6 mm (canonical mm).
    expect(small.width).toBeCloseTo(304.8, 1);
    expect(small.height).toBeCloseTo(609.6, 1);
    // Large is unconfirmed — assume equal to small for now.
    expect(large.width).toBeCloseTo(304.8, 1);
    expect(large.height).toBeCloseTo(609.6, 1);
    // Distinct labels so the placeholder is obvious.
    expect(small.label).not.toBe(large.label);
    expect(small.label).toMatch(/12.?.?24/);
    expect(large.label).toMatch(/large/i);
  });

  it('lists 7 assets including the lime logo and the 6 authored cut shapes', () => {
    const kit = getKit(ITP_CAMP_KIT_ID);
    expect(kit.assetManifest).toHaveLength(7);
    const ids = kit.assetManifest.map((a) => a.id);
    expect(ids).toContain('logo');
    expect(ids).toContain('coaster');
    expect(ids).toContain('keychain');
    expect(ids).toContain('luggage-tag');
    expect(ids).toContain('ornament');
    expect(ids).toContain('badge');
    expect(ids).toContain('bookmark');
    // Every asset carries a name and a non-empty SVG string for import.
    for (const a of kit.assetManifest) {
      expect(typeof a.name).toBe('string');
      expect(a.name.length).toBeGreaterThan(0);
      expect(typeof a.svg).toBe('string');
      expect(a.svg).toMatch(/<svg[\s>]/i);
    }
  });

  it('unknown kit id returns null', () => {
    expect(getKit('does-not-exist')).toBeNull();
    expect(getKit(undefined)).toBeNull();
  });
});
