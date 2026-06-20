// @vitest-environment jsdom
//
// extractOps(svgString, { source }) -> [{ key, label, defaultOp }]
// - source 'upload'  : one row per distinct stroke color (key = color)
// - source 'design'  : one row per layer (key = layer id; defaultOp from role)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { extractOps } from './extractOps.js';

const fixture = (name) =>
  readFileSync(join(process.cwd(), 'src/test/fixtures/svg', name), 'utf8');

describe('extractOps', () => {
  // TRACER: an upload SVG with ONE stroke color -> exactly one row.
  it('returns one row for a single-stroke-color upload', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="0" x2="10" y2="0" stroke="#ff0000"/>
    </svg>`;
    const rows = extractOps(svg, { source: 'upload' });
    expect(rows).toEqual([{ key: '#ff0000', label: '#ff0000', defaultOp: 'cut' }]);
  });

  // Multiple distinct stroke colors -> one row each, document order.
  it('dedupes distinct stroke colors to one row each (upload)', () => {
    const rows = extractOps(fixture('multi-color.svg'), { source: 'upload' });
    expect(rows).toEqual([
      { key: '#ff0000', label: '#ff0000', defaultOp: 'cut' },
      { key: '#00ff00', label: '#00ff00', defaultOp: 'cut' },
      { key: '#0000ff', label: '#0000ff', defaultOp: 'cut' },
    ]);
  });

  // in-app (source 'design'): layer id is the key; role -> defaultOp.
  it('maps in-app layer roles to ops (design)', () => {
    const rows = extractOps(fixture('in-app-export.svg'), { source: 'design' });
    expect(rows).toEqual([
      { key: 'layer-cut', label: 'Cut', defaultOp: 'cut' },
      { key: 'layer-engrave', label: 'Engrave', defaultOp: 'engrave' },
    ]);
  });

  it('maps a score role to the score op (design)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" data-naqsha-export="1">
      <g id="layer-score" data-role="score" stroke="#444444" fill="none">
        <line x1="0" y1="0" x2="10" y2="0"/>
      </g>
    </svg>`;
    const rows = extractOps(svg, { source: 'design' });
    expect(rows).toEqual([{ key: 'layer-score', label: 'Score', defaultOp: 'score' }]);
  });

  // No strokes / no layers -> [].
  it('returns [] for an upload with no strokes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="10" height="10" fill="#000000"/>
      <line x1="0" y1="0" x2="10" y2="0" stroke="none"/>
    </svg>`;
    expect(extractOps(svg, { source: 'upload' })).toEqual([]);
  });

  it('returns [] for a design with no roled layers', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;
    expect(extractOps(svg, { source: 'design' })).toEqual([]);
  });
});
