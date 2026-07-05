// Role-based laser export for extracted patterns (issue #68, refs #48).
//
// An extracted pattern carries a per-path fabrication role (data-role ∈
// engrave|cut|score). Before this fix, laser export painted the WHOLE layer a
// single operation color, so LightBurn/Glowforge/xTool — which map operations
// BY COLOR — would cut every engrave/score detail. These tests assert the
// ACTUAL export output (through buildAllLayersSVG / buildLayerSVG, the real
// export functions), so they exercise the laser GATE, not just the renderer.

import { describe, it, expect } from 'vitest';
import { buildAllLayersSVG, buildLayerSVG } from './svgExport.js';
import { makeExtractedPattern } from './extraction/extractedPattern';
import { makeExtractedPatternClass } from './patterns/ExtractedPatternGenerator';
import { roleColor } from './fabrication.js';

const CUT = roleColor('cut'); // #FF0000
const SCORE = roleColor('score'); // #0000FF
const ENGRAVE = roleColor('engrave'); // #000000

// A tile carrying all three fabrication roles: engrave + cut on closed fills,
// score on an open centerline stroke.
function mixedEntity(over = {}) {
  return makeExtractedPattern({
    patternId: 'extracted-role-test',
    title: 'Mixed roles',
    tile: {
      width: 60,
      height: 40,
      fills: [
        { d: 'M20 10 L40 10 L40 30 L20 30 Z', role: 'engrave' },
        { d: 'M5 5 L9 5 L9 9 L5 9 Z', role: 'cut' },
      ],
      strokes: [{ d: 'M0 20 L60 20', role: 'score' }],
      ...over.tile,
    },
    ...over,
  });
}

// Instantiate a real extracted pattern instance placed on a canvas, exactly as
// useCanvas would before export.
function extractedInstance(entity, canvasW = 200, canvasH = 100) {
  const Cls = makeExtractedPatternClass(entity);
  const inst = new Cls();
  // _lastCx/_lastCy would normally be set by generateWithContext; the SVG
  // centering only needs them, so stub the canvas center directly.
  inst._lastCx = canvasW / 2;
  inst._lastCy = canvasH / 2;
  return inst;
}

// Pull the fill/stroke color of the <path> that carries a given data-role.
function colorForRole(svg, role) {
  const re = new RegExp(`<path[^>]*data-role="${role}"[^>]*>`);
  const tag = svg.match(re)?.[0] ?? '';
  // engrave/cut are filled (fill="..." stroke="none"); score is stroked
  // (fill="none" stroke="..."). Return whichever color attribute is painted.
  const fill = tag.match(/fill="([^"]+)"/)?.[1];
  const stroke = tag.match(/stroke="([^"]+)"/)?.[1];
  if (fill && fill !== 'none') return fill;
  return stroke;
}

describe('buildAllLayersSVG — extracted pattern laser role export (#68)', () => {
  const layer = {
    id: 'L1',
    visible: true,
    color: CUT, // Studio resolves the whole layer to its ONE operation color…
    opacity: 100,
    patternType: 'extracted-role-test',
  };

  it('colors each path BY ITS ROLE on the laser profile (not one color)', () => {
    const inst = extractedInstance(mixedEntity());
    const svg = buildAllLayersSVG([layer], { L1: inst }, 200, 100, false, {
      profileId: 'laser',
    });

    expect(colorForRole(svg, 'engrave')).toBe(ENGRAVE);
    expect(colorForRole(svg, 'cut')).toBe(CUT);
    expect(colorForRole(svg, 'score')).toBe(SCORE);
  });

  it('produces three DISTINCT export colors so the operator gets three mappable operations', () => {
    const inst = extractedInstance(mixedEntity());
    const svg = buildAllLayersSVG([layer], { L1: inst }, 200, 100, false, {
      profileId: 'laser',
    });
    const colors = new Set([
      colorForRole(svg, 'engrave'),
      colorForRole(svg, 'cut'),
      colorForRole(svg, 'score'),
    ]);
    expect(colors.size).toBe(3);
  });

  it('preserves data-role attributes alongside the role colors', () => {
    const inst = extractedInstance(mixedEntity());
    const svg = buildAllLayersSVG([layer], { L1: inst }, 200, 100, false, {
      profileId: 'laser',
    });
    expect(svg).toContain('data-role="engrave"');
    expect(svg).toContain('data-role="cut"');
    expect(svg).toContain('data-role="score"');
  });

  it('does NOT role-separate on a non-laser (plotter) profile — single color preserved', () => {
    const inst = extractedInstance(mixedEntity());
    const plotterLayer = { ...layer, color: '#123456' };
    const svg = buildAllLayersSVG([plotterLayer], { L1: inst }, 200, 100, false, {
      profileId: 'plotter',
    });
    // Every painted path uses the layer's own single color.
    expect(colorForRole(svg, 'engrave')).toBe('#123456');
    expect(colorForRole(svg, 'cut')).toBe('#123456');
    expect(colorForRole(svg, 'score')).toBe('#123456');
  });

  it('is byte-identical to the pre-fix single-color output when not on laser', () => {
    const inst = extractedInstance(mixedEntity());
    const plotterLayer = { ...layer, color: '#123456' };
    const withProfile = buildAllLayersSVG([plotterLayer], { L1: inst }, 200, 100, false, {
      profileId: 'plotter',
    });
    const noProfile = buildAllLayersSVG([plotterLayer], { L1: inst }, 200, 100, false, {});
    expect(withProfile).toBe(noProfile);
  });

  it('round-trip: flipping a path role engrave→cut changes that path export color', () => {
    const engraveInst = extractedInstance(mixedEntity());
    const svgEngrave = buildAllLayersSVG([layer], { L1: engraveInst }, 200, 100, false, {
      profileId: 'laser',
    });
    const first = svgEngrave.match(/<path[^>]*fill-rule="evenodd"[^>]*>/)?.[0] ?? '';
    expect(first).toContain('data-role="engrave"');
    expect(first).toContain(`fill="${ENGRAVE}"`);

    // The Review step flips the first fill's role engrave → cut.
    const flipped = mixedEntity({
      tile: {
        width: 60,
        height: 40,
        fills: [
          { d: 'M20 10 L40 10 L40 30 L20 30 Z', role: 'cut' },
          { d: 'M5 5 L9 5 L9 9 L5 9 Z', role: 'cut' },
        ],
        strokes: [{ d: 'M0 20 L60 20', role: 'score' }],
      },
    });
    const flippedInst = extractedInstance(flipped);
    const svgFlipped = buildAllLayersSVG([layer], { L1: flippedInst }, 200, 100, false, {
      profileId: 'laser',
    });
    const firstFlipped = svgFlipped.match(/<path[^>]*fill-rule="evenodd"[^>]*>/)?.[0] ?? '';
    expect(firstFlipped).toContain('data-role="cut"');
    expect(firstFlipped).toContain(`fill="${CUT}"`);
  });
});

describe('buildAllLayersSVG — role export survives lattice tiling (S5 branch, #68)', () => {
  // The originating artifact was a TILED jali. toSVGGroup has two branches
  // (single-tile and lattice); both route through the shared role-coloring
  // closure, so role separation must hold across every tiled copy.
  const LATTICE = {
    t1: [20, 0],
    t2: [0, 20],
    cell: { width: 20, height: 20 },
    type: 'square',
    confidence: 0.9,
  };
  const tiledEntity = () =>
    makeExtractedPattern({
      patternId: 'extracted-role-tiled',
      title: 'tiled roles',
      tile: {
        width: 20,
        height: 20,
        fills: [{ d: 'M4 4 L16 4 L16 16 L4 16 Z', role: 'engrave' }],
        strokes: [{ d: 'M0 10 L20 10', role: 'score' }],
      },
      lattice: LATTICE,
    });

  it('separates engrave/score colors on EVERY tiled copy on the laser profile', () => {
    const inst = extractedInstance(tiledEntity(), 60, 40);
    const layer = { id: 'T', visible: true, color: CUT, opacity: 100, patternType: 'extracted-role-tiled' };
    const svg = buildAllLayersSVG([layer], { T: inst }, 60, 40, false, { profileId: 'laser' });

    const engravePaths = [...svg.matchAll(/<path[^>]*data-role="engrave"[^>]*>/g)];
    const scorePaths = [...svg.matchAll(/<path[^>]*data-role="score"[^>]*>/g)];
    // 3 cols × 2 rows = 6 copies, each with one engrave fill + one score stroke.
    expect(engravePaths).toHaveLength(6);
    expect(scorePaths).toHaveLength(6);
    // Every copy is role-colored, not the single Cut layer color.
    expect(engravePaths.every((m) => m[0].includes(`fill="${ENGRAVE}"`))).toBe(true);
    expect(scorePaths.every((m) => m[0].includes(`stroke="${SCORE}"`))).toBe(true);
    expect(svg).not.toContain(`fill="${CUT}"`); // no path fell back to the layer color
  });
});

describe('buildLayerSVG — extracted pattern laser role export (#68)', () => {
  const layer = {
    id: 'L9',
    visible: true,
    color: CUT,
    opacity: 100,
    patternType: 'extracted-role-test',
  };

  it('role-separates a single-layer export on the laser profile', () => {
    const inst = extractedInstance(mixedEntity());
    const svg = buildLayerSVG(layer, inst, 200, 100, { profileId: 'laser' });
    expect(colorForRole(svg, 'engrave')).toBe(ENGRAVE);
    expect(colorForRole(svg, 'cut')).toBe(CUT);
    expect(colorForRole(svg, 'score')).toBe(SCORE);
  });

  it('keeps the single color on a non-laser single-layer export', () => {
    const inst = extractedInstance(mixedEntity());
    const svg = buildLayerSVG({ ...layer, color: '#abcdef' }, inst, 200, 100, {
      profileId: 'plotter',
    });
    expect(colorForRole(svg, 'engrave')).toBe('#abcdef');
    expect(colorForRole(svg, 'score')).toBe('#abcdef');
  });
});

describe('non-extracted layers are unaffected by the role branch (#68)', () => {
  it('a pattern instance without supportsRoleExport keeps the single layer color on laser', () => {
    // A minimal fake non-extracted pattern instance: single-color group, no
    // supportsRoleExport marker. Must export with the ONE operation color.
    const fakeInstance = {
      toSVGGroup: (id, color, opacity) =>
        `<g id="${id}" opacity="${(opacity ?? 100) / 100}"><path d="M0 0 L10 10" stroke="${color}" fill="none"/></g>`,
    };
    const layer = { id: 'P1', visible: true, color: CUT, opacity: 100, patternType: 'spiral' };
    const svg = buildAllLayersSVG([layer], { P1: fakeInstance }, 100, 100, false, {
      profileId: 'laser',
    });
    expect(svg).toContain(`stroke="${CUT}"`);
    // No role attributes injected for a non-extracted layer.
    expect(svg).not.toContain('data-role');
  });
});
