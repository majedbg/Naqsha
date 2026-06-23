// WI-3 Naqsha Panels: per-panel + combined SVG export bundled into a timestamped
// ZIP. Data assertions hit the PURE builder (`buildPanelExportFiles`) so no DOM /
// JSZip is needed; one side-effect test mocks JSZip. The pattern-instance mock
// ECHOES its args (layer id + color) so panel-1 vs panel-2 SVGs are
// distinguishable and "absent from combined" assertions are meaningful — unlike
// the hardcoded mock in svgExport.test.js.

import { describe, it, expect, vi } from 'vitest';
import {
  buildPanelExportFiles,
  formatTimestamp,
} from './panelExport.js';

// Echoing instance: real signature is toSVGGroup(layer.id, layer.color, opacity).
const inst = () => ({
  toSVGGroup: (lid, color) => `<g id="${lid}" data-c="${color}"><path/></g>`,
});

function layer(id, panelId, color = '#f00') {
  return { id, name: id, panelId, visible: true, color, opacity: 100 };
}

function panel(id, order, { visible = true, kind = 'acrylic' } = {}) {
  return {
    id, name: `Panel ${order + 1}`, order, visible,
    substrate: { kind, thickness: 3, color: '#ccc' },
  };
}

function instancesFor(layers) {
  return Object.fromEntries(layers.map((l) => [l.id, inst()]));
}

describe('buildPanelExportFiles (pure)', () => {
  it('emits one file per VISIBLE panel plus exactly one combined', () => {
    const panels = [panel('p1', 0), panel('p2', 1, { kind: 'plywood' })];
    const layers = [layer('a', 'p1'), layer('b', 'p2')];
    const { files } = buildPanelExportFiles(
      panels, layers, instancesFor(layers), 384, 384, { designName: 'demo' }
    );
    expect(files).toHaveLength(3);
    const names = files.map((f) => f.name);
    expect(names).toContain('naqsha-demo-panel-1-acrylic.svg');
    expect(names).toContain('naqsha-demo-panel-2-plywood.svg');
    expect(names).toContain('naqsha-demo-combined.svg');
  });

  it('orders per-panel files by panel.order ascending and numbers from order+1', () => {
    // Pass panels out of order; output must sort by order.
    const panels = [panel('p2', 1, { kind: 'plywood' }), panel('p1', 0)];
    const layers = [layer('a', 'p1'), layer('b', 'p2')];
    const { files } = buildPanelExportFiles(
      panels, layers, instancesFor(layers), 384, 384, { designName: 'demo' }
    );
    // First two are per-panel (combined is last); panel-1 before panel-2.
    expect(files[0].name).toBe('naqsha-demo-panel-1-acrylic.svg');
    expect(files[1].name).toBe('naqsha-demo-panel-2-plywood.svg');
    expect(files[2].name).toBe('naqsha-demo-combined.svg');
  });

  it('excludes a hidden panel from BOTH the per-panel set and the combined SVG', () => {
    const panels = [panel('p1', 0), panel('p2', 1, { visible: false })];
    const layers = [layer('a', 'p1', '#aaa'), layer('hid', 'p2', '#bbb')];
    const { files } = buildPanelExportFiles(
      panels, layers, instancesFor(layers), 384, 384, { designName: 'demo' }
    );
    // No per-panel file for the hidden panel.
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.name)).toEqual([
      'naqsha-demo-panel-1-acrylic.svg',
      'naqsha-demo-combined.svg',
    ]);
    // Hidden panel's only layer is absent from the combined SVG.
    const combined = files.find((f) => f.name.endsWith('-combined.svg'));
    expect(combined.svg).toContain('id="a"');
    expect(combined.svg).not.toContain('id="hid"');
  });

  it('puts only that panel\'s layers in each per-panel SVG', () => {
    const panels = [panel('p1', 0), panel('p2', 1)];
    const layers = [
      layer('a', 'p1'), layer('a2', 'p1'),
      layer('b', 'p2'),
    ];
    const { files } = buildPanelExportFiles(
      panels, layers, instancesFor(layers), 384, 384, { designName: 'demo' }
    );
    const p1 = files.find((f) => f.name === 'naqsha-demo-panel-1-acrylic.svg');
    const p2 = files.find((f) => f.name === 'naqsha-demo-panel-2-acrylic.svg');
    expect(p1.svg).toContain('id="a"');
    expect(p1.svg).toContain('id="a2"');
    expect(p1.svg).not.toContain('id="b"');
    expect(p2.svg).toContain('id="b"');
    expect(p2.svg).not.toContain('id="a"');
  });

  it('builds the zip filename from injected clock (opts.now) as naqsha-<design>_<YYYY-MM-DD_HHmm>.zip', () => {
    const panels = [panel('p1', 0)];
    const layers = [layer('a', 'p1')];
    const { zipName } = buildPanelExportFiles(
      panels, layers, instancesFor(layers), 384, 384,
      { designName: 'demo', now: new Date('2026-06-23T17:48:00') }
    );
    expect(zipName).toBe('naqsha-demo_2026-06-23_1748.zip');
  });

  it('sanitizes designName (spaces -> underscores) in all three filename forms', () => {
    const panels = [panel('p1', 0), panel('p2', 1)];
    const layers = [layer('a', 'p1'), layer('b', 'p2')];
    const { files, zipName } = buildPanelExportFiles(
      panels, layers, instancesFor(layers), 384, 384,
      { designName: 'My Cool Design', now: new Date('2026-06-23T17:48:00') }
    );
    expect(files.map((f) => f.name)).toEqual([
      'naqsha-My_Cool_Design-panel-1-acrylic.svg',
      'naqsha-My_Cool_Design-panel-2-acrylic.svg',
      'naqsha-My_Cool_Design-combined.svg',
    ]);
    expect(zipName).toBe('naqsha-My_Cool_Design_2026-06-23_1748.zip');
  });

  it('defaults designName to "untitled" when none supplied', () => {
    const panels = [panel('p1', 0)];
    const layers = [layer('a', 'p1')];
    const { files } = buildPanelExportFiles(
      panels, layers, instancesFor(layers), 384, 384, {}
    );
    expect(files[0].name).toBe('naqsha-untitled-panel-1-acrylic.svg');
  });
});

describe('formatTimestamp', () => {
  it('formats as YYYY-MM-DD_HHmm using LOCAL time', () => {
    expect(formatTimestamp(new Date('2026-06-23T17:48:00'))).toBe('2026-06-23_1748');
  });

  it('zero-pads month, day, hour, and minute', () => {
    // January (month 0 -> 01), day 2, 02:05.
    expect(formatTimestamp(new Date('2026-01-02T02:05:00'))).toBe('2026-01-02_0205');
  });
});

describe('exportPanelsZip (side-effecting, mocked JSZip)', () => {
  it('adds each built file to the zip once and downloads under zipName', async () => {
    vi.resetModules();
    const fileSpy = vi.fn();
    const generateAsync = vi.fn().mockResolvedValue(new Blob(['zip']));
    function FakeJSZip() {
      return { file: fileSpy, generateAsync };
    }
    vi.doMock('jszip', () => ({ default: FakeJSZip }));

    // DOM stubs for the download side-effect. Preserve the real URL constructor
    // (jszip references `new URL` at module-load) while spying the two methods.
    const click = vi.fn();
    const createElement = vi.fn(() => ({ click, set href(_) {}, set download(_) {} }));
    vi.stubGlobal('document', { createElement });
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const { exportPanelsZip, buildPanelExportFiles: build } = await import('./panelExport.js');

    const panels = [panel('p1', 0), panel('p2', 1)];
    const layers = [layer('a', 'p1'), layer('b', 'p2')];
    const opts = { designName: 'demo', now: new Date('2026-06-23T17:48:00') };
    const { files } = build(panels, layers, instancesFor(layers), 384, 384, opts);

    await exportPanelsZip(panels, layers, instancesFor(layers), 384, 384, opts);

    expect(fileSpy).toHaveBeenCalledTimes(files.length);
    expect(generateAsync).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
    vi.doUnmock('jszip');
  });
});
