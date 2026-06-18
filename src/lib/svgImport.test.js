// Unit tests for SVG import parsing (issue #12, C4 — place-as-artwork).
// Pure, node-testable: an SVG string in, normalized path data out (or an error).

import { describe, it, expect } from 'vitest';
import { parseSVGImport } from './svgImport.js';

describe('parseSVGImport', () => {
  it('extracts the path d attribute from a single-path SVG, preserving it verbatim', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10,10 L90,90 C100,50 50,0 10,10 Z"/></svg>';
    const result = parseSVGImport(svg);
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual(['M10,10 L90,90 C100,50 50,0 10,10 Z']);
  });

  it('extracts multiple paths in document order', () => {
    const svg =
      '<svg><path d="M0,0 L1,1"/><rect/><path d=\'M2,2 L3,3\'/></svg>';
    const result = parseSVGImport(svg);
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual(['M0,0 L1,1', 'M2,2 L3,3']);
  });

  it('rejects an empty string without throwing', () => {
    const result = parseSVGImport('');
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects non-SVG markup without throwing', () => {
    expect(parseSVGImport('<html><body>nope</body></html>').ok).toBe(false);
  });

  it('rejects an SVG with no path geometry without throwing', () => {
    const result = parseSVGImport('<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="5" height="5"/></svg>');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/path/i);
  });

  it('rejects null/undefined input without throwing', () => {
    expect(parseSVGImport(null).ok).toBe(false);
    expect(parseSVGImport(undefined).ok).toBe(false);
  });
});
