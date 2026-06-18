// Unit tests for the ImportedPath synthetic instance (issue #12, C4).
// It wraps parsed SVG path data and satisfies the SAME instance interface that
// real pattern instances expose — `toSVGGroup(layerId, color, opacity)` for
// export and `generateWithContext(...)` for canvas — so existing export/canvas
// code works unchanged (option A).

import { describe, it, expect } from 'vitest';
import ImportedPath from './ImportedPath.js';
import { RecordingContext } from './drawingContext.js';
import { buildAllLayersSVG } from '../svgExport.js';
import { resolveExportColor } from '../fabrication.js';
import { seedOperations } from '../operations.js';

const OPS = seedOperations(); // op-cut (#FF0000) / op-score / op-engrave

function makeInstance(paths) {
  const inst = new ImportedPath();
  inst.generateWithContext(
    new RecordingContext(),
    0,
    { pathData: paths },
    384,
    384,
    '#123456',
    100
  );
  return inst;
}

describe('ImportedPath.toSVGGroup', () => {
  it('emits a <g> containing the imported path d verbatim with the given color as stroke', () => {
    const inst = makeInstance(['M10,10 L90,90 C100,50 50,0 10,10 Z']);
    const g = inst.toSVGGroup('layer-1', '#FF0000', 100);
    expect(g.startsWith('<g')).toBe(true);
    expect(g).toContain('id="layer-1"');
    expect(g).toContain('d="M10,10 L90,90 C100,50 50,0 10,10 Z"');
    expect(g).toContain('stroke="#FF0000"');
    expect(g).toContain('fill="none"');
    expect(g.trim().endsWith('</g>')).toBe(true);
  });

  it('serializes every imported path', () => {
    const inst = makeInstance(['M0,0 L1,1', 'M2,2 L3,3']);
    const g = inst.toSVGGroup('layer-1', '#000', 100);
    expect(g).toContain('d="M0,0 L1,1"');
    expect(g).toContain('d="M2,2 L3,3"');
  });

  it('applies opacity as group opacity', () => {
    const inst = makeInstance(['M0,0 L1,1']);
    expect(inst.toSVGGroup('l', '#000', 50)).toContain('opacity="0.5"');
  });
});

describe('imported layer in combined export (buildAllLayersSVG)', () => {
  it('includes the imported outline with its resolved operation color', () => {
    const layer = {
      id: 'imp-1',
      name: 'Imported',
      type: 'import',
      visible: true,
      opacity: 100,
      bgOpacity: 0,
      color: '#123456',
      operationId: 'op-cut',
      params: { pathData: ['M10,10 L90,90 Z'] },
    };
    // Mirror the Studio export seam: resolve color through the operation library
    // (laser profile → the operation's locked convention color).
    const exportColor = resolveExportColor(layer, { operations: OPS, outputMode: 'laser' });
    const exportLayer = { ...layer, color: exportColor };
    const instances = { 'imp-1': makeInstance(layer.params.pathData) };

    const svg = buildAllLayersSVG([exportLayer], instances, 384, 384, false, {});

    expect(svg).toContain('d="M10,10 L90,90 Z"');
    // op-cut resolves to pure red (#FF0000) — the operation color must land in stroke.
    expect(svg).toContain('stroke="#FF0000"');
  });
});
