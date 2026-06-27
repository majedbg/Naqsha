// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { use3DPreview } from './use3DPreview.js';
import { loadPreview3DSettings } from './preview3dPersistence.js';

describe('use3DPreview', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts off with no focused field', () => {
    const { result } = renderHook(() => use3DPreview());
    expect(result.current.subMode).toBe('off');
    expect(result.current.focusFieldLayerId).toBe(null);
  });

  it('openPanelStack switches to panel-stack', () => {
    const { result } = renderHook(() => use3DPreview());
    act(() => result.current.openPanelStack());
    expect(result.current.subMode).toBe('panel-stack');
    expect(result.current.focusFieldLayerId).toBe(null);
  });

  it('openHeightSurface switches to height-surface with the focused field id', () => {
    const { result } = renderHook(() => use3DPreview());
    act(() => result.current.openHeightSurface('guide-3'));
    expect(result.current.subMode).toBe('height-surface');
    expect(result.current.focusFieldLayerId).toBe('guide-3');
  });

  it('close returns to off and clears the focused field', () => {
    const { result } = renderHook(() => use3DPreview());
    act(() => result.current.openHeightSurface('guide-3'));
    act(() => result.current.close());
    expect(result.current.subMode).toBe('off');
    expect(result.current.focusFieldLayerId).toBe(null);
  });

  it('exposes stable action callbacks across renders', () => {
    const { result, rerender } = renderHook(() => use3DPreview());
    const first = result.current.openPanelStack;
    rerender();
    expect(result.current.openPanelStack).toBe(first);
  });

  it('persists the last non-off sub-mode to localStorage (D13)', () => {
    const { result } = renderHook(() => use3DPreview());
    act(() => result.current.openPanelStack());
    expect(loadPreview3DSettings().subMode).toBe('panel-stack');
    act(() => result.current.openHeightSurface('guide-1'));
    expect(loadPreview3DSettings().subMode).toBe('height-surface');
  });

  it('closing does NOT overwrite the persisted sub-mode with off', () => {
    const { result } = renderHook(() => use3DPreview());
    act(() => result.current.openPanelStack());
    act(() => result.current.close());
    // The recorded "last sub-mode" stays panel-stack; off is never stored.
    expect(loadPreview3DSettings().subMode).toBe('panel-stack');
  });
});
