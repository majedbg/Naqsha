import { describe, it, expect } from 'vitest';
import {
  shouldUseTextureMode,
  reactionForProcess,
  buildPanelMarkSVGs,
  countSvgPaths,
  countSvgPoints,
  routePanelRenderModes,
  PATH_CAP,
  POINT_CAP,
  TEXTURE_DPR_FLOOR,
  PROCESS_ANNOTATION_HEX,
} from './markTexture.js';
// Substrate-aware reaction core (read-only here) — lets the substrate tests assert
// against the SAME source of truth markTexture consumes, rather than hardcoded hex.
import {
  materialSheetHex,
  reactionSurface,
  REACTION_OPACITY,
  KERF_TARGET,
} from '../materialReaction.js';

// Relative luminance of an #rrggbb hex (Rec. 601) — used to assert frost-vs-char
// directions on the reaction tints.
function lum(hex) {
  const h = hex.replace(/^#/, '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Minimal pattern instance: emits one <path> stroked in the layer's resolved color
// (matches buildAllLayersSVG's `instance.toSVGGroup(id, color, opacity)` call).
function fakeInstance() {
  return {
    toSVGGroup: (id, color) => `<g id="${id}"><path d="M0 0 L10 10" stroke="${color}"/></g>`,
  };
}

const OPERATIONS = [
  { id: 'op-cut', name: 'Cut', color: '#FF0000', process: 'cut' },
  { id: 'op-score', name: 'Score', color: '#0000FF', process: 'score' },
  { id: 'op-engrave', name: 'Engrave', color: '#000000', process: 'engrave' },
];

function panel(order, overrides = {}) {
  return { id: `panel-${order}`, visible: true, order, ...overrides };
}

describe('shouldUseTextureMode — D6 routing contract', () => {
  it('is FALSE for the common desktop case (high DPR, under cap)', () => {
    expect(shouldUseTextureMode({ pathCount: 10, isMobile: false, dpr: 2 })).toBe(false);
  });

  it('forces texture on mobile regardless of count/dpr', () => {
    expect(shouldUseTextureMode({ pathCount: 0, isMobile: true, dpr: 3 })).toBe(true);
  });

  it('forces texture below the DPR floor', () => {
    expect(shouldUseTextureMode({ pathCount: 0, dpr: TEXTURE_DPR_FLOOR - 0.01 })).toBe(true);
    expect(shouldUseTextureMode({ pathCount: 0, dpr: TEXTURE_DPR_FLOOR })).toBe(false);
  });

  it('forces texture strictly ABOVE the path cap', () => {
    expect(shouldUseTextureMode({ pathCount: PATH_CAP, dpr: 2 })).toBe(false); // at cap → ribbon-eligible
    expect(shouldUseTextureMode({ pathCount: PATH_CAP + 1, dpr: 2 })).toBe(true);
  });

  it('forces texture strictly ABOVE the vertex-density cap (single dense path)', () => {
    // A spirograph: ONE path (under PATH_CAP) but thousands of vertices — the
    // misclassification the density cap fixes.
    expect(shouldUseTextureMode({ pathCount: 1, pointCount: POINT_CAP, dpr: 2 })).toBe(false); // at cap → ribbon
    expect(shouldUseTextureMode({ pathCount: 1, pointCount: POINT_CAP + 1, dpr: 2 })).toBe(true);
  });

  it('defaults safely with no args (treats as ribbon-eligible)', () => {
    expect(shouldUseTextureMode()).toBe(false);
  });
});

describe('countSvgPoints — vertex-density proxy', () => {
  it('scores a dense single path far above a sparse one', () => {
    const sparse = '<svg><path d="M0 0 L10 10" stroke="#f00"/></svg>';
    const coords = Array.from({ length: 3000 }, (_, i) => `${i} ${i}`).join(' L');
    const dense = `<svg><path d="M${coords}" stroke="#f00"/></svg>`;
    expect(countSvgPaths(dense)).toBe(1); // one path element — count cap misses it
    expect(countSvgPoints(dense)).toBeGreaterThan(POINT_CAP);
    expect(countSvgPoints(sparse)).toBeLessThan(POINT_CAP);
  });

  it('is 0 for non-strings', () => {
    expect(countSvgPoints(null)).toBe(0);
    expect(countSvgPoints(undefined)).toBe(0);
  });
});

describe('routePanelRenderModes — density routing', () => {
  it('routes a single dense-path panel to TEXTURE (spirograph moiré fix)', () => {
    const coords = Array.from({ length: 3000 }, (_, i) => `${i} ${i}`).join(' L');
    const dense = { p1: [{ svg: `<svg><path d="M${coords}" stroke="#f00"/></svg>` }] };
    expect(routePanelRenderModes(dense, { isMobile: false, dpr: 2 }).p1).toBe('texture');
  });

  it('keeps a sparse panel on RIBBON', () => {
    const sparse = { p1: [{ svg: '<svg><path d="M0 0 L10 10" stroke="#f00"/></svg>' }] };
    expect(routePanelRenderModes(sparse, { isMobile: false, dpr: 2 }).p1).toBe('ribbon');
  });
});

describe('reactionForProcess — process → physical Reaction surface (ADR 0003)', () => {
  it('maps the presence opacities score .45 / engrave .8 / cut .92', () => {
    expect(reactionForProcess('score').opacity).toBeCloseTo(REACTION_OPACITY.score, 5);
    expect(reactionForProcess('engrave').opacity).toBeCloseTo(REACTION_OPACITY.engrave, 5);
    expect(reactionForProcess('cut').opacity).toBeCloseTo(REACTION_OPACITY.cut, 5);
  });

  it('never emits an annotation color — the hover palette is a separate export', () => {
    for (const p of ['cut', 'score', 'engrave']) {
      for (const sub of [undefined, { kind: 'acrylic', color: '#E6E954' }, { kind: 'plywood' }]) {
        const tint = reactionForProcess(p, sub).tint.toLowerCase();
        expect(tint).not.toBe(PROCESS_ANNOTATION_HEX.cut);
        expect(tint).not.toBe(PROCESS_ANNOTATION_HEX.score);
      }
    }
    // and the palette itself still carries the convention for the hover affordance
    expect(PROCESS_ANNOTATION_HEX.cut).toBe('#ff3b2f');
    expect(PROCESS_ANNOTATION_HEX.score).toBe('#3b7bff');
  });

  it('falls back to cut for an unknown / absent process', () => {
    expect(reactionForProcess(undefined).process).toBe('cut');
    expect(reactionForProcess('bogus').process).toBe('cut');
    expect(reactionForProcess(null).process).toBe('cut');
  });

  it('orders the PRESENCE cut > engrave > score (the depth promise, now carried\n      on opacity, not on any emissive axis)', () => {
    expect(reactionForProcess('cut').opacity)
      .toBeGreaterThan(reactionForProcess('engrave').opacity);
    expect(reactionForProcess('engrave').opacity)
      .toBeGreaterThan(reactionForProcess('score').opacity);
  });
});

describe('reactionForProcess — fluorescent groove glow (markGlow → emissiveIntensity)', () => {
  const SUB = { kind: 'acrylic', color: '#e6e954' };
  const FLUOR = { archetype: 'fluorescent-acrylic', markGlow: 1.2 };

  it('lights grooves on a fluorescent appearance: cut (kerf walls ≈ edges) ≥ engrave > score, all > 0', () => {
    const cut = reactionForProcess('cut', SUB, FLUOR).emissiveIntensity;
    const engrave = reactionForProcess('engrave', SUB, FLUOR).emissiveIntensity;
    const score = reactionForProcess('score', SUB, FLUOR).emissiveIntensity;
    expect(cut).toBeCloseTo(1.2, 5); // full escape: kerf walls are edge surfaces
    expect(cut).toBeGreaterThanOrEqual(engrave);
    expect(engrave).toBeGreaterThan(score);
    expect(score).toBeGreaterThan(0);
  });

  it('stays dark without a fluorescent appearance: no appearance, markGlow 0, and pen ink all → 0', () => {
    expect(reactionForProcess('engrave', SUB).emissiveIntensity).toBe(0);
    expect(reactionForProcess('engrave', SUB, null).emissiveIntensity).toBe(0);
    expect(reactionForProcess('engrave', SUB, { markGlow: 0 }).emissiveIntensity).toBe(0);
    expect(reactionForProcess('pen', SUB, FLUOR).emissiveIntensity).toBe(0);
  });

  it('scales linearly with markGlow (the calibration + glow-drive contract)', () => {
    const at1 = reactionForProcess('engrave', SUB, { markGlow: 1 }).emissiveIntensity;
    const at2 = reactionForProcess('engrave', SUB, { markGlow: 2 }).emissiveIntensity;
    expect(at2).toBeCloseTo(at1 * 2, 5);
  });
});

describe('reactionForProcess — substrate-aware reaction (3D mark surface)', () => {
  it('frosts a score/engrave on an ACRYLIC substrate toward a brightened hue of the\n      sheet (not convention blue)', () => {
    const sub = { kind: 'acrylic', color: '#E6E954' };
    const t = reactionForProcess('score', sub);
    const expected = reactionSurface(materialSheetHex(sub), 'lighten', 'score');
    expect(t.tint.toLowerCase()).toBe(expected.tint.toLowerCase());
    expect(t.tint.toLowerCase()).not.toBe('#3b7bff');
    expect(lum(t.tint)).toBeGreaterThan(lum('#E6E954')); // frost is LIGHTER than the sheet
    expect(t.opacity).toBeCloseTo(REACTION_OPACITY.score, 5);
  });

  it('renders a CUT on acrylic as the kerf-thin dark seam, not a frost', () => {
    const t = reactionForProcess('cut', { kind: 'acrylic', color: '#E6E954' });
    expect(t.tint).toBe(KERF_TARGET);
    expect(lum(t.tint)).toBeLessThan(40);
    expect(t.opacity).toBeCloseTo(REACTION_OPACITY.cut, 5);
  });

  it('chars a cut on a WOOD substrate DARK and WARM, full presence (matte lives on\n      the mark material roughness, no intensity damping axis anymore)', () => {
    const sub = { kind: 'plywood', color: '#6B4A2B' };
    const t = reactionForProcess('cut', sub);
    expect(t.tint.toLowerCase()).toBe(
      reactionSurface(materialSheetHex(sub), 'burn', 'cut').tint.toLowerCase(),
    );
    expect(lum(t.tint)).toBeLessThan(lum('#6B4A2B'));
    expect(t.opacity).toBeCloseTo(REACTION_OPACITY.cut, 5);
  });

  it('chars other/absent/unrecognized substrates on the NEUTRAL sheet — the laser\n      convention no longer exists in the 3D mark path', () => {
    for (const sub of [undefined, { kind: 'cardstock' }, { kind: 'mystery-foam' }]) {
      const t = reactionForProcess('cut', sub);
      expect(t.tint.toLowerCase()).toBe(
        reactionSurface(materialSheetHex(sub || {}), 'other', 'cut').tint.toLowerCase(),
      );
      expect(lum(t.tint)).toBeLessThan(lum(materialSheetHex({}))); // darker than the sheet
    }
  });

  it('keeps PEN as substrate-independent ink (L7: ink sits ON the surface, it is\n      not a reacting groove)', () => {
    const onAcrylic = reactionForProcess('pen', { kind: 'acrylic', color: '#E6E954' });
    const onWood = reactionForProcess('pen', { kind: 'walnut' });
    const bare = reactionForProcess('pen');
    expect(onAcrylic.tint).toBe(bare.tint);
    expect(onWood.tint).toBe(bare.tint);
    expect(onAcrylic.opacity).toBeCloseTo(bare.opacity, 5);
  });
});

describe('countSvgPaths', () => {
  it('counts <path element opens', () => {
    expect(countSvgPaths('<path d="a"/><path d="b"/><rect/>')).toBe(2);
    expect(countSvgPaths('<rect/>')).toBe(0);
    expect(countSvgPaths(null)).toBe(0);
  });
});

describe('routePanelRenderModes — D6 per-panel ribbon/texture routing (S10)', () => {
  // Build a panel's mark-layer list whose total <path> count is `n`.
  const layersWithPaths = (n) => [{ svg: '<path/>'.repeat(n) }];

  it('routes a small desktop panel to RIBBON (under cap, high DPR)', () => {
    const out = routePanelRenderModes({ p: layersWithPaths(10) }, { dpr: 2 });
    expect(out.p).toBe('ribbon');
  });

  it('routes a panel strictly ABOVE the cap to TEXTURE', () => {
    const at = routePanelRenderModes({ p: layersWithPaths(PATH_CAP) }, { dpr: 2 });
    const over = routePanelRenderModes({ p: layersWithPaths(PATH_CAP + 1) }, { dpr: 2 });
    expect(at.p).toBe('ribbon'); // at cap → still ribbon-eligible
    expect(over.p).toBe('texture');
  });

  it('sums path count ACROSS a panel\'s per-process layers when applying the cap', () => {
    // two layers, neither over cap alone, but together exceed it → texture.
    const out = routePanelRenderModes(
      { p: [{ svg: '<path/>'.repeat(800) }, { svg: '<path/>'.repeat(800) }] },
      { dpr: 2 },
    );
    expect(out.p).toBe('texture');
  });

  it('forces TEXTURE on mobile and below the DPR floor regardless of count', () => {
    expect(routePanelRenderModes({ p: layersWithPaths(1) }, { isMobile: true }).p).toBe('texture');
    expect(
      routePanelRenderModes({ p: layersWithPaths(1) }, { dpr: TEXTURE_DPR_FLOOR - 0.01 }).p,
    ).toBe('texture');
  });

  it('keeps <line>/<polyline>-only marks (0 <path>s) ribbon-eligible', () => {
    const out = routePanelRenderModes(
      { p: [{ svg: '<line/><line/><polyline/>' }] },
      { dpr: 2 },
    );
    expect(out.p).toBe('ribbon');
  });

  it('routes EACH panel independently and keys by panelId', () => {
    const out = routePanelRenderModes(
      { small: layersWithPaths(5), huge: layersWithPaths(PATH_CAP + 1) },
      { dpr: 2 },
    );
    expect(out).toEqual({ small: 'ribbon', huge: 'texture' });
  });

  it('tolerates null/empty/malformed input without throwing', () => {
    expect(routePanelRenderModes()).toEqual({});
    expect(routePanelRenderModes(null)).toEqual({});
    expect(routePanelRenderModes({ p: null }, { dpr: 2 })).toEqual({ p: 'ribbon' });
    expect(routePanelRenderModes({ p: [{}] }, { dpr: 2 })).toEqual({ p: 'ribbon' });
  });
});

describe('buildPanelMarkSVGs — per-panel, per-process mark layers', () => {
  const W = 200;
  const H = 150;

  function setup(overrides = {}) {
    const panels = [panel(0), panel(1)];
    const layers = [
      { id: 'l-cut', panelId: 'panel-0', visible: true, operationId: 'op-cut', opacity: 100 },
      { id: 'l-engrave', panelId: 'panel-0', visible: true, operationId: 'op-engrave', opacity: 100 },
      { id: 'l-score', panelId: 'panel-1', visible: true, operationId: 'op-score', opacity: 100 },
      { id: 'l-hidden', panelId: 'panel-0', visible: false, operationId: 'op-cut', opacity: 100 },
    ];
    const patternInstances = {
      'l-cut': fakeInstance(),
      'l-engrave': fakeInstance(),
      'l-score': fakeInstance(),
      'l-hidden': fakeInstance(),
    };
    return buildPanelMarkSVGs({
      panels, layers, operations: OPERATIONS, patternInstances, canvasW: W, canvasH: H, ...overrides,
    });
  }

  it('emits one entry per visible panel, keyed by panelId', () => {
    const out = setup();
    expect(Object.keys(out).sort()).toEqual(['panel-0', 'panel-1']);
  });

  it('splits a panel into one mark layer per process, ordered cut → engrave → score', () => {
    const out = setup();
    expect(out['panel-0'].map((m) => m.process)).toEqual(['cut', 'engrave']);
    expect(out['panel-1'].map((m) => m.process)).toEqual(['score']);
  });

  it('carries the presence opacity per mark layer (cut .92 / engrave .8)', () => {
    const out = setup();
    expect(out['panel-0'][0].opacity).toBeCloseTo(REACTION_OPACITY.cut, 5);
    expect(out['panel-0'][1].opacity).toBeCloseTo(REACTION_OPACITY.engrave, 5);
  });

  it('puts only that process OWN visible layers in each mark-layer SVG', () => {
    const out = setup();
    const cutLayer = out['panel-0'].find((m) => m.process === 'cut');
    const engraveLayer = out['panel-0'].find((m) => m.process === 'engrave');
    expect(cutLayer.svg).toContain('id="l-cut"');
    expect(cutLayer.svg).not.toContain('id="l-engrave"');
    expect(engraveLayer.svg).toContain('id="l-engrave"');
    // hidden + other-panel layers never appear.
    expect(cutLayer.svg).not.toContain('id="l-hidden"');
    expect(cutLayer.svg).not.toContain('id="l-score"');
  });

  it('strokes each mark layer in its REACTION tint (not the raw op color, not an\n      annotation color)', () => {
    const out = setup();
    const cutLayer = out['panel-0'].find((m) => m.process === 'cut');
    expect(cutLayer.svg.toLowerCase()).toContain(reactionForProcess('cut').tint.toLowerCase());
    expect(cutLayer.svg.toLowerCase()).not.toContain('#ff0000'); // raw op-cut color gone
    expect(cutLayer.svg.toLowerCase()).not.toContain(PROCESS_ANNOTATION_HEX.cut); // no annotation red
  });

  it('has a TRANSPARENT background (the white bg rect is stripped — D12)', () => {
    const out = setup();
    expect(out['panel-0'][0].svg).not.toContain('fill="white"');
  });

  it('neutralizes a layer background so it cannot bake a glowing block (D12)', () => {
    const panels = [panel(0)];
    const layers = [{
      id: 'l-bg', panelId: 'panel-0', visible: true, operationId: 'op-cut', opacity: 100,
      bgColor: '#123456', bgOpacity: 80,
    }];
    const out = buildPanelMarkSVGs({
      panels, layers, operations: OPERATIONS,
      patternInstances: { 'l-bg': fakeInstance() }, canvasW: W, canvasH: H,
    });
    expect(out['panel-0'][0].svg).not.toContain('#123456');
  });

  it('omits hidden panels entirely', () => {
    const out = buildPanelMarkSVGs({
      panels: [panel(0), panel(1, { visible: false })],
      layers: [{ id: 'l-cut', panelId: 'panel-1', visible: true, operationId: 'op-cut', opacity: 100 }],
      operations: OPERATIONS,
      patternInstances: { 'l-cut': fakeInstance() },
      canvasW: W, canvasH: H,
    });
    expect(Object.keys(out)).toEqual(['panel-0']);
    expect(out['panel-0']).toEqual([]); // visible panel, no layers → no mark layers
  });

  it('returns {} for null / empty inputs and does not throw', () => {
    expect(buildPanelMarkSVGs()).toEqual({});
    expect(buildPanelMarkSVGs({ panels: null, layers: null })).toEqual({});
    expect(buildPanelMarkSVGs({ panels: [], layers: [] })).toEqual({});
  });

  it('frosts an ACRYLIC-substrate panel\'s engraving and seams its cut kerf-dark\n      (no convention red/blue anywhere) — behavior 5', () => {
    const sub = { kind: 'acrylic', color: '#E6E954' };
    const out = buildPanelMarkSVGs({
      panels: [panel(0, { substrate: sub })],
      layers: [
        { id: 'l-cut', panelId: 'panel-0', visible: true, operationId: 'op-cut', opacity: 100 },
        { id: 'l-engrave', panelId: 'panel-0', visible: true, operationId: 'op-engrave', opacity: 100 },
      ],
      operations: OPERATIONS,
      patternInstances: { 'l-cut': fakeInstance(), 'l-engrave': fakeInstance() },
      canvasW: W, canvasH: H,
    });
    const cut = out['panel-0'].find((m) => m.process === 'cut');
    const engrave = out['panel-0'].find((m) => m.process === 'engrave');
    // engrave frosts to the hue-preserving brightened sheet…
    const frost = reactionSurface(materialSheetHex(sub), 'lighten', 'engrave').tint;
    expect(engrave.tint.toLowerCase()).toBe(frost.toLowerCase());
    expect(engrave.svg.toLowerCase()).toContain(frost.toLowerCase());
    expect(lum(engrave.tint)).toBeGreaterThan(lum('#E6E954'));
    // …while the cut is the kerf-thin dark seam
    expect(cut.tint).toBe(KERF_TARGET);
    // convention tints absent from both surfaces
    for (const m of [cut, engrave]) {
      expect(m.svg.toLowerCase()).not.toContain('#ff3b2f');
      expect(m.svg.toLowerCase()).not.toContain('#3b7bff');
    }
  });

  it('chars a WOOD-substrate panel\'s marks DARK and WARM at full presence —\n      behavior 6', () => {
    const sub = { kind: 'plywood', color: '#6B4A2B' };
    const out = buildPanelMarkSVGs({
      panels: [panel(0, { substrate: sub })],
      layers: [{ id: 'l-cut', panelId: 'panel-0', visible: true, operationId: 'op-cut', opacity: 100 }],
      operations: OPERATIONS,
      patternInstances: { 'l-cut': fakeInstance() },
      canvasW: W, canvasH: H,
    });
    const char = reactionSurface(materialSheetHex(sub), 'burn', 'cut').tint;
    const mark = out['panel-0'][0];
    expect(mark.tint.toLowerCase()).toBe(char.toLowerCase());
    expect(mark.svg.toLowerCase()).toContain(char.toLowerCase());
    expect(lum(mark.tint)).toBeLessThan(lum('#6B4A2B')); // darker than the sheet
    expect(mark.opacity).toBeCloseTo(REACTION_OPACITY.cut, 5);
    expect(mark.svg.toLowerCase()).not.toContain('#ff3b2f');
  });

  it('chars an absent/other-substrate panel on the neutral sheet — the convention\n      output is GONE from the 3D path — behavior 7', () => {
    const out = buildPanelMarkSVGs({
      // panel-0: no substrate at all; panel-1: an 'other' (cardstock) substrate.
      panels: [panel(0), panel(1, { substrate: { kind: 'cardstock' } })],
      layers: [
        { id: 'l-cut', panelId: 'panel-0', visible: true, operationId: 'op-cut', opacity: 100 },
        { id: 'l-cut2', panelId: 'panel-1', visible: true, operationId: 'op-cut', opacity: 100 },
      ],
      operations: OPERATIONS,
      patternInstances: { 'l-cut': fakeInstance(), 'l-cut2': fakeInstance() },
      canvasW: W, canvasH: H,
    });
    for (const id of ['panel-0', 'panel-1']) {
      const mark = out[id][0];
      expect(mark.tint).toBe(reactionForProcess('cut').tint);
      expect(mark.opacity).toBeCloseTo(REACTION_OPACITY.cut, 5);
      expect(mark.svg.toLowerCase()).not.toContain('#ff3b2f');
      expect(lum(mark.tint)).toBeLessThan(lum(materialSheetHex({})));
    }
  });

  it('does not throw on a deep-frozen snapshot (panels/layers frozen)', () => {
    const panels = [Object.freeze(panel(0))];
    Object.freeze(panels);
    const layers = [Object.freeze({ id: 'l-cut', panelId: 'panel-0', visible: true, operationId: 'op-cut', opacity: 100 })];
    Object.freeze(layers);
    expect(() =>
      buildPanelMarkSVGs({
        panels, layers, operations: OPERATIONS,
        patternInstances: { 'l-cut': fakeInstance() }, canvasW: W, canvasH: H,
      }),
    ).not.toThrow();
  });
});
