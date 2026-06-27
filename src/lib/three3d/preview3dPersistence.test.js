// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PREVIEW3D_STORAGE_KEY,
  defaultPreview3DSettings,
  normalizePreview3DSettings,
  loadPreview3DSettings,
  savePreview3DSettings,
} from './preview3dPersistence.js';
import { SPACING_DEFAULT, SPACING_MIN, SPACING_MAX } from './sheetSpecs.js';
import { EXAG_MIN } from './heightSurface.js';

describe('preview3dPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('defaults', () => {
    it('defaults: no sub-mode, spacing=SPACING_DEFAULT, exaggeration=null', () => {
      expect(defaultPreview3DSettings()).toEqual({
        subMode: null,
        spacing: SPACING_DEFAULT,
        exaggeration: null,
      });
    });

    it('loads defaults when nothing is stored', () => {
      expect(loadPreview3DSettings()).toEqual(defaultPreview3DSettings());
    });
  });

  describe('normalize', () => {
    it('keeps valid sub-modes', () => {
      expect(normalizePreview3DSettings({ subMode: 'panel-stack' }).subMode).toBe('panel-stack');
      expect(normalizePreview3DSettings({ subMode: 'height-surface' }).subMode).toBe(
        'height-surface',
      );
    });

    it('rejects off / unknown sub-modes back to null', () => {
      expect(normalizePreview3DSettings({ subMode: 'off' }).subMode).toBe(null);
      expect(normalizePreview3DSettings({ subMode: 'nonsense' }).subMode).toBe(null);
      expect(normalizePreview3DSettings({ subMode: 42 }).subMode).toBe(null);
    });

    it('clamps spacing into [SPACING_MIN, SPACING_MAX]', () => {
      expect(normalizePreview3DSettings({ spacing: -10 }).spacing).toBe(SPACING_MIN);
      expect(normalizePreview3DSettings({ spacing: 999 }).spacing).toBe(SPACING_MAX);
      expect(normalizePreview3DSettings({ spacing: 18 }).spacing).toBe(18);
    });

    it('falls back to default spacing on non-finite', () => {
      expect(normalizePreview3DSettings({ spacing: NaN }).spacing).toBe(SPACING_DEFAULT);
      expect(normalizePreview3DSettings({ spacing: 'big' }).spacing).toBe(SPACING_DEFAULT);
      expect(normalizePreview3DSettings({}).spacing).toBe(SPACING_DEFAULT);
    });

    it('keeps finite exaggeration >= floor, else null', () => {
      expect(normalizePreview3DSettings({ exaggeration: 25 }).exaggeration).toBe(25);
      expect(normalizePreview3DSettings({ exaggeration: EXAG_MIN }).exaggeration).toBe(EXAG_MIN);
      expect(normalizePreview3DSettings({ exaggeration: -5 }).exaggeration).toBe(null);
      expect(normalizePreview3DSettings({ exaggeration: NaN }).exaggeration).toBe(null);
      expect(normalizePreview3DSettings({}).exaggeration).toBe(null);
    });

    it('handles null / non-object input as defaults', () => {
      expect(normalizePreview3DSettings(null)).toEqual(defaultPreview3DSettings());
      expect(normalizePreview3DSettings(undefined)).toEqual(defaultPreview3DSettings());
      expect(normalizePreview3DSettings('xx')).toEqual(defaultPreview3DSettings());
    });
  });

  describe('round-trip', () => {
    it('save then load returns the written settings', () => {
      savePreview3DSettings({ subMode: 'panel-stack', spacing: 30, exaggeration: 40 });
      expect(loadPreview3DSettings()).toEqual({
        subMode: 'panel-stack',
        spacing: 30,
        exaggeration: 40,
      });
    });

    it('partial save merges over stored values (does not clobber)', () => {
      savePreview3DSettings({ subMode: 'height-surface', spacing: 20, exaggeration: 15 });
      savePreview3DSettings({ spacing: 5 });
      expect(loadPreview3DSettings()).toEqual({
        subMode: 'height-surface',
        spacing: 5,
        exaggeration: 15,
      });
    });

    it('save returns the merged + clamped object actually written', () => {
      const written = savePreview3DSettings({ spacing: 1000 });
      expect(written.spacing).toBe(SPACING_MAX);
      expect(loadPreview3DSettings().spacing).toBe(SPACING_MAX);
    });

    it('save clamps a corrupt patch before persisting', () => {
      savePreview3DSettings({ subMode: 'off', spacing: NaN, exaggeration: -1 });
      expect(loadPreview3DSettings()).toEqual(defaultPreview3DSettings());
    });
  });

  describe('robustness', () => {
    it('recovers from malformed JSON in storage', () => {
      localStorage.setItem(PREVIEW3D_STORAGE_KEY, '{not valid json');
      expect(loadPreview3DSettings()).toEqual(defaultPreview3DSettings());
    });

    it('ignores extraneous stored fields (e.g. a stray camera)', () => {
      localStorage.setItem(
        PREVIEW3D_STORAGE_KEY,
        JSON.stringify({ subMode: 'panel-stack', spacing: 12, camera: { pos: [1, 2, 3] } }),
      );
      const loaded = loadPreview3DSettings();
      expect(loaded).toEqual({ subMode: 'panel-stack', spacing: 12, exaggeration: null });
      expect('camera' in loaded).toBe(false);
    });
  });
});
