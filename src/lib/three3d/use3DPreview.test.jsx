// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { use3DPreview } from './use3DPreview.js';

describe('use3DPreview', () => {
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
});
