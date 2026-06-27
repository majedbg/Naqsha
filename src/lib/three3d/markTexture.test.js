import { describe, it, expect } from 'vitest';
import {
  shouldUseTextureMode,
  treatmentForProcess,
  buildPanelMarkSVGs,
  countSvgPaths,
  routePanelRenderModes,
  PATH_CAP,
  TEXTURE_DPR_FLOOR,
} from './markTexture.js';

// Relative luminance of an #rrggbb hex (Rec. 601) — used to assert the emissive
// depth ORDER (cut brightest > engrave > score).
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

  it('defaults safely with no args (treats as ribbon-eligible)', () => {
    expect(shouldUseTextureMode()).toBe(false);
  });
});

describe('treatmentForProcess — process → emissive treatment (D3)', () => {
  it('maps the depth scores score .45 / engrave .72 / cut .92', () => {
    expect(treatmentForProcess('score').intensity).toBeCloseTo(0.45, 5);
    expect(treatmentForProcess('engrave').intensity).toBeCloseTo(0.72, 5);
    expect(treatmentForProcess('cut').intensity).toBeCloseTo(0.92, 5);
  });

  it('uses the laser convention tints (cut≈red, score≈blue, engrave≈neutral)', () => {
    const cut = treatmentForProcess('cut').tint.toLowerCase();
    const score = treatmentForProcess('score').tint.toLowerCase();
    const engrave = treatmentForProcess('engrave').tint;
    // cut: red dominant
    expect(parseInt(cut.slice(1, 3), 16)).toBeGreaterThan(parseInt(cut.slice(5, 7), 16));
    // score: blue dominant
    expect(parseInt(score.slice(5, 7), 16)).toBeGreaterThan(parseInt(score.slice(1, 3), 16));
    // engrave: neutral (r≈g≈b), and NOT pure black (must be able to glow)
    const r = parseInt(engrave.slice(1, 3), 16);
    const g = parseInt(engrave.slice(3, 5), 16);
    const b = parseInt(engrave.slice(5, 7), 16);
    expect(Math.abs(r - g)).toBeLessThan(8);
    expect(Math.abs(g - b)).toBeLessThan(8);
    expect(r).toBeGreaterThan(40);
  });

  it('falls back to cut for an unknown / absent process', () => {
    expect(treatmentForProcess(undefined).process).toBe('cut');
    expect(treatmentForProcess('bogus').process).toBe('cut');
    expect(treatmentForProcess(null).process).toBe('cut');
  });
});

describe('treatmentForProcess — depth order on the intensity axis', () => {
  it('orders the emissive INTENSITY cut > engrave > score (the D3 depth promise,\n      carried on emissiveIntensity not on color luminance)', () => {
    expect(treatmentForProcess('cut').intensity)
      .toBeGreaterThan(treatmentForProcess('engrave').intensity);
    expect(treatmentForProcess('engrave').intensity)
      .toBeGreaterThan(treatmentForProcess('score').intensity);
  });

  it('keeps the tint vivid (full-strength hue), NOT dimmed by intensity', () => {
    // engrave is the dimmest groove (0.72) yet its tint stays near-white so the
    // hue is unmuddied — intensity lives on the plane, not the color.
    expect(lum(treatmentForProcess('engrave').tint)).toBeGreaterThan(200);
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

  it('carries the depth-score intensity per mark layer (cut .92 / engrave .72)', () => {
    const out = setup();
    expect(out['panel-0'][0].intensity).toBeCloseTo(0.92, 5);
    expect(out['panel-0'][1].intensity).toBeCloseTo(0.72, 5);
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

  it('strokes each mark layer in its VIVID process tint (not the raw op color)', () => {
    const out = setup();
    const cutLayer = out['panel-0'].find((m) => m.process === 'cut');
    expect(cutLayer.svg.toLowerCase()).toContain(treatmentForProcess('cut').tint.toLowerCase());
    expect(cutLayer.svg.toLowerCase()).not.toContain('#ff0000'); // raw op-cut color gone
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
