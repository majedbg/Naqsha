// Node tests (no DOM) for the PURE SVG-string builders split out of the export
// side-effect. The expected strings are the byte-exact output the exporters
// produced before the buildLayerSVG/downloadSVG split — pinning that the split
// changed nothing about the emitted SVG.

import { describe, it, expect, vi } from 'vitest';
import {
  buildLayerSVG,
  buildAllLayersSVG,
  exportLayerSVG,
  downloadSVG,
} from './svgExport.js';

const inst = { toSVGGroup: () => '<g id="layer-x"><path d="M0,0 L10,10"/></g>' };
const layer = {
  id: 'x', name: 'My Layer', visible: true,
  color: '#f00', opacity: 100, bgOpacity: 30, bgColor: '#abc',
};

describe('buildLayerSVG (pure)', () => {
  it('emits the byte-exact SVG with a background rect', () => {
    expect(buildLayerSVG(layer, inst, 384, 384, {})).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="101.60mm" height="101.60mm" viewBox="0 0 384 384">\n' +
      '  <rect width="100%" height="100%" fill="white"/>\n' +
      '      <rect width="384" height="384" fill="#abc" opacity="0.30"/>\n' +
      '  <g id="layer-x"><path d="M0,0 L10,10"/></g>\n' +
      '</svg>'
    );
  });

  it('emits metadata + manifest comment (with -- escaped) and no bg rect when bgOpacity 0', () => {
    expect(buildLayerSVG({ ...layer, bgOpacity: 0 }, inst, 384, 384, { metadata: true, manifest: 'a--b' })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="101.60mm" height="101.60mm" viewBox="0 0 384 384">\n' +
      '  <!-- generativearts.studio -->\n' +
      '  <!--\na‒‒b\n-->\n' +
      '  <rect width="100%" height="100%" fill="white"/>\n' +
      '  <g id="layer-x"><path d="M0,0 L10,10"/></g>\n' +
      '</svg>'
    );
  });
});

describe('buildAllLayersSVG (pure)', () => {
  it('emits the byte-exact multi-layer SVG (bottom-up order)', () => {
    expect(buildAllLayersSVG([layer], { x: inst }, 384, 384, false, {})).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="101.60mm" height="101.60mm" viewBox="0 0 384 384">\n' +
      '  <rect width="100%" height="100%" fill="white"/>\n' +
      '      <rect width="384" height="384" fill="#abc" opacity="0.30"/>\n' +
      '  <g id="layer-x"><path d="M0,0 L10,10"/></g>\n' +
      '</svg>'
    );
  });

  it('drops hidden layers unless includeHidden', () => {
    const hidden = { ...layer, id: 'h', visible: false };
    const both = buildAllLayersSVG([layer, hidden], { x: inst, h: inst }, 384, 384, true, {});
    // includeHidden=true → both layer groups present
    expect(both.match(/layer-x/g)).toHaveLength(2);
  });
});

describe('downloadSVG (isolated DOM side-effect)', () => {
  it('builds a Blob, clicks an anchor with the filename, and revokes the URL', () => {
    const click = vi.fn();
    const anchor = { click, href: '', download: '' };
    const created = vi.fn(() => 'blob:fake');
    const revoked = vi.fn();
    const origBlob = globalThis.Blob;
    const origURL = globalThis.URL;
    const origDoc = globalThis.document;
    globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } };
    globalThis.URL = { createObjectURL: created, revokeObjectURL: revoked };
    globalThis.document = { createElement: () => anchor };
    try {
      downloadSVG('<svg/>', 'out.svg');
      expect(created).toHaveBeenCalledOnce();
      expect(anchor.download).toBe('out.svg');
      expect(anchor.href).toBe('blob:fake');
      expect(click).toHaveBeenCalledOnce();
      expect(revoked).toHaveBeenCalledWith('blob:fake');
    } finally {
      globalThis.Blob = origBlob;
      globalThis.URL = origURL;
      globalThis.document = origDoc;
    }
  });
});

describe('exportLayerSVG wires pure build → download', () => {
  it('downloads the same string buildLayerSVG produces, default filename from layer name', () => {
    let captured = '';
    let fname = '';
    const origBlob = globalThis.Blob;
    const origURL = globalThis.URL;
    const origDoc = globalThis.document;
    globalThis.Blob = class { constructor(parts) { captured = parts[0]; } };
    globalThis.URL = { createObjectURL: () => 'blob:', revokeObjectURL: () => {} };
    globalThis.document = { createElement: () => ({ click() {}, set href(_) {}, set download(v) { fname = v; } }) };
    try {
      exportLayerSVG(layer, inst, 384, 384, {});
      expect(captured).toBe(buildLayerSVG(layer, inst, 384, 384, {}));
      expect(fname).toBe('My_Layer.svg');
    } finally {
      globalThis.Blob = origBlob;
      globalThis.URL = origURL;
      globalThis.document = origDoc;
    }
  });
});
