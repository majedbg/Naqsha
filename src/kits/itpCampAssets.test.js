// Unit tests for ITP Camp asset preprocessing (issue #18, Lane C / C9).
//
// The staged logo SVGs carry <clipPath> defs whose <path> elements would
// otherwise be picked up by svgImport's tolerant regex as drawable artwork.
// prepareAssetSvg strips <defs>…</defs> so only the real drawing paths survive,
// and the result still parses through the SHARED import path (svgImport).

import { describe, it, expect } from 'vitest';
import { parseSVGImport } from '../lib/svgImport.js';
import { prepareAssetSvg, itpLogoSvg, itpLogoFlippedSvg } from './itpCampAssets.js';

// The two clip-rect `d` values that live inside <clipPath> defs in both logos —
// these must NOT appear as drawable artwork after preprocessing.
const CLIP_D_A = 'M 14 336 L 1439.375 336 L 1439.375 976.523438 L 14 976.523438 Z';
const CLIP_D_B = 'M 0.0273438 0 L 1429 0 L 1429 921 L 0.0273438 921 Z';

describe('prepareAssetSvg (clipPath stripping)', () => {
  it('strips <defs> so clipPath-def paths are not treated as artwork', () => {
    const cleaned = prepareAssetSvg(itpLogoSvg);
    expect(cleaned).not.toMatch(/<defs/i);
    expect(cleaned).not.toContain('clipPath');
    // The real first drawing path survives verbatim.
    expect(cleaned).toContain('M 1439.378906 416.570312');
  });

  it('produces import data with the drawing paths and WITHOUT the clip rects', () => {
    const cleaned = prepareAssetSvg(itpLogoSvg);
    const result = parseSVGImport(cleaned);
    expect(result.ok).toBe(true);
    // The first real drawing outline is present.
    const joined = result.paths.join(' || ');
    expect(joined).toContain('M 1439.378906 416.570312');
    // Neither clip-rect outline is present (they were inside <defs>).
    expect(joined).not.toContain(CLIP_D_A);
    expect(joined).not.toContain(CLIP_D_B);
  });

  it('strips clipPath defs from the flipped logo too', () => {
    const cleaned = prepareAssetSvg(itpLogoFlippedSvg);
    const result = parseSVGImport(cleaned);
    expect(result.ok).toBe(true);
    const joined = result.paths.join(' || ');
    expect(joined).not.toContain(CLIP_D_A);
    expect(joined).not.toContain(CLIP_D_B);
    expect(joined).toContain('M 1439.378906 416.570312');
  });

  it('without preprocessing, the raw logo WOULD leak clip-rect paths (guard rationale)', () => {
    // This documents WHY preprocessing is needed: the raw SVG leaks clip paths.
    const raw = parseSVGImport(itpLogoSvg);
    expect(raw.ok).toBe(true);
    expect(raw.paths.join(' || ')).toContain(CLIP_D_A);
  });
});
