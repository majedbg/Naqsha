import { describe, it, expect } from 'vitest';
import {
  HDRI_ENVIRONMENTS,
  ENVIRONMENT_IDS,
  DEFAULT_ENVIRONMENT_ID,
  isEnvironmentId,
  getEnvironmentById,
  isFileEnvironment,
  DEFAULT_BG_BLURRINESS,
  DEFAULT_BG_INTENSITY,
  BG_BLUR_MIN,
  BG_BLUR_MAX,
  BG_INTENSITY_MIN,
  BG_INTENSITY_MAX,
} from './hdriEnvironments.js';

describe('hdriEnvironments registry', () => {
  it('default is studio, and studio is listed first', () => {
    expect(DEFAULT_ENVIRONMENT_ID).toBe('studio');
    expect(HDRI_ENVIRONMENTS[0].id).toBe('studio');
  });

  it('studio is a dark preset (no background)', () => {
    const studio = getEnvironmentById('studio');
    expect(studio.kind).toBe('preset');
    expect(studio.preset).toBe('studio');
    expect(studio.background).toBe(false);
  });

  it('ships the voortrekker file HDRI as a 2k .hdr background', () => {
    const v = getEnvironmentById('voortrekker-interior');
    expect(v.kind).toBe('file');
    expect(v.file).toBe('/hdri/voortrekker_interior_2k.hdr');
    expect(v.file.endsWith('.hdr')).toBe(true); // NOT .exr (web size)
    expect(v.background).toBe(true);
  });

  it('every entry has an id, label, and a resolvable source for its kind', () => {
    for (const e of HDRI_ENVIRONMENTS) {
      expect(typeof e.id).toBe('string');
      expect(typeof e.label).toBe('string');
      if (e.kind === 'preset') expect(typeof e.preset).toBe('string');
      if (e.kind === 'file') expect(e.file.endsWith('.hdr')).toBe(true);
    }
  });

  it('ENVIRONMENT_IDS matches the registry order', () => {
    expect(ENVIRONMENT_IDS).toEqual(HDRI_ENVIRONMENTS.map((e) => e.id));
  });

  it('isEnvironmentId is true for known ids, false otherwise', () => {
    expect(isEnvironmentId('studio')).toBe(true);
    expect(isEnvironmentId('voortrekker-interior')).toBe(true);
    expect(isEnvironmentId('nope')).toBe(false);
    expect(isEnvironmentId(undefined)).toBe(false);
  });

  it('getEnvironmentById falls back to the default for unknown/missing ids', () => {
    expect(getEnvironmentById('nope').id).toBe('studio');
    expect(getEnvironmentById(undefined).id).toBe('studio');
  });

  it('isFileEnvironment distinguishes file HDRIs (sliders relevant) from presets', () => {
    expect(isFileEnvironment(getEnvironmentById('voortrekker-interior'))).toBe(true);
    expect(isFileEnvironment(getEnvironmentById('studio'))).toBe(false);
    expect(isFileEnvironment(null)).toBe(false);
  });

  it('background-softening defaults sit inside their slider ranges', () => {
    expect(DEFAULT_BG_BLURRINESS).toBeGreaterThanOrEqual(BG_BLUR_MIN);
    expect(DEFAULT_BG_BLURRINESS).toBeLessThanOrEqual(BG_BLUR_MAX);
    expect(DEFAULT_BG_INTENSITY).toBeGreaterThanOrEqual(BG_INTENSITY_MIN);
    expect(DEFAULT_BG_INTENSITY).toBeLessThanOrEqual(BG_INTENSITY_MAX);
  });
});
