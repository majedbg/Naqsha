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

  // Export-parity (BLOCKING correctness — this app cuts physical material): a
  // moved/resized/rotated layer must export with the SAME center-pivot transform
  // useCanvas renders, so the cut lands where the canvas shows it.
  it('wraps a transformed layer in a center-pivot transform group (matches canvas)', () => {
    const moved = { ...layer, bgOpacity: 0, transform: { x: 40, y: -10, rotation: 0, scale: 1 } };
    const out = buildAllLayersSVG([moved], { x: inst }, 384, 384, false, {});
    // Pure translate → origin form (no pivot translates), wrapping the content.
    expect(out).toContain('<g transform="translate(40 -10)"><g id="layer-x">');
  });

  it('emits the center-pivot form for rotate/scale about the canvas center', () => {
    const spun = { ...layer, bgOpacity: 0, transform: { x: 0, y: 0, rotation: 90, scale: 2 } };
    const out = buildLayerSVG(spun, inst, 384, 384, {});
    // translate(cx cy) rotate(90) scale(2) translate(-cx -cy), cx=cy=192.
    expect(out).toContain('<g transform="translate(192 192) rotate(90) scale(2) translate(-192 -192)">');
  });

  it('leaves an untransformed layer byte-identical (identity → no wrapper)', () => {
    const out = buildAllLayersSVG([{ ...layer, transform: { x: 0, y: 0, rotation: 0, scale: 1 } }], { x: inst }, 384, 384, false, {});
    expect(out).not.toContain('<g transform=');
  });

  // IMPORT layers pivot rotate/scale about their GEOMETRY bbox center (not the
  // canvas center), so a scaled import lands in place — matching its tight
  // selection box and the canvas render (useCanvas importLayerPivot).
  it('emits the import bbox-center pivot for a scaled import (not the canvas center)', () => {
    // 40×40 square at (10,20) → bbox center (30,40).
    const importLayer = {
      ...layer, bgOpacity: 0, type: 'import',
      params: { pathData: ['M 10 20 L 50 20 L 50 60 L 10 60 Z'] },
      transform: { x: 0, y: 0, rotation: 0, scale: 2 },
    };
    const out = buildLayerSVG(importLayer, inst, 384, 384, {});
    expect(out).toContain('<g transform="translate(30 40) scale(2) translate(-30 -40)">');
    expect(out).not.toContain('translate(192 192)'); // NOT the canvas center
  });

  it('keeps a translate-only import byte-stable (pivot cancels at identity scale)', () => {
    const importLayer = {
      ...layer, bgOpacity: 0, type: 'import',
      params: { pathData: ['M 10 20 L 50 20 L 50 60 L 10 60 Z'] },
      transform: { x: 5, y: 7, rotation: 0, scale: 1 },
    };
    const out = buildLayerSVG(importLayer, inst, 384, 384, {});
    expect(out).toContain('<g transform="translate(5 7)">');
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
