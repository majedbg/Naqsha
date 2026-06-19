import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Resolve fixtures relative to THIS file (import.meta.url), never cwd, so the
// test is location-independent. Each fixture must load from disk AND contain
// the exact hallmark its downstream parser/sanitizer case depends on.
function readFixture(name) {
  const url = new URL(`./fixtures/svg/${name}`, import.meta.url);
  return readFileSync(fileURLToPath(url), 'utf8');
}

describe('svg fixtures', () => {
  it('units-mm.svg declares width/height in mm', () => {
    const svg = readFixture('units-mm.svg');
    expect(svg).toContain('width="80mm"');
    expect(svg).toContain('height="60mm"');
  });

  it('units-px.svg declares width/height in px', () => {
    const svg = readFixture('units-px.svg');
    expect(svg).toContain('width="300px"');
    expect(svg).toContain('height="150px"');
  });

  it('viewbox-only.svg has a viewBox and OMITS width/height (ambiguous dims)', () => {
    const svg = readFixture('viewbox-only.svg');
    expect(svg).toContain('viewBox="0 0 120 90"');
    expect(svg).not.toMatch(/\swidth=/);
    expect(svg).not.toMatch(/\sheight=/);
  });

  it('illustrator-pt.svg uses pt units (Illustrator export)', () => {
    const svg = readFixture('illustrator-pt.svg');
    expect(svg).toContain('width="226.772pt"');
    expect(svg).toContain('height="170.079pt"');
  });

  it('inkscape-96.svg carries 96dpi Inkscape metadata', () => {
    const svg = readFixture('inkscape-96.svg');
    expect(svg).toContain('inkscape:export-xdpi="96"');
    expect(svg).toContain('inkscape:');
  });

  it('malicious-script.svg contains a <script> element', () => {
    const svg = readFixture('malicious-script.svg');
    expect(svg).toContain('<script');
  });

  it('malicious-onload.svg contains onload and another event handler', () => {
    const svg = readFixture('malicious-onload.svg');
    expect(svg).toContain('onload=');
    expect(svg).toContain('onclick=');
  });

  it('external-ref.svg references a remote http resource', () => {
    const svg = readFixture('external-ref.svg');
    expect(svg).toContain('href="http://');
    expect(svg).toContain('xlink:href="http://');
  });

  it('multi-color.svg has multiple distinct stroke colors', () => {
    const svg = readFixture('multi-color.svg');
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('stroke="#00ff00"');
    expect(svg).toContain('stroke="#0000ff"');
  });

  it('in-app-export.svg has layer <g>s with ids and role data-attrs', () => {
    const svg = readFixture('in-app-export.svg');
    expect(svg).toContain('id="layer-cut"');
    expect(svg).toContain('data-role="engrave"');
  });
});
