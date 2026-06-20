// @vitest-environment jsdom
//
// buildSubmissionSvg — the studio→org adapter (the deferred "Submit to org" seam).
// It turns the live studio layers into a submission-ready SVG whose layer groups
// carry data-role="cut|score|engrave" (so extractOps({source:'design'}) yields one
// op per layer) and whose inner strokes follow the cut/score/engrave (LightBurn)
// convention colors — NOT arbitrary display colors. pen/unresolved layers are
// dropped (a laser-cut submission can't represent them).

import { describe, it, expect } from 'vitest';
import { buildSubmissionSvg, partitionSubmittableLayers } from './buildSubmissionSvg';
import { extractOps } from './extractOps';
import { sanitizeSvg } from './sanitizeSvg';
import { seedOperations } from '../operations';

const OPS = seedOperations(); // op-cut(#FF0000) / op-score(#0000FF) / op-engrave(#000000)

// A fake pattern instance whose toSVGGroup mirrors the real wrapSVGSymmetry output:
// a `<g id="layer-<id>">` wrapper around an inner <path> stroked with the color it
// is handed (which the adapter sets to the operation color via recolor).
function fakeInstance() {
  return {
    toSVGGroup(layerId, color) {
      return `  <g id="layer-${layerId}">\n    <g><path d="M0 0 L10 10" stroke="${color}"/></g>\n  </g>`;
    },
  };
}

function makeFixture(layers) {
  const patternInstances = {};
  for (const l of layers) patternInstances[l.id] = fakeInstance();
  return { patternInstances };
}

describe('partitionSubmittableLayers', () => {
  it('keeps visible cut/score/engrave layers; drops pen + unresolved; ignores hidden', () => {
    const layers = [
      { id: 'a', visible: true, color: '#111', operationId: 'op-cut' },
      { id: 'b', visible: true, color: '#222', operationId: 'op-score' },
      { id: 'c', visible: true, color: '#333', operationId: 'op-pen-1' }, // unresolved → drop
      { id: 'd', visible: false, color: '#444', operationId: 'op-cut' },  // hidden → neither
    ];
    const ops = [...OPS, { id: 'op-pen-1', name: 'Pen', color: '#0f0', process: 'pen' }];

    const { submit, dropped } = partitionSubmittableLayers(layers, ops);

    expect(submit.map((l) => l.id)).toEqual(['a', 'b']);
    // 'c' is visible but pen → warn-worthy drop; 'd' is hidden → silently excluded.
    expect(dropped.map((l) => l.id)).toEqual(['c']);
  });
});

describe('buildSubmissionSvg', () => {
  it('tags each submittable layer group with data-role = its operation process', () => {
    const layers = [
      { id: 'a', visible: true, color: '#abcabc', operationId: 'op-cut' },
      { id: 'b', visible: true, color: '#abcabc', operationId: 'op-score' },
    ];
    const { patternInstances } = makeFixture(layers);

    const svg = buildSubmissionSvg(layers, patternInstances, 100, 50, OPS);

    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementById('layer-a').getAttribute('data-role')).toBe('cut');
    expect(doc.getElementById('layer-b').getAttribute('data-role')).toBe('score');
  });

  it('recolors inner strokes to the operation convention color (not the display color)', () => {
    // display color is purple; the cut op convention is red, score is blue.
    const layers = [
      { id: 'a', visible: true, color: '#purple', operationId: 'op-cut' },
      { id: 'b', visible: true, color: '#purple', operationId: 'op-score' },
    ];
    const { patternInstances } = makeFixture(layers);

    const svg = buildSubmissionSvg(layers, patternInstances, 100, 50, OPS);

    expect(svg).toMatch(/stroke="#FF0000"/); // cut → red
    expect(svg).toMatch(/stroke="#0000FF"/); // score → blue
    expect(svg).not.toMatch(/#purple/);      // display color never leaks through
  });

  it('end-to-end: extractOps(source:design) derives exactly the cut+score ops from the result', () => {
    const layers = [
      { id: 'a', visible: true, color: '#000', operationId: 'op-cut' },
      { id: 'b', visible: true, color: '#000', operationId: 'op-score' },
    ];
    const { patternInstances } = makeFixture(layers);

    const svg = buildSubmissionSvg(layers, patternInstances, 100, 50, OPS);
    const ops = extractOps(svg, { source: 'design' });

    expect(ops.map((o) => o.defaultOp).sort()).toEqual(['cut', 'score']);
    expect(ops.map((o) => o.key).sort()).toEqual(['layer-a', 'layer-b']);
  });

  it('drops pen + hidden layers: no group, and extractOps yields no row for them', () => {
    const ops = [...OPS, { id: 'op-pen-1', name: 'Pen', color: '#0f0', process: 'pen' }];
    const layers = [
      { id: 'keep', visible: true, color: '#000', operationId: 'op-cut' },
      { id: 'pen', visible: true, color: '#000', operationId: 'op-pen-1' },
      { id: 'hidden', visible: false, color: '#000', operationId: 'op-cut' },
    ];
    const { patternInstances } = makeFixture(layers);

    const svg = buildSubmissionSvg(layers, patternInstances, 100, 50, ops);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');

    expect(doc.getElementById('layer-keep')).not.toBeNull();
    expect(doc.getElementById('layer-pen')).toBeNull();
    expect(doc.getElementById('layer-hidden')).toBeNull();

    const derived = extractOps(svg, { source: 'design' });
    expect(derived.map((o) => o.key)).toEqual(['layer-keep']);
  });

  it('strips the canvas background fills (no sheet-spanning rect leaks into the submission)', () => {
    // buildAllLayersSVG prepends a full-bleed <rect fill="white"> as a direct
    // child of <svg>. Left in, composeSheet would stamp a sheet-sized white fill
    // per placed piece. The adapter must drop direct-child rects but keep real
    // geometry rects nested inside layer groups.
    const layers = [{ id: 'a', visible: true, color: '#000', operationId: 'op-cut' }];
    const patternInstances = {
      a: {
        toSVGGroup(layerId, color) {
          // a group containing a NESTED rect (real geometry) — must survive
          return `  <g id="layer-${layerId}"><rect x="1" y="1" width="2" height="2" stroke="${color}" fill="none"/></g>`;
        },
      },
    };

    const svg = buildSubmissionSvg(layers, patternInstances, 100, 50, OPS);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');

    // no direct-child rect (the white bg fill is gone)
    expect(doc.querySelector('svg > rect')).toBeNull();
    expect(svg).not.toMatch(/fill="white"/);
    // the layer's own nested geometry rect is untouched
    expect(doc.querySelector('#layer-a rect')).not.toBeNull();
  });

  it('integration: adapter output survives sanitizeSvg and still yields the design ops', () => {
    // Closes the adapter → sanitize → extractOps round trip (each half is tested
    // separately; this exercises the real serializer output through DOMPurify).
    const layers = [
      { id: 'a', visible: true, color: '#000', operationId: 'op-cut' },
      { id: 'b', visible: true, color: '#000', operationId: 'op-score' },
    ];
    const { patternInstances } = makeFixture(layers);

    const svg = buildSubmissionSvg(layers, patternInstances, 100, 50, OPS);
    const { clean } = sanitizeSvg(svg);
    const ops = extractOps(clean, { source: 'design' });

    expect(ops.map((o) => o.defaultOp).sort()).toEqual(['cut', 'score']);
  });

  it('returns a valid svg even when nothing is submittable (no roles, no crash)', () => {
    const ops = [{ id: 'op-pen-1', name: 'Pen', color: '#0f0', process: 'pen' }];
    const layers = [{ id: 'p', visible: true, color: '#000', operationId: 'op-pen-1' }];
    const { patternInstances } = makeFixture(layers);

    const svg = buildSubmissionSvg(layers, patternInstances, 100, 50, ops);

    expect(svg).toMatch(/<svg/);
    expect(extractOps(svg, { source: 'design' })).toEqual([]);
  });
});
