// @vitest-environment jsdom
//
// hybridClipMarkup — the string-surgery half of hybrid Sheet clipping (#73).
//
// The GEOMETRY half is entirely reused (extractRenderedPaths for final-space
// polylines, clipToSheet for the classification + trim); these tests pin the
// surgery contract: fully-inside drawables keep their source bytes, crossing
// drawables are replaced by clipped polyline fragments hoisted into Sheet
// space, fully-outside drawables vanish, and the crop count stamped on the
// fragment group equals clipToSheet's croppedPathCount (the Receipt's number).
//
// jsdom is REQUIRED: final-space extraction needs DOMParser (same rule as
// buildPlottableLayers).

import { describe, it, expect, vi } from 'vitest';
import { hybridClipMarkup } from './hybridClip.js';
import { extractRenderedPaths } from './pipeline.js';

const SHEET = { x: 0, y: 0, width: 100, height: 100 };

function assertWithinSheet(markup, eps = 0.01) {
  for (const p of extractRenderedPaths(markup)) {
    for (const [x, y] of p.points) {
      expect(x).toBeGreaterThanOrEqual(0 - eps);
      expect(x).toBeLessThanOrEqual(100 + eps);
      expect(y).toBeGreaterThanOrEqual(0 - eps);
      expect(y).toBeLessThanOrEqual(100 + eps);
    }
  }
}

describe('hybridClipMarkup — untouched cases', () => {
  it('a markup fully inside the Sheet is returned unchanged (same string)', () => {
    const markup = '<g id="a"><path d="M10,10 L50,50" stroke="#000" fill="none"/></g>';
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.changed).toBe(false);
    expect(out.markup).toBe(markup);
    expect(out.croppedPathCount).toBe(0);
    expect(out.droppedPathCount).toBe(0);
  });

  it('edge-aligned geometry is inside (inclusive Sheet boundary), not cropped', () => {
    const markup = '<g><path d="M0,0 L100,0 L100,100" stroke="#000"/></g>';
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.changed).toBe(false);
    expect(out.markup).toBe(markup);
  });

  it('a degenerate no-op path (<2 points) stays byte-stable even amid crops', () => {
    const markup =
      '<g><path d="" stroke="#000"/><path d="M50,50 L150,50" stroke="#000"/></g>';
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.changed).toBe(true);
    expect(out.croppedPathCount).toBe(1);
    expect(out.markup).toContain('<path d="" stroke="#000"/>');
  });
});

describe('hybridClipMarkup — crossing paths become clipped polyline fragments', () => {
  it('replaces the crossing element, carrying its non-geometry attrs forward', () => {
    const markup =
      '<g><path d="M50,50 L150,50" stroke="#0f0" stroke-width="2" data-role="cut"/></g>';
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.changed).toBe(true);
    expect(out.croppedPathCount).toBe(1);
    expect(out.droppedPathCount).toBe(0);
    expect(out.markup).not.toContain('M50,50 L150,50');
    // d replaced by the trimmed polyline; stroke-width and the fabrication
    // role survive (laser role export #68); fill="none" ensured for an open stroke.
    expect(out.markup).toContain(
      '<path d="M50.00,50.00 L100.00,50.00" stroke="#0f0" stroke-width="2" data-role="cut" fill="none"/>'
    );
    expect(out.markup).toContain('data-cropped-paths="1"');
  });

  it('a fragment of a path with INHERITED stroke gets the effective stroke color', () => {
    const markup = '<g stroke="#00f"><path d="M50,50 L150,50"/></g>';
    const out = hybridClipMarkup(markup, SHEET);
    // Hoisted out of the <g stroke> wrapper, the fragment must carry the
    // stroke it inherited or the file would fall back to SVG's default black.
    expect(out.markup).toContain(
      '<path d="M50.00,50.00 L100.00,50.00" stroke="#00f" fill="none"/>'
    );
  });

  it('one path crossing twice yields multiple fragments but counts ONCE', () => {
    // Out at x=100, back in at x=100 further down: two interior spans.
    const markup =
      '<g><path d="M50,10 L150,10 L150,20 L50,20" stroke="#000"/></g>';
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.croppedPathCount).toBe(1);
    expect(out.markup).toContain('M50.00,10.00 L100.00,10.00');
    expect(out.markup).toContain('M100.00,20.00 L50.00,20.00');
    expect(out.markup).toContain('data-cropped-paths="1"');
  });

  it('a clipped closed ring becomes OPEN fragments (no Z)', () => {
    const markup =
      '<g><path d="M50,50 L150,50 L150,80 L50,80 Z" stroke="#000"/></g>';
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.croppedPathCount).toBe(1);
    const frag = /<path d="([^"]*)"[^>]*data-|<g data-cropped-at-sheet/.test(out.markup);
    expect(frag).toBeTruthy();
    // The fragment path data carries no closure — a clipped ring is an open arc.
    const fragD = /data-cropped-paths="1">\s*<path d="([^"]*)"/.exec(out.markup);
    expect(fragD).toBeTruthy();
    expect(fragD[1]).not.toContain('Z');
    assertWithinSheet(out.markup);
  });

  it('clips in FINAL space: transforms are flattened into the fragment', () => {
    const markup =
      '<g><g transform="translate(80 0)"><path d="M0,10 L40,10" stroke="#000"/></g></g>';
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.croppedPathCount).toBe(1);
    // (80,10)→(120,10) in Sheet space, trimmed at the right edge.
    expect(out.markup).toContain('M80.00,10.00 L100.00,10.00');
    expect(out.markup).not.toContain('M0,10 L40,10');
    assertWithinSheet(out.markup);
  });
});

describe('hybridClipMarkup — <line>/<polyline> drawables', () => {
  it('a crossing <line> is replaced by a fragment <path> (geometry attrs stripped)', () => {
    const markup = '<g><line x1="90" y1="10" x2="150" y2="10" stroke="#000"/></g>';
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.croppedPathCount).toBe(1);
    expect(out.markup).not.toContain('<line');
    expect(out.markup).toContain(
      '<path d="M90.00,10.00 L100.00,10.00" stroke="#000" fill="none"/>'
    );
  });

  it('an inside <polyline> is untouched while a sibling path is cropped (alignment)', () => {
    const inside = '<polyline points="10,10 20,20 30,10" stroke="#000"/>';
    const markup = `<g>${inside}<path d="M50,50 L150,50" stroke="#000"/></g>`;
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.croppedPathCount).toBe(1);
    expect(out.markup).toContain(inside);
  });

  it('a malformed <line> (extraction skips it) does not derail alignment', () => {
    // No x2 → extractRenderedPaths skips it; the scanner must skip it too, or
    // every element after it would be paired with the wrong polyline.
    const bad = '<line x1="10" y1="10" stroke="#000"/>';
    const markup = `<g>${bad}<path d="M50,50 L150,50" stroke="#000"/></g>`;
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.croppedPathCount).toBe(1);
    expect(out.markup).toContain(bad); // not geometry — left alone
    expect(out.markup).toContain('M50.00,50.00 L100.00,50.00');
  });
});

describe('hybridClipMarkup — dropped (fully outside) paths', () => {
  it('removes them from the file without counting them as cropped', () => {
    const markup =
      '<g><path d="M10,10 L20,10" stroke="#000"/><path d="M200,200 L300,300" stroke="#000"/></g>';
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.changed).toBe(true);
    expect(out.croppedPathCount).toBe(0);
    expect(out.droppedPathCount).toBe(1);
    expect(out.markup).toContain('M10,10 L20,10'); // inside neighbor untouched
    expect(out.markup).not.toContain('M200,200');
    // Nothing was cropped, so there is no fragment group to stamp.
    expect(out.markup).not.toContain('data-cropped-paths');
  });
});

describe('hybridClipMarkup — defensive fallback and environment guard', () => {
  it('falls back to a full polyline clip when source scanning cannot align', () => {
    // A drawable inside an XML comment: DOMParser (extraction) ignores it, a
    // text scan would count it — alignment mismatch. The fallback replaces the
    // whole slot with clipped polylines: fidelity lost, honesty kept.
    const markup =
      '<g><!-- <path d="M0,0 L5,5"/> --><path d="M50,50 L150,50" stroke="#000"/></g>';
    const out = hybridClipMarkup(markup, SHEET);
    expect(out.changed).toBe(true);
    expect(out.croppedPathCount).toBe(1);
    expect(out.markup).toContain('data-cropped-paths="1"');
    expect(out.markup).toContain('M50.00,50.00 L100.00,50.00');
    assertWithinSheet(out.markup);
  });

  it('throws without DOMParser — never clips in the wrong coordinate space', () => {
    vi.stubGlobal('DOMParser', undefined);
    try {
      expect(() => hybridClipMarkup('<g/>', SHEET)).toThrow(/DOMParser/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
