// Interaction tests for the imported-path layer (issue #12, C4). Drives the real
// useLayers hook (no DOM) and asserts that importing an SVG adds ONE artwork
// layer carrying path data + a default Cut operation, and that malformed/empty
// SVG is rejected without mutating the layer set.

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers.js';

const VALID_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10,10 L90,90 Z"/></svg>';

describe('useLayers.addImportedLayer', () => {
  it('adds exactly one imported-path layer carrying the path data and default Cut operation', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const before = result.current.layers.length;

    let outcome;
    act(() => {
      outcome = result.current.addImportedLayer(VALID_SVG);
    });

    expect(outcome.ok).toBe(true);
    expect(result.current.layers.length).toBe(before + 1);

    const imported = result.current.layers[result.current.layers.length - 1];
    expect(imported.type).toBe('import');
    expect(imported.params.pathData).toEqual(['M10,10 L90,90 Z']);
    expect(imported.operationId).toBe('op-cut'); // default operation = Cut
    expect(typeof imported.id).toBe('string');
  });

  it('rejects malformed/empty SVG without adding a layer and returns an error message', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const before = result.current.layers.length;

    let outcome;
    act(() => {
      outcome = result.current.addImportedLayer('<svg></svg>'); // no path
    });

    expect(outcome.ok).toBe(false);
    expect(typeof outcome.error).toBe('string');
    expect(result.current.layers.length).toBe(before);

    act(() => {
      outcome = result.current.addImportedLayer('');
    });
    expect(outcome.ok).toBe(false);
    expect(result.current.layers.length).toBe(before);
  });
});
