// @vitest-environment jsdom
//
// Tests for the security-critical SVG sanitizer (org-admin-mvp). The module
// wraps DOMPurify's SVG profile and reports what was stripped. This file runs
// under jsdom because DOMPurify needs a real `window`/DOM to operate.
//
// TDD order (tracer first): benign passthrough -> <script> -> event handlers ->
// <foreignObject> -> external href neutralization -> removed[] accuracy ->
// extra XSS vectors (<use href>, javascript: URIs, data-URI scripts).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sanitizeSvg } from './sanitizeSvg.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  readFileSync(resolve(here, '../../test/fixtures/svg', name), 'utf8');

describe('sanitizeSvg — tracer', () => {
  it('passes a benign SVG (units-mm) through with geometry preserved and nothing removed', () => {
    const { clean, removed } = sanitizeSvg(fixture('units-mm.svg'));

    // Still a valid SVG root.
    expect(clean).toMatch(/<svg[\s>]/);
    // Geometry preserved.
    expect(clean).toContain('<rect');
    expect(clean).toContain('width="70"');
    expect(clean).toContain('height="50"');
    expect(clean).toContain('stroke="#000000"');
    // Nothing was stripped from a benign file.
    expect(removed).toEqual([]);
  });
});

describe('sanitizeSvg — <script>', () => {
  it('strips <script> and reports it in removed', () => {
    const { clean, removed } = sanitizeSvg(fixture('malicious-script.svg'));

    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('__pwned');
    // Benign geometry survives.
    expect(clean).toContain('<rect');
    // The removal is reported.
    expect(removed.some((r) => r.includes('script'))).toBe(true);
  });
});

describe('sanitizeSvg — event-handler attributes', () => {
  it('strips onload/onclick event handlers and reports them', () => {
    const { clean, removed } = sanitizeSvg(fixture('malicious-onload.svg'));

    expect(clean).not.toMatch(/onload/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toContain('__pwned');
    // Geometry survives, just without the handler.
    expect(clean).toContain('<rect');
    // At least one event-handler attribute removal is reported.
    expect(removed.some((r) => /onload|onclick/i.test(r))).toBe(true);
  });
});

describe('sanitizeSvg — <foreignObject>', () => {
  it('removes <foreignObject> (an HTML-injection vector) and its contents', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<foreignObject width="10" height="10">' +
      '<div xmlns="http://www.w3.org/1999/xhtml">' +
      '<img src=x onerror="window.__pwned=true">' +
      '</div></foreignObject>' +
      '<rect width="10" height="10"/></svg>';
    const { clean, removed } = sanitizeSvg(svg);

    expect(clean).not.toMatch(/foreignObject/i);
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('__pwned');
    // Geometry survives.
    expect(clean).toContain('<rect');
    expect(removed.some((r) => /foreignobject/i.test(r))).toBe(true);
  });
});

describe('sanitizeSvg — external/remote references', () => {
  it('neutralizes remote href / xlink:href so no remote fetch survives', () => {
    const { clean, removed } = sanitizeSvg(fixture('external-ref.svg'));

    // No remote URL of any kind may survive in the cleaned output.
    expect(clean).not.toContain('evil.example.com');
    expect(clean).not.toMatch(/href="https?:/i);
    // The local geometry survives.
    expect(clean).toContain('<rect');
    // The neutralization is reported.
    expect(removed.some((r) => /href/i.test(r))).toBe(true);
  });

  it('preserves a same-document fragment reference (#id) — no false positive', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<defs><rect id="r" width="5" height="5"/></defs>' +
      '<use href="#r" x="1"/><use xlink:href="#r" x="2"/></svg>';
    const { clean, removed } = sanitizeSvg(svg);

    expect(clean).toContain('href="#r"');
    expect(clean).toContain('<use');
    expect(removed).toEqual([]);
  });

  it('removes a <use> pointing at a remote SVG document', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<use href="http://evil.example.com/x.svg#a"/>' +
      '<rect width="5" height="5"/></svg>';
    const { clean, removed } = sanitizeSvg(svg);

    expect(clean).not.toContain('evil.example.com');
    expect(clean).toContain('<rect');
    expect(removed.length).toBeGreaterThan(0);
  });

  it('neutralizes a javascript: URI on <a href>', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<a href="javascript:window.__pwned=true"><rect width="5" height="5"/></a></svg>';
    const { clean, removed } = sanitizeSvg(svg);

    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toContain('__pwned');
    expect(removed.some((r) => /href/i.test(r))).toBe(true);
  });

  it('neutralizes a data: URI reference (no inline-document smuggling)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<image href="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg=="/>' +
      '<rect width="5" height="5"/></svg>';
    const { clean, removed } = sanitizeSvg(svg);

    expect(clean).not.toMatch(/data:/i);
    expect(clean).toContain('<rect');
    expect(removed.some((r) => /href/i.test(r))).toBe(true);
  });
});

describe('sanitizeSvg — removed[] accuracy', () => {
  it('reports every vector taken out of a multi-vector document and nothing benign', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="a()">' +
      '<script>b()</script>' +
      '<image href="http://evil.example.com/p.png"/>' +
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>' +
      '<rect width="5" height="5" onclick="c()"/></svg>';
    const { clean, removed } = sanitizeSvg(svg);

    // Output is clean of every vector.
    expect(clean).not.toMatch(/script|onload|onclick|foreignObject|evil\.example\.com/i);
    // Geometry preserved.
    expect(clean).toContain('<rect');

    // removed[] names each class of vector.
    expect(removed.some((r) => /script/i.test(r))).toBe(true);
    expect(removed.some((r) => /onload/i.test(r))).toBe(true);
    expect(removed.some((r) => /onclick/i.test(r))).toBe(true);
    expect(removed.some((r) => /foreignobject/i.test(r))).toBe(true);
    expect(removed.some((r) => /href/i.test(r))).toBe(true);
    // No wrapper-artifact noise leaks into the report.
    expect(removed.some((r) => /<body>|<html>|<head>/i.test(r))).toBe(false);
  });
});
