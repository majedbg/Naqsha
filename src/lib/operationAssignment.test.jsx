// @vitest-environment jsdom
// Temporary assignment surface (issue #1): the existing role toggle in
// OutputModeSection rides updateLayer({ role }). Since export/preview now resolve
// through `operationId`, a role edit must keep operationId in sync so laser
// export and the plot-preview agree. (New test file — no existing test edited.)

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useLayers from './useLayers.js';
import { resolveExportColor } from './fabrication.js';
import { seedOperations } from './operations.js';

describe('updateLayer keeps operationId in sync with a legacy role edit', () => {
  beforeEach(() => localStorage.clear());

  it('role: "score" → operationId resolves to Score and exports #0000FF under laser', () => {
    const ops = seedOperations();
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const id = result.current.layers[0].id;

    act(() => result.current.updateLayer(id, { role: 'score' }));

    const layer = result.current.layers.find((l) => l.id === id);
    expect(layer.operationId).toBe('op-score');
    expect(resolveExportColor(layer, { operations: ops, outputMode: 'laser' })).toBe('#0000FF');
  });

  it('a non-role patch leaves operationId untouched', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const id = result.current.layers[0].id;
    const before = result.current.layers[0].operationId;

    act(() => result.current.updateLayer(id, { opacity: 50 }));

    expect(result.current.layers.find((l) => l.id === id).operationId).toBe(before);
  });
});
