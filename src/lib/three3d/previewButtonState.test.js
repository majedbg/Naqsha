import { describe, it, expect } from 'vitest';
import { previewButtonState } from './previewButtonState.js';

describe('previewButtonState', () => {
  it('opens when 3D is off (no sub-mode)', () => {
    const s = previewButtonState({ subMode: 'off', focusLayerId: null, layerId: 'g1' });
    expect(s).toEqual({ previewingThis: false, label: 'Preview in 3D', action: 'open' });
  });

  it('opens when sub-mode/focus are undefined (legacy / standalone Inspector)', () => {
    const s = previewButtonState({ layerId: 'g1' });
    expect(s.previewingThis).toBe(false);
    expect(s.label).toBe('Preview in 3D');
    expect(s.action).toBe('open');
  });

  it('closes when height-surface is open FOR THIS layer', () => {
    const s = previewButtonState({
      subMode: 'height-surface',
      focusLayerId: 'g1',
      layerId: 'g1',
    });
    expect(s).toEqual({ previewingThis: true, label: 'Close preview', action: 'close' });
  });

  it('still opens (re-focus) when a DIFFERENT layer is being previewed', () => {
    const s = previewButtonState({
      subMode: 'height-surface',
      focusLayerId: 'other',
      layerId: 'g1',
    });
    expect(s.previewingThis).toBe(false);
    expect(s.label).toBe('Preview in 3D');
    expect(s.action).toBe('open');
  });

  it('does not treat panel-stack (Surface A) as previewing this guide', () => {
    const s = previewButtonState({
      subMode: 'panel-stack',
      focusLayerId: null,
      layerId: 'g1',
    });
    expect(s.previewingThis).toBe(false);
    expect(s.action).toBe('open');
  });

  it('does not match when both focus and layer are null/undefined', () => {
    const s = previewButtonState({ subMode: 'height-surface', focusLayerId: null, layerId: undefined });
    expect(s.previewingThis).toBe(false);
  });
});
