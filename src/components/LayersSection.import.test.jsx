// Regression smoke test (issue #12): the EXISTING layer tree must render an
// imported-path layer (patternType:'import', no generative param defs) without
// crashing — proving the additive model change didn't regress the live panels.
// This is in scope: it verifies non-regression, it does NOT build the new tree (#5).

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LayersSection from './LayersSection.jsx';

// useGate reads auth/tier context; stub to a permissive default so the section
// renders standalone.
vi.mock('../lib/useGate', () => ({
  useGate: () => ({
    check: () => ({ allowed: true }),
    limits: { maxLayers: 6 },
  }),
}));

const importedLayer = {
  id: 'imp-1',
  name: 'Imported 1',
  type: 'import',
  patternType: 'import',
  color: '#123456',
  opacity: 100,
  visible: true,
  bgColor: '#ffffff',
  bgOpacity: 0,
  params: { pathData: ['M10,10 L90,90 Z'] },
  seed: 0,
  randomizeKeys: [],
  paramsCache: {},
  role: 'cut',
  operationId: 'op-cut',
  penSlot: 1,
};

const patternLayer = {
  id: 'p-1', name: 'Layer 1', patternType: 'spiral',
  color: '#ff0000', opacity: 100, visible: true, bgColor: '#fff', bgOpacity: 0,
  params: {}, seed: 1, randomizeKeys: [], paramsCache: {}, role: 'cut', operationId: 'op-cut', penSlot: 1,
};

const noop = () => {};

describe('layer tree with an imported-path layer', () => {
  it('renders the imported layer alongside a pattern layer without throwing', () => {
    expect(() =>
      render(
        <LayersSection
          layers={[importedLayer, patternLayer]}
          onUpdate={noop}
          onChangePattern={() => ({ ok: true })}
          onRemove={noop}
          onAdd={noop}
          onRandomize={noop}
          onRandomizeParams={noop}
          onRandomizeAllParams={noop}
          onRandomizeAll={noop}
          onReorder={noop}
          onExportLayer={noop}
          onDuplicate={noop}
          onOpenAIChat={noop}
        />
      )
    ).not.toThrow();

    // The imported layer is present in the tree (selectable/movable like any card).
    expect(screen.getByText('Imported 1')).toBeTruthy();
  });
});
